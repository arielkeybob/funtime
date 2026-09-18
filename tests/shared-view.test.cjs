const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSharedView } = require('../src/data/shared-view.js');

const ANA = 'uid-ana';
const BIA = 'uid-bia';

// Instrumentado para provar ausência de escrita: qualquer chamada a set/update/
// delete/batch conta aqui, e os testes de "somente leitura" asseram zero em cada uma.
function fakeFirestore() {
  const commits = [];
  const gravacoes = [];
  const listeners = new Map(); // path -> { onNext, onError }

  const module = {
    doc: (db, ...path) => ({ path: path.join('/') }),
    onSnapshot: (reference, onNext, onError) => {
      listeners.set(reference.path, { onNext, onError });
      return () => listeners.delete(reference.path);
    },
    setDoc: async (reference, data) => { gravacoes.push({ path: reference.path, data }); },
    updateDoc: async (reference, data) => { gravacoes.push({ path: reference.path, data, update: true }); },
    deleteDoc: async (reference) => { gravacoes.push({ path: reference.path, deleted: true }); },
    writeBatch: () => { commits.push('writeBatch chamado'); throw new Error('não deveria ser chamado'); },
    getFirestore: () => ({}),
    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
  };

  return { module, commits, gravacoes, listeners };
}

function setup({ onChange = () => {}, onStatusChange = () => {} } = {}) {
  const firestore = fakeFirestore();
  const view = createSharedView({
    app: {}, onChange, onStatusChange,
    importModule: async () => firestore.module,
    now: () => 10_000,
  });

  return { view, firestore };
}

const snapshotComDados = (dados, fromCache = false) => ({
  exists: () => true,
  data: () => dados,
  metadata: { fromCache },
});

const pagamentoValido = (overrides = {}) => ({
  ownerAlias: 'Ana', occasion: { name: 'Festa', startedAt: 1000, endedAt: null },
  events: [], totals: [], eventCount: 0, truncated: false,
  expiresAt: { toMillis: () => 99_999 }, updatedAt: { toMillis: () => 9_500 },
  ...overrides,
});

test('sem ponteiro de compartilhamento, não escuta nada', async () => {
  const { view, firestore } = setup();

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: null }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(firestore.listeners.size, 0);
});

test('ponteiro presente liga um listener no share certo', async () => {
  const { view, firestore } = setup();

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual([...firestore.listeners.keys()], ['shares/share-1']);
});

test('recebe o retrato e entrega pelo onChange', async () => {
  const retratos = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido()));

  const ultimo = retratos.at(-1);
  assert.equal(ultimo.length, 1);
  assert.equal(ultimo[0].ownerUid, ANA);
  assert.equal(ultimo[0].view.ownerAlias, 'Ana');
  assert.equal(ultimo[0].fromCache, false);
});

test('payload vencido ou malformado não aparece na lista', async () => {
  const retratos = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido({ expiresAt: { toMillis: () => 1 } })));

  assert.deepEqual(retratos.at(-1), []);
});

test('marca quando o retrato veio do cache offline, não do servidor', async () => {
  const retratos = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido(), true));

  assert.equal(retratos.at(-1)[0].fromCache, true);
});

test('documento apagado (revogado pelo dono) remove da lista', async () => {
  const retratos = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido()));

  firestore.listeners.get('shares/share-1').onNext({ exists: () => false, metadata: { fromCache: false } });

  assert.deepEqual(retratos.at(-1), []);
});

// permission-denied é o caminho NORMAL quando o compartilhamento termina — não pode
// virar um erro na tela, só some da lista.
test('negado (compartilhamento encerrado) remove sem reportar erro', async () => {
  const retratos = [];
  const erros = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista), onStatusChange: (status) => erros.push(status) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido()));

  firestore.listeners.get('shares/share-1').onError({ code: 'permission-denied' });

  assert.deepEqual(retratos.at(-1), []);
  assert.deepEqual(erros, [], 'não é um erro de verdade, não deve acionar onStatusChange');
});

test('erro de verdade (não permission-denied) é reportado', async () => {
  const erros = [];
  const { view, firestore } = setup({ onStatusChange: (status) => erros.push(status) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  firestore.listeners.get('shares/share-1').onError({ code: 'unavailable' });

  assert.equal(erros.length, 1);
  assert.equal(erros[0].state, 'error');
});

test('ponteiro trocado reconecta no novo share', async () => {
  const { view, firestore } = setup();

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-2' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual([...firestore.listeners.keys()], ['shares/share-2']);
});

test('ponteiro removido desliga o listener e some da lista', async () => {
  const retratos = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido()));

  view.setSources([{ otherUid: ANA, sharedWithMe: null }]);

  assert.equal(firestore.listeners.size, 0);
  assert.deepEqual(retratos.at(-1), []);
});

test('duas pessoas compartilhando ao mesmo tempo aparecem as duas', async () => {
  const retratos = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista) });

  view.start();
  view.setSources([
    { otherUid: ANA, sharedWithMe: 'share-ana' },
    { otherUid: BIA, sharedWithMe: 'share-bia' },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 10));

  firestore.listeners.get('shares/share-ana').onNext(snapshotComDados(pagamentoValido({ ownerAlias: 'Ana' })));
  firestore.listeners.get('shares/share-bia').onNext(snapshotComDados(pagamentoValido({ ownerAlias: 'Bia' })));

  assert.deepEqual(retratos.at(-1).map((item) => item.view.ownerAlias).sort(), ['Ana', 'Bia']);
});

test('stop desliga tudo e esvazia a lista', async () => {
  const retratos = [];
  const { view, firestore } = setup({ onChange: (lista) => retratos.push(lista) });

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido()));

  view.stop();

  assert.equal(firestore.listeners.size, 0);
  assert.deepEqual(retratos.at(-1), []);
});

// A prova central deste módulo: em nenhum momento do ciclo — ligar, receber dados,
// reconectar, desligar — ele escreve em lugar nenhum.
test('SOMENTE LEITURA: nada é escrito em todo o ciclo de vida', async () => {
  const { view, firestore } = setup();

  view.start();
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-1' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  firestore.listeners.get('shares/share-1').onNext(snapshotComDados(pagamentoValido()));
  view.setSources([{ otherUid: ANA, sharedWithMe: 'share-2' }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  firestore.listeners.get('shares/share-2').onError({ code: 'permission-denied' });
  view.stop();

  assert.deepEqual(firestore.gravacoes, []);
  assert.deepEqual(firestore.commits, []);
});
