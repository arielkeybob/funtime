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

function setup({ documentos, generateCode = () => 'AB7K29', onPairingsChange = () => {} } = {}) {
  const firestore = fakeFirestore({ documentos });
  const writer = createShareWriter({
    app: {}, uid: EU, onPairingsChange, generateCode,
    importModule: async () => firestore.module,
    now: () => 1_000_000,
  });

  return { writer, firestore };
}

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
