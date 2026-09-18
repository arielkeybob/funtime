const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createShareWriter, PAIRING_CODE_TTL_MS } = require('../src/data/share-writer.js');

const EU = 'uid-ana';
const OUTRO = 'uid-bia';
const PAR = 'uid-ana_uid-bia';

function fakeFirestore({ documentos = {} } = {}) {
  const escritas = [];
  const exclusoes = [];
  const listeners = new Map();

  const module = {
    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
    getFirestore: () => ({}),
    serverTimestamp: () => '__serverTimestamp__',
    arrayUnion: (...valores) => ({ __arrayUnion: valores }),
    Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) },
    doc: (db, ...path) => ({ path: path.join('/') }),
    collection: (db, ...path) => ({ path: path.join('/') }),
    query: (reference, ...restricoes) => ({ path: reference.path, restricoes }),
    where: (campo, operador, valor) => ({ campo, operador, valor }),
    getDoc: async (reference) => ({
      exists: () => reference.path in documentos,
      data: () => documentos[reference.path],
      ref: reference,
    }),
    getDocs: async (consulta) => ({
      docs: Object.entries(documentos)
        .filter(([path]) => path.startsWith(consulta.path + '/'))
        .map(([path, data]) => ({ id: path.split('/').pop(), data: () => data, ref: { path } })),
    }),
    setDoc: async (reference, data) => { escritas.push({ path: reference.path, data }); },
    updateDoc: async (reference, data) => { escritas.push({ path: reference.path, data, update: true }); },
    deleteDoc: async (reference) => { exclusoes.push(reference.path); },
    onSnapshot: (reference, next) => {
      listeners.set(reference.path, next);
      return () => listeners.delete(reference.path);
    },
    writeBatch: () => { throw new Error('o lado do pareamento não usa lote'); },
  };

  return { module, escritas, exclusoes, listeners, documentos };
}

function setup({
  documentos, generateCode = () => 'AB7K29', onPairingsChange = () => {}, onSharesChange = () => {},
  createShareId, timers,
} = {}) {
  const firestore = fakeFirestore({ documentos });
  let proximoId = 0;
  const writer = createShareWriter({
    app: {}, uid: EU, onPairingsChange, onSharesChange, generateCode,
    createShareId: createShareId || (() => `share-${++proximoId}`),
    importModule: async () => firestore.module,
    now: () => 1_000_000,
    schedule: timers?.schedule, cancel: timers?.cancel,
  });

  return { writer, firestore };
}

const ocasiao = (extra = {}) => ({ id: 'oc-1', name: 'Festa', startedAt: 500_000, endedAt: null, ...extra });
const dose = (id) => ({ id, drinkId: 'drink-1', drinkName: 'Cerveja', drinkIcon: '🍺', consumedAt: 600_000, occasionId: 'oc-1', intervalMinutes: 60, doseSize: null });

const snapshotDePares = (docs) => ({ docs: docs.map((data, index) => ({ id: data.__id ?? `par-${index}`, data: () => data })) });

test('gerar código grava só uid e validade, com prazo curto', async () => {
  const { writer, firestore } = setup();

  const { code, expiresAtMs } = await writer.createPairingCode();

  assert.equal(code, 'AB7K29');
  assert.equal(expiresAtMs, 1_000_000 + PAIRING_CODE_TTL_MS);

  const gravacao = firestore.escritas.find((item) => item.path === 'pairingCodes/AB7K29');
  assert.deepEqual(Object.keys(gravacao.data).sort(), ['createdAt', 'expiresAt', 'ownerUid']);
  assert.equal(gravacao.data.ownerUid, EU);
});

// O código não pode carregar identidade: é o que impede procurar alguém por nome.
test('PRIVACIDADE: o código não carrega e-mail nem nome', async () => {
  const { writer, firestore } = setup();

  await writer.createPairingCode();

  const serializado = JSON.stringify(firestore.escritas.find((item) => item.path === 'pairingCodes/AB7K29'));
  assert.ok(!/email|displayName|@/.test(serializado));
});

test('resgatar código cria o pareamento aceito só por quem digitou', async () => {
  const { writer, firestore } = setup({ documentos: { 'pairingCodes/AB7K29': { ownerUid: OUTRO } } });

  const resultado = await writer.redeemPairingCode('AB7K29', 'Ana');

  assert.deepEqual(resultado, { ok: true, pairId: PAR, otherUid: OUTRO });

  const gravacao = firestore.escritas.find((item) => item.path === `pairings/${PAR}`);
  assert.deepEqual(gravacao.data.uids, [EU, OUTRO].sort());
  assert.deepEqual(gravacao.data.acceptedBy, [EU], 'nasce aceito por um lado só');
  assert.deepEqual(gravacao.data.aliases, { [EU]: 'Ana' }, 'só o próprio apelido');
  assert.deepEqual(gravacao.data.sharing, {}, 'parear não compartilha nada');
});

test('código inexistente e código próprio são recusados sem lançar', async () => {
  const { writer } = setup({ documentos: { 'pairingCodes/MEUCOD': { ownerUid: EU } } });

  assert.deepEqual(await writer.redeemPairingCode('SUMIU', 'Ana'), { ok: false, reason: 'not-found' });
  assert.deepEqual(await writer.redeemPairingCode('MEUCOD', 'Ana'), { ok: false, reason: 'own-code' });
});

test('resgatar um par que já existe apenas reaceita, sem recriar', async () => {
  const { writer, firestore } = setup({
    documentos: { 'pairingCodes/AB7K29': { ownerUid: OUTRO }, [`pairings/${PAR}`]: { uids: [EU, OUTRO] } },
  });

  await writer.redeemPairingCode('AB7K29', 'Ana');

  const gravacao = firestore.escritas.find((item) => item.path === `pairings/${PAR}`);
  assert.equal(gravacao.update, true, 'atualiza em vez de sobrescrever o documento do par');
  assert.deepEqual(gravacao.data.acceptedBy, { __arrayUnion: [EU] });
});

test('aceitar só acrescenta a si mesmo e o próprio apelido', async () => {
  const { writer, firestore } = setup();

  await writer.acceptPairing(PAR, 'Ana');

  const gravacao = firestore.escritas.find((item) => item.update);
  assert.deepEqual(gravacao.data.acceptedBy, { __arrayUnion: [EU] });
  assert.deepEqual(Object.keys(gravacao.data).sort(), ['acceptedBy', `aliases.${EU}`].sort());
});

test('mudar apelido toca só a própria chave', async () => {
  const { writer, firestore } = setup();

  await writer.setAlias(PAR, 'Aninha');

  assert.deepEqual(firestore.escritas[0].data, { [`aliases.${EU}`]: 'Aninha' });
});

test('desfazer pareamento apaga o documento do par', async () => {
  const { writer, firestore } = setup();

  await writer.removePairing(PAR);

  assert.deepEqual(firestore.exclusoes, [`pairings/${PAR}`]);
});

// A regra de leitura do share não depende do pareamento continuar existindo — se
// isto não revogasse antes, a pessoa continuaria vendo até o prazo natural de 24h
// mesmo depois de desconectada. "Revogação imediata" é o roadmap, não só um texto.
test('desfazer pareamento revoga os compartilhamentos ativos com aquela pessoa antes de apagar o par', async () => {
  const { writer, firestore } = setup();

  const { shareId } = await writer.startShare({ occasion: ocasiao(), events: [], viewerUid: OUTRO, ownerAlias: 'Ana' });
  firestore.exclusoes.length = 0;

  await writer.removePairing(PAR);

  assert.ok(firestore.exclusoes.includes(`shares/${shareId}`), 'o share precisa ser apagado');
  const indiceShare = firestore.exclusoes.indexOf(`shares/${shareId}`);
  const indicePareamento = firestore.exclusoes.indexOf(`pairings/${PAR}`);
  assert.ok(indiceShare < indicePareamento, 'o share tem que ser revogado antes do pareamento sumir');
});

test('desfazer pareamento sem compartilhamento ativo só apaga o par, sem tocar em shares', async () => {
  const { writer, firestore } = setup();

  await writer.startShare({ occasion: ocasiao({ id: 'oc-2' }), events: [], viewerUid: 'uid-caio', ownerAlias: 'Ana' });
  firestore.exclusoes.length = 0;

  await writer.removePairing(PAR); // pareamento com OUTRO, sem share ativo — o de uid-caio não deve ser tocado

  assert.deepEqual(firestore.exclusoes, [`pairings/${PAR}`]);
});

test('a lista de pares distingue quem aceitou o quê', async () => {
  const pares = [];
  const { writer, firestore } = setup({ onPairingsChange: (lista) => pares.push(lista) });

  await writer.start();
  firestore.listeners.get('pairings')(snapshotDePares([{
    __id: PAR, uids: [EU, OUTRO], createdBy: OUTRO,
    acceptedBy: [OUTRO], aliases: { [OUTRO]: 'Bia' }, sharing: {},
  }]));

  assert.deepEqual(pares.at(-1), [{
    pairId: PAR, otherUid: OUTRO, alias: 'Bia', myAlias: '',
    acceptedByMe: false, acceptedByOther: true, createdByMe: false,
    sharedWithMe: null, sharingWithOther: null,
  }]);
});

// É por este ponteiro que o outro lado descobre o compartilhamento, em vez de
// adivinhar o id ou varrer a coleção.
test('a lista de pares expõe o ponteiro de compartilhamento dos dois lados', async () => {
  const pares = [];
  const { writer, firestore } = setup({ onPairingsChange: (lista) => pares.push(lista) });

  await writer.start();
  firestore.listeners.get('pairings')(snapshotDePares([{
    __id: PAR, uids: [EU, OUTRO], createdBy: EU, acceptedBy: [EU, OUTRO],
    aliases: {}, sharing: { [OUTRO]: 'share-da-bia', [EU]: 'share-meu' },
  }]));

  assert.equal(pares.at(-1)[0].sharedWithMe, 'share-da-bia');
  assert.equal(pares.at(-1)[0].sharingWithOther, 'share-meu');
});

test('start limpa os códigos vencidos e preserva os válidos', async () => {
  const { writer, firestore } = setup({
    documentos: {
      'pairingCodes/VENCID': { ownerUid: EU, expiresAt: { toMillis: () => 999_999 } },
      'pairingCodes/VALIDO': { ownerUid: EU, expiresAt: { toMillis: () => 2_000_000 } },
    },
  });

  await writer.start();

  assert.deepEqual(firestore.exclusoes, ['pairingCodes/VENCID']);
});

test('stop desconecta e silencia', async () => {
  const pares = [];
  const { writer, firestore } = setup({ onPairingsChange: (lista) => pares.push(lista) });

  await writer.start();
  const notificar = firestore.listeners.get('pairings');
  writer.stop();

  assert.equal(firestore.listeners.size, 0);
  notificar(snapshotDePares([]));
  assert.equal(pares.length, 0);
});

// --- Compartilhamento (Fase 3) -------------------------------------------------

test('PRIVACIDADE: o documento que o convidado lê não carrega o id da ocasião', async () => {
  const { writer, firestore } = setup();

  await writer.startShare({ occasion: ocasiao(), events: [dose('e1')], viewerUid: OUTRO, ownerAlias: 'Ana' });

  const compartilhado = firestore.escritas.find((item) => item.path.startsWith('shares/'));
  assert.equal('occasionId' in compartilhado.data, false);
  assert.equal('occasionId' in compartilhado.data.occasion, false);
  assert.deepEqual(Object.keys(compartilhado.data.occasion).sort(), ['endedAt', 'name', 'startedAt']);
});

// O id da ocasião só existe aqui, na área exclusiva do dono — nunca no documento
// que o convidado consegue ler.
test('o id da ocasião fica só no bookkeeping próprio do dono', async () => {
  const { writer, firestore } = setup();

  await writer.startShare({ occasion: ocasiao(), events: [dose('e1')], viewerUid: OUTRO, ownerAlias: 'Ana' });

  const bookkeeping = firestore.escritas.find((item) => item.path === `users/${EU}/meta/shares`);
  assert.equal(Object.values(bookkeeping.data.active)[0].occasionId, 'oc-1');
});

test('compartilhar publica o ponteiro no pareamento', async () => {
  const { writer, firestore } = setup();

  const { shareId } = await writer.startShare({ occasion: ocasiao(), events: [], viewerUid: OUTRO, ownerAlias: 'Ana' });

  const gravacao = firestore.escritas.find((item) => item.path === `pairings/${PAR}` && item.update);
  assert.deepEqual(gravacao.data, { [`sharing.${EU}`]: shareId });
});

test('compartilhar avisa quem escuta, com a lista atualizada', async () => {
  const listas = [];
  const { writer } = setup({ onSharesChange: (lista) => listas.push(lista) });

  const { shareId } = await writer.startShare({ occasion: ocasiao(), events: [], viewerUid: OUTRO, ownerAlias: 'Ana' });

  assert.deepEqual(listas.at(-1), [{ shareId, occasionId: 'oc-1', viewerUid: OUTRO, ownerAlias: 'Ana' }]);
});

test('parar apaga o documento e limpa o ponteiro', async () => {
  const { writer, firestore } = setup();

  const { shareId } = await writer.startShare({ occasion: ocasiao(), events: [], viewerUid: OUTRO, ownerAlias: 'Ana' });
  await writer.stopShare(shareId);

  assert.ok(firestore.exclusoes.includes(`shares/${shareId}`));
  const limpezaPonteiro = firestore.escritas.find((item) => item.path === `pairings/${PAR}` && item.data[`sharing.${EU}`] === null);
  assert.ok(limpezaPonteiro, 'o ponteiro precisa voltar a null, senão o convidado tenta ler um share apagado');
});

test('parar todos encerra cada compartilhamento ativo', async () => {
  const { writer, firestore } = setup();

  await writer.startShare({ occasion: ocasiao(), events: [], viewerUid: OUTRO, ownerAlias: 'Ana' });
  await writer.startShare({ occasion: ocasiao({ id: 'oc-2' }), events: [], viewerUid: 'uid-caio', ownerAlias: 'Ana' });
  await writer.stopAllShares();

  assert.equal(firestore.exclusoes.filter((path) => path.startsWith('shares/')).length, 2);
});

test('agrupa envios seguidos e reconstrói o payload do estado mais recente', async () => {
  const timers = {};
  const fila = [];
  timers.schedule = (fn) => { fila.push(fn); return fila.length; };
  timers.cancel = () => { fila.length = 0; };
  const { writer, firestore } = setup({ timers });

  await writer.startShare({ occasion: ocasiao(), events: [dose('e1')], viewerUid: OUTRO, ownerAlias: 'Ana' });
  firestore.escritas.length = 0; // só interessa o que vem depois do envio inicial

  writer.scheduleSharePush({ occasions: [ocasiao()], events: [dose('e1'), dose('e2')] });
  writer.scheduleSharePush({ occasions: [ocasiao()], events: [dose('e1'), dose('e2'), dose('e3')] });

  assert.equal(fila.length, 1, 'a segunda chamada reagenda em vez de disparar outro envio');
  await fila[0]();

  const gravacao = firestore.escritas.find((item) => item.path.startsWith('shares/'));
  assert.equal(gravacao.data.eventCount, 3, 'usa o estado mais recente, não o do momento do agendamento');
});

test('se a ocasião compartilhada foi apagada, para de compartilhar em vez de mandar payload vazio', async () => {
  const listas = [];
  const { writer, firestore } = setup({ onSharesChange: (lista) => listas.push(lista) });

  await writer.startShare({ occasion: ocasiao(), events: [], viewerUid: OUTRO, ownerAlias: 'Ana' });
  const antesDoFlush = firestore.exclusoes.length;

  writer.scheduleSharePush({ occasions: [], events: [] });
  await writer.flushSharePushes();

  assert.ok(firestore.exclusoes.length > antesDoFlush, 'apagou o share em vez de reenviar um payload vazio');
  assert.deepEqual(listas.at(-1), []);
});

test('ao reabrir, reconstrói os compartilhamentos ativos a partir do bookkeeping', async () => {
  const listas = [];
  const documentos = {
    [`users/${EU}/meta/shares`]: { active: { 's1': { occasionId: 'oc-1', viewerUid: OUTRO, ownerAlias: 'Ana' } } },
    'shares/s1': { ownerUid: EU, viewerUid: OUTRO, ownerAlias: 'Ana', expiresAt: { toMillis: () => 2_000_000 } },
  };
  const { writer } = setup({ documentos, onSharesChange: (lista) => listas.push(lista) });

  await writer.start();

  assert.deepEqual(listas.at(-1), [{ shareId: 's1', occasionId: 'oc-1', viewerUid: OUTRO, ownerAlias: 'Ana' }]);
});

test('ao reabrir, compartilhamento vencido é apagado e o ponteiro limpo', async () => {
  const documentos = {
    [`users/${EU}/meta/shares`]: { active: { 's1': { occasionId: 'oc-1', viewerUid: OUTRO, ownerAlias: 'Ana' } } },
    'shares/s1': { ownerUid: EU, viewerUid: OUTRO, ownerAlias: 'Ana', expiresAt: { toMillis: () => 999_999 } },
  };
  const { writer, firestore } = setup({ documentos });

  await writer.start();

  assert.ok(firestore.exclusoes.includes('shares/s1'));
  const limpezaPonteiro = firestore.escritas.find((item) => item.path === `pairings/${PAR}` && item.data[`sharing.${EU}`] === null);
  assert.ok(limpezaPonteiro);
});

test('stop também interrompe os compartilhamentos em memória, sem apagar nada', async () => {
  const { writer, firestore } = setup();

  await writer.startShare({ occasion: ocasiao(), events: [], viewerUid: OUTRO, ownerAlias: 'Ana' });
  firestore.exclusoes.length = 0;
  writer.stop();

  assert.deepEqual(firestore.exclusoes, [], 'stop não é revogação — é só parar de rodar neste aparelho');
});
