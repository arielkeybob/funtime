const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFirestoreSync } = require('../src/data/firestore-sync.js');

function fakeFirestore({ persistenciaIndisponivel = false } = {}) {
  const commits = [];
  const listeners = new Map();
  const aberturas = [];
  const gravacoes = [];

  const module = {
    aberturas,
    initializeFirestore: (app, options) => {
      if (persistenciaIndisponivel) throw new Error('armazenamento bloqueado');
      aberturas.push({ modo: 'persistente', options });
      return {};
    },
    persistentLocalCache: (options) => ({ tipo: 'persistente', ...options }),
    persistentMultipleTabManager: () => ({ tipo: 'multiplas-abas' }),
    getFirestore: () => { aberturas.push({ modo: 'memoria' }); return {}; },
    collection: (db, ...path) => ({ path: path.join('/') }),
    doc: (db, ...path) => ({ path: path.join('/') }),
    serverTimestamp: () => '__serverTimestamp__',
    getDocs: async () => ({ docs: [] }),
    setDoc: async (reference, data, options) => { gravacoes.push({ path: reference.path, data, options }); },
    onSnapshot: (reference, next) => {
      listeners.set(reference.path, next);
      return () => listeners.delete(reference.path);
    },
    writeBatch: () => {
      const operations = [];
      return {
        set: (reference, data) => operations.push({ type: 'set', path: reference.path, data }),
        delete: (reference) => operations.push({ type: 'delete', path: reference.path }),
        commit: async () => { commits.push(operations); },
      };
    },
  };

  return { module, commits, listeners, gravacoes };
}

function setup({ onRemoteUpdate = () => {}, persistenciaIndisponivel = false, account } = {}) {
  const firestore = fakeFirestore({ persistenciaIndisponivel });
  const timers = { scheduled: null, scheduleCalls: 0, cancelCalls: 0 };

  const sync = createFirestoreSync({
    app: {}, uid: 'u1', account, onRemoteUpdate,
    importModule: async () => firestore.module,
    schedule: (callback) => { timers.scheduled = callback; timers.scheduleCalls += 1; return 1; },
    cancel: () => { timers.cancelCalls += 1; timers.scheduled = null; },
  });

  return { sync, firestore, timers };
}

const data = (overrides = {}) => ({
  drinks: [], events: [], occasions: [], preferences: { cleanInterface: true }, ...overrides,
});

function seedAllListeners(firestore, { drinks = [], events = [], occasions = [], meta = null } = {}) {
  const asSnapshot = (records) => ({ docs: records.map((record) => ({ data: () => record })) });
  firestore.listeners.get('users/u1/drinks')(asSnapshot(drinks));
  firestore.listeners.get('users/u1/events')(asSnapshot(events));
  firestore.listeners.get('users/u1/occasions')(asSnapshot(occasions));
  firestore.listeners.get('users/u1/meta/app')({ data: () => meta });
}

// Sem fila persistente, uma exclusão feita offline se perde ao fechar o app e o
// registro volta da nuvem na sincronização seguinte.
test('abre o banco com cache persistente, para a fila sobreviver ao fechamento', async () => {
  const { sync, firestore } = setup();

  await sync.start(data());

  assert.deepEqual(firestore.module.aberturas.map((abertura) => abertura.modo), ['persistente']);
  assert.equal(firestore.module.aberturas[0].options.localCache.tipo, 'persistente');
  assert.equal(firestore.module.aberturas[0].options.localCache.tabManager.tipo, 'multiplas-abas');
});

test('se o navegador recusar a persistência, ainda sincroniza sem ela', async () => {
  const { sync, firestore } = setup({ persistenciaIndisponivel: true });

  await sync.start(data());
  await sync.flushPendingWrites();

  assert.deepEqual(firestore.module.aberturas.map((abertura) => abertura.modo), ['memoria']);
  assert.equal(firestore.listeners.size, 4, 'os listeners continuam ativos');
});

test('registra a identidade da conta para dar nome ao uid no console', async () => {
  const { sync, firestore } = setup({ account: { email: 'a@b.c', displayName: 'Ariel' } });

  await sync.start(data());

  const gravacao = firestore.gravacoes.find((item) => item.path === 'users/u1/meta/account');
  assert.equal(gravacao.data.email, 'a@b.c');
  assert.equal(gravacao.data.displayName, 'Ariel');
  // Sem merge, um apelido anotado à mão nesse documento sumiria a cada abertura.
  assert.deepEqual(gravacao.options, { merge: true });
});

test('a identidade não vai para o documento de dados do app', async () => {
  const { sync, firestore } = setup({ account: { email: 'a@b.c', displayName: 'Ariel' } });

  await sync.start(data());
  sync.scheduleSyncPush(data(), data({ drinks: [{ id: 'a' }] }));
  await sync.flushPendingWrites();

  const meta = firestore.commits.flat().find((op) => op.path === 'users/u1/meta/app');
  assert.equal(meta.data.email, undefined, 'meta/app é reescrito inteiro e não guarda identidade');
});

test('sem conta informada, não grava identidade nenhuma', async () => {
  const { sync, firestore } = setup();

  await sync.start(data());

  assert.deepEqual(firestore.gravacoes, []);
});

test('agrupa várias mudanças seguidas numa única escrita', async () => {
  const { sync, firestore, timers } = setup();
  const start = data();

  sync.scheduleSyncPush(start, data({ drinks: [{ id: 'a' }] }));
  sync.scheduleSyncPush(start, data({ drinks: [{ id: 'a' }, { id: 'b' }] }));
  sync.scheduleSyncPush(start, data({ drinks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }));

  assert.equal(timers.cancelCalls, 2, 'cada nova mudança reinicia a espera em vez de enviar');

  await sync.flushPendingWrites();

  assert.equal(firestore.commits.length, 1);
  const paths = firestore.commits[0].filter((op) => op.type === 'set').map((op) => op.path);
  assert.deepEqual(paths.filter((path) => path.startsWith('users/u1/drinks')), [
    'users/u1/drinks/a', 'users/u1/drinks/b', 'users/u1/drinks/c',
  ]);
});

test('não envia nada quando o dado não mudou', async () => {
  const { sync, firestore } = setup();
  const unchanged = data({ drinks: [{ id: 'a' }] });

  sync.scheduleSyncPush(unchanged, unchanged);
  await sync.flushPendingWrites();

  assert.equal(firestore.commits.length, 0);
});

test('registro removido vira exclusão do documento', async () => {
  const { sync, firestore } = setup();

  sync.scheduleSyncPush(data({ events: [{ id: 'e1' }, { id: 'e2' }] }), data({ events: [{ id: 'e1' }] }));
  await sync.flushPendingWrites();

  const deletions = firestore.commits[0].filter((op) => op.type === 'delete');
  assert.deepEqual(deletions.map((op) => op.path), ['users/u1/events/e2']);
});

test('a ordem das bebidas viaja no documento de meta', async () => {
  const { sync, firestore } = setup();

  sync.scheduleSyncPush(data(), data({ drinks: [{ id: 'b' }, { id: 'a' }] }));
  await sync.flushPendingWrites();

  const meta = firestore.commits[0].find((op) => op.path === 'users/u1/meta/app');
  assert.deepEqual(meta.data.drinkOrder, ['b', 'a']);
  assert.equal(meta.data.syncedAt, '__serverTimestamp__');
});

test('divide em lotes quando passa do limite de operações', async () => {
  const { sync, firestore } = setup();
  const many = Array.from({ length: 500 }, (unused, index) => ({ id: `e${index}` }));

  sync.scheduleSyncPush(data(), data({ events: many }));
  await sync.flushPendingWrites();

  assert.equal(firestore.commits.length, 2);
  assert.equal(firestore.commits[0].length, 450);
});

test('só aplica o que vem da nuvem depois do primeiro retrato completo', async () => {
  const updates = [];
  const { sync, firestore } = setup({ onRemoteUpdate: (merged) => updates.push(merged) });

  await sync.start(data());

  const asSnapshot = (records) => ({ docs: records.map((record) => ({ data: () => record })) });
  firestore.listeners.get('users/u1/drinks')(asSnapshot([{ id: 'a' }]));
  firestore.listeners.get('users/u1/events')(asSnapshot([]));
  assert.equal(updates.length, 0, 'ainda faltam coleções: não aplica pela metade');

  firestore.listeners.get('users/u1/occasions')(asSnapshot([]));
  firestore.listeners.get('users/u1/meta/app')({ data: () => null });

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].drinks, [{ id: 'a' }]);
});

test('após receber da nuvem, não reenvia o que acabou de chegar', async () => {
  const { sync, firestore } = setup();

  await sync.start(data());
  seedAllListeners(firestore, {
    events: [{ id: 'deOutroAparelho' }],
    meta: { preferences: { cleanInterface: true }, drinkOrder: [] },
  });
  await sync.flushPendingWrites();

  assert.equal(firestore.commits.length, 0);
});

test('sobe as preferências locais quando a nuvem ainda não tem meta', async () => {
  const { sync, firestore } = setup();

  await sync.start(data());
  seedAllListeners(firestore, { meta: null });
  await sync.flushPendingWrites();

  const meta = firestore.commits[0].find((op) => op.path === 'users/u1/meta/app');
  assert.deepEqual(meta.data.preferences, { cleanInterface: true });
});

test('no primeiro login, envia o que só existe neste aparelho', async () => {
  const { sync, firestore } = setup();

  await sync.start(data({ events: [{ id: 'local' }] }));
  seedAllListeners(firestore, {});
  await sync.flushPendingWrites();

  const paths = firestore.commits[0].filter((op) => op.type === 'set').map((op) => op.path);
  assert.ok(paths.includes('users/u1/events/local'));
});

test('stop desconecta os listeners e impede novos envios', async () => {
  const { sync, firestore } = setup();

  await sync.start(data());
  assert.equal(firestore.listeners.size, 4);

  sync.stop();
  assert.equal(firestore.listeners.size, 0);

  sync.scheduleSyncPush(data(), data({ drinks: [{ id: 'a' }] }));
  await sync.flushPendingWrites();
  assert.equal(firestore.commits.length, 0);
});
