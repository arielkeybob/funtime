const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDrinkCopies, buildDrinkCopyPayload, readDrinkCopy, DRINK_COPY_TTL_MS } = require('../src/data/drink-copies.js');

const EU = 'uid-ana';
const BIA = 'uid-bia';
const CAIO = 'uid-caio';
const AGORA = 10_000_000;

// Mesmo desenho do Firestore falso de share-writer.test.cjs: fora de users/**, a regra lê
// resource.data, então documento inexistente faz o SDK rejeitar em vez de devolver vazio.
function fakeFirestore({ documentos = {}, commitFalha = () => null, segurarCommit = false } = {}) {
  const escritas = [];
  const exclusoes = [];
  const commits = [];

  const module = {
    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
    getFirestore: () => ({}),
    serverTimestamp: () => '__serverTimestamp__',
    Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) },
    doc: (db, ...path) => ({ path: path.join('/') }),
    collection: (db, ...path) => ({ path: path.join('/') }),
    query: (reference, ...restricoes) => ({ path: reference.path, restricoes }),
    where: (campo, operador, valor) => ({ campo, operador, valor }),
    getDoc: async (reference) => {
      if (reference.path in documentos) return { exists: () => true, data: () => documentos[reference.path] };
      if (!reference.path.startsWith('users/')) {
        const erro = new Error('permission-denied'); erro.code = 'permission-denied'; throw erro;
      }
      return { exists: () => false, data: () => undefined };
    },
    getDocs: async (consulta) => ({
      docs: Object.entries(documentos)
        .filter(([path]) => path.startsWith(consulta.path + '/'))
        .map(([path, data]) => ({ id: path.split('/').pop(), data: () => data, ref: { path } })),
    }),
    setDoc: async (reference, data) => { escritas.push({ path: reference.path, data }); },
    updateDoc: async (reference, data) => { escritas.push({ path: reference.path, data, update: true }); },
    deleteDoc: async (reference) => { exclusoes.push(reference.path); },
    writeBatch: () => {
      const operacoes = [];
      return {
        set: (reference, data) => operacoes.push({ path: reference.path, data }),
        update: (reference, data) => operacoes.push({ path: reference.path, data, update: true }),
        commit: () => {
          const falha = commitFalha(operacoes);
          if (falha) return Promise.reject(falha);
          commits.push(operacoes);
          for (const operacao of operacoes) escritas.push(operacao);
          return segurarCommit ? new Promise(() => {}) : Promise.resolve();
        },
      };
    },
  };

  return { module, escritas, exclusoes, commits, documentos };
}

function setup({ documentos, now = () => AGORA, commitFalha, segurarCommit, onIncomingChange = () => {} } = {}) {
  const firestore = fakeFirestore({ documentos, commitFalha, segurarCommit });
  const copies = createDrinkCopies({
    app: {}, uid: EU, importModule: async () => firestore.module, now, onIncomingChange,
    schedule: (fn) => setTimeout(fn, 0), cancel: clearTimeout,
  });
  return { copies, firestore };
}

const par = (otherUid, extra = {}) => ({ otherUid, alias: otherUid, drinkCopyFromOther: null, drinkCopyFromMe: null, ...extra });
const bebida = (extra = {}) => ({ id: 'drink-1', name: 'Água', icon: '💧', intervalMinutes: 30, askDoseSize: false, createdAt: 1, sortOrder: 3, ...extra });
const esperar = () => new Promise((resolve) => setTimeout(resolve, 5));

// O que sai do aparelho: só a lista, sem nada que identifique bebida local ou histórico.
test('PRIVACIDADE: a cópia leva só nome, ícone, intervalo e "perguntar o tamanho"', () => {
  const payload = buildDrinkCopyPayload([bebida(), bebida({ id: 'drink-2', name: 'Café', askDoseSize: 1 })]);

  assert.deepEqual(payload, [
    { name: 'Água', icon: '💧', intervalMinutes: 30, askDoseSize: false },
    { name: 'Café', icon: '💧', intervalMinutes: 30, askDoseSize: true },
  ]);
  assert.ok(!/drink-1|drink-2|createdAt|sortOrder/.test(JSON.stringify(payload)));
});

test('enviar grava a cópia com id fixo por direção e marca o horário no próprio ponteiro', async () => {
  const { copies, firestore } = setup();

  const resultado = await copies.send({ toUids: [BIA, CAIO, BIA, EU], drinks: [bebida()] });

  assert.deepEqual(resultado, { sentAtMs: AGORA, state: 'ack', failed: [] });
  assert.equal(firestore.commits.length, 2, 'um lote por amigo, sem duplicata nem envio para si');

  const copia = firestore.escritas.find((item) => item.path === `drinkCopies/${EU}_${BIA}`);
  assert.deepEqual(Object.keys(copia.data).sort(), ['createdAt', 'drinkCount', 'drinks', 'expiresAt', 'formatVersion', 'fromUid', 'toUid']);
  assert.equal(copia.data.fromUid, EU);
  assert.equal(copia.data.toUid, BIA);
  assert.equal(copia.data.drinkCount, 1);
  assert.equal(copia.data.expiresAt.toMillis(), AGORA + DRINK_COPY_TTL_MS);

  const ponteiro = firestore.escritas.find((item) => item.path === `pairings/${EU}_${BIA}` && item.update);
  assert.deepEqual(ponteiro.data, { [`drinkCopies.${EU}`]: AGORA }, 'só a minha chave');
});

test('sem bebidas, nada é enviado', async () => {
  const { copies, firestore } = setup();

  await assert.rejects(copies.send({ toUids: [BIA], drinks: [] }));
  assert.equal(firestore.commits.length, 0);
});

test('uma amizade negada pelas regras não derruba os outros envios', async () => {
  const negado = Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  const { copies, firestore } = setup({ commitFalha: (operacoes) => (operacoes[0].path.endsWith(CAIO) ? negado : null) });

  const resultado = await copies.send({ toUids: [BIA, CAIO], drinks: [bebida()] });

  assert.deepEqual(resultado.failed, [CAIO]);
  assert.equal(firestore.commits.length, 1);
});

// Offline o SDK só resolve quando o servidor confirma: a tela não pode ficar presa.
test('sem confirmação do servidor, o envio volta como "na fila"', async () => {
  const { copies } = setup({ segurarCommit: true });

  const resultado = await copies.send({ toUids: [BIA], drinks: [bebida()] });

  assert.equal(resultado.state, 'queued');
});

test('cópia recebida aparece pelo ponteiro, no prazo, e some depois de importada', async () => {
  const listas = [];
  const { copies, firestore } = setup({ onIncomingChange: (lista) => listas.push(lista) });
  const enviadaEm = AGORA - 60_000;

  copies.setPairings([par(BIA, { drinkCopyFromOther: enviadaEm }), par(CAIO, { drinkCopyFromOther: AGORA - DRINK_COPY_TTL_MS - 1 })]);
  await esperar();

  assert.deepEqual(listas.at(-1), [{ fromUid: BIA, sentAtMs: enviadaEm, expiresAtMs: enviadaEm + DRINK_COPY_TTL_MS }], 'a do Caio já venceu');

  await copies.markHandled(BIA, enviadaEm);

  assert.deepEqual(listas.at(-1), []);
  const registro = firestore.escritas.find((item) => item.path === `users/${EU}/meta/drinkCopies`);
  assert.deepEqual(registro.data, { handled: { [BIA]: enviadaEm } });
  assert.ok(firestore.exclusoes.includes(`drinkCopies/${BIA}_${EU}`), 'sai do servidor na hora');

  // O mesmo ponteiro chegando de novo (outra mudança no pareamento) não reabre.
  copies.setPairings([par(BIA, { drinkCopyFromOther: enviadaEm })]);
  await esperar();
  assert.deepEqual(listas.at(-1), []);
});

// O registro mora na conta: outro aparelho que já importou não deixa esta cópia reaparecer.
test('o que já foi importado em outro aparelho não aparece; um envio novo, sim', async () => {
  const listas = [];
  const enviadaEm = AGORA - 60_000;
  const { copies } = setup({
    documentos: { [`users/${EU}/meta/drinkCopies`]: { handled: { [BIA]: enviadaEm } } },
    onIncomingChange: (lista) => listas.push(lista),
  });

  copies.setPairings([par(BIA, { drinkCopyFromOther: enviadaEm })]);
  await esperar();
  assert.deepEqual(listas.at(-1), []);

  copies.setPairings([par(BIA, { drinkCopyFromOther: AGORA })]);
  await esperar();
  assert.equal(listas.at(-1).length, 1, 'Bia enviou de novo');
});

test('a cópia recebida sai da lista quando vence, sem precisar mudar o pareamento', async () => {
  const listas = [];
  let agora = AGORA;
  const { copies } = setup({ now: () => agora, onIncomingChange: (lista) => listas.push(lista) });

  copies.setPairings([par(BIA, { drinkCopyFromOther: AGORA })]);
  await esperar();
  assert.equal(listas.at(-1).length, 1);

  agora = AGORA + DRINK_COPY_TTL_MS;
  copies.sweep();
  assert.deepEqual(listas.at(-1), []);
});

test('ler a cópia: válida devolve as bebidas; negada, vencida ou de outra pessoa é "não disponível"', async () => {
  const valida = { fromUid: BIA, toUid: EU, formatVersion: 1, drinks: [{ name: 'Água' }], expiresAt: { toMillis: () => AGORA + 1000 } };
  const { copies } = setup({
    documentos: {
      [`drinkCopies/${BIA}_${EU}`]: valida,
      [`drinkCopies/${CAIO}_${EU}`]: { ...valida, fromUid: CAIO, expiresAt: { toMillis: () => AGORA - 1 } },
    },
  });

  assert.deepEqual(await copies.fetchIncoming(BIA), { ok: true, drinks: [{ name: 'Água' }], expiresAtMs: AGORA + 1000 });
  assert.deepEqual(await copies.fetchIncoming(CAIO), { ok: false, reason: 'gone' }, 'vencida');
  assert.deepEqual(await copies.fetchIncoming('uid-dino'), { ok: false, reason: 'gone' }, 'a regra nega o inexistente');
});

test('sem conexão, ler a cópia diz isso em vez de "não disponível"', async () => {
  const { copies, firestore } = setup();
  firestore.module.getDoc = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };

  assert.deepEqual(await copies.fetchIncoming(BIA), { ok: false, reason: 'offline' });
});

test('readDrinkCopy falha fechado', () => {
  const base = { fromUid: BIA, formatVersion: 1, drinks: [], expiresAt: { toMillis: () => 1 } };

  assert.ok(readDrinkCopy(base));
  assert.equal(readDrinkCopy(null), null);
  assert.equal(readDrinkCopy({ ...base, fromUid: '' }), null);
  assert.equal(readDrinkCopy({ ...base, drinks: 'x' }), null);
  assert.equal(readDrinkCopy({ ...base, formatVersion: 2 }), null);
  assert.equal(readDrinkCopy({ ...base, expiresAt: 1 }), null, 'número em vez de Timestamp');
});

test('a minha cópia vencida sai do servidor e o ponteiro é zerado', async () => {
  const { copies, firestore } = setup();

  copies.setPairings([par(BIA, { drinkCopyFromMe: AGORA - DRINK_COPY_TTL_MS }), par(CAIO, { drinkCopyFromMe: AGORA })]);
  await esperar();

  assert.deepEqual(firestore.exclusoes, [`drinkCopies/${EU}_${BIA}`]);
  const ponteiro = firestore.escritas.find((item) => item.path === `pairings/${EU}_${BIA}`);
  assert.deepEqual(ponteiro.data, { [`drinkCopies.${EU}`]: null });
  assert.ok(!firestore.escritas.some((item) => item.path.includes(CAIO)), 'a do Caio ainda vale');
});

// A leitura de quem recebe não depende da amizade existir: desfazer precisa levar a cópia.
test('amizade desfeita leva junto a cópia que eu tinha enviado', async () => {
  const { copies, firestore } = setup();

  copies.setPairings([par(BIA, { drinkCopyFromMe: AGORA }), par(CAIO)]);
  await esperar();
  copies.setPairings([par(CAIO)]);
  await esperar();

  assert.deepEqual(firestore.exclusoes, [`drinkCopies/${EU}_${BIA}`]);
});

test('ao abrir, as minhas cópias vencidas são apagadas; as válidas ficam', async () => {
  const { copies, firestore } = setup({
    documentos: {
      [`drinkCopies/${EU}_${BIA}`]: { fromUid: EU, expiresAt: { toMillis: () => AGORA - 1 } },
      [`drinkCopies/${EU}_${CAIO}`]: { fromUid: EU, expiresAt: { toMillis: () => AGORA + 1 } },
    },
  });

  await copies.start();

  assert.deepEqual(firestore.exclusoes, [`drinkCopies/${EU}_${BIA}`]);
});

test('apagar dados na nuvem apaga as cópias que enviei e o registro do que recebi', async () => {
  const { copies, firestore } = setup({
    documentos: {
      [`drinkCopies/${EU}_${BIA}`]: { fromUid: EU, expiresAt: { toMillis: () => AGORA + 1 } },
      [`users/${EU}/meta/drinkCopies`]: { handled: {} },
    },
  });

  await copies.deleteAllMyData();

  assert.deepEqual(firestore.exclusoes.sort(), [`drinkCopies/${EU}_${BIA}`, `users/${EU}/meta/drinkCopies`]);
});

// `sweep` roda a cada minuto: avisar sem mudança redesenharia a tela de amigos à toa.
test('sem mudança na lista de cópias recebidas, nada é avisado de novo', async () => {
  const listas = [];
  const { copies } = setup({ onIncomingChange: (lista) => listas.push(lista) });

  copies.setPairings([par(BIA, { drinkCopyFromOther: AGORA })]);
  await esperar();
  copies.sweep();
  copies.sweep();
  copies.setPairings([par(BIA, { drinkCopyFromOther: AGORA }), par(CAIO)]);
  await esperar();

  assert.equal(listas.length, 1);
});
