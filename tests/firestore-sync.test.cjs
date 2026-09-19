const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFirestoreSync } = require('../src/data/firestore-sync.js');

function fakeFirestore({ persistenciaIndisponivel = false, servidor = {}, servidorForaDoAr = false } = {}) {
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
    // Consulta com filtro: o caminho carrega o filtro para o teste enxergar QUAL escuta é.
    where: (field, op, value) => ({ field, op, value }),
    query: (reference, ...filtros) => ({
      path: `${reference.path}?${filtros.map((f) => `${f.field}${f.op}${f.value}`).join('&')}`,
    }),
    lidosDoServidor: [],
    getDocsFromServer: async (reference) => {
      module.lidosDoServidor.push(reference.path);
      if (servidorForaDoAr) throw new Error('sem internet');
      return { docs: (servidor[reference.path] || []).map((record) => ({ data: () => record })) };
    },
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

// --- Janela de sincronização (docs/specs/0024) --------------------------------------
const DIA = 24 * 60 * 60 * 1000;
const AGORA = 1_800_000_000_000;
const CORTE = AGORA - 90 * DIA;
const MARGEM = 7 * DIA;
const ANTIGO = CORTE - 5 * DIA;
const RECENTE = CORTE + 5 * DIA;

const LISTEN = {
  drinks: 'users/u1/drinks',
  events: `users/u1/events?consumedAt>=${CORTE}`,
  occasions: `users/u1/occasions?startedAt>=${CORTE - MARGEM}`,
  pending: 'users/u1/occasions?startedAt==null',
  meta: 'users/u1/meta/app',
};

const META = { preferences: { cleanInterface: true }, drinkOrder: [] };
const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

function setupWindow({ concluido = false, servidor = {}, servidorForaDoAr = false, onRemoteUpdate = () => {}, onStatusChange } = {}) {
  const firestore = fakeFirestore({ servidor, servidorForaDoAr });
  const memoria = { concluido, marcacoes: 0 };
  const sync = createFirestoreSync({
    app: {}, uid: 'u1', onRemoteUpdate, onStatusChange,
    windowDays: 90, now: () => AGORA,
    fullSync: { isDone: () => memoria.concluido, markDone: () => { memoria.concluido = true; memoria.marcacoes += 1; } },
    importModule: async () => firestore.module,
    schedule: () => 1, cancel: () => {},
  });
  return { sync, firestore, memoria };
}

function seedWindow(firestore, { drinks = [], events = [], occasions = [], pending = [], meta = META } = {}) {
  const asSnapshot = (records) => ({ docs: records.map((record) => ({ data: () => record })) });
  firestore.listeners.get(LISTEN.drinks)(asSnapshot(drinks));
  firestore.listeners.get(LISTEN.events)(asSnapshot(events));
  firestore.listeners.get(LISTEN.occasions)(asSnapshot(occasions));
  firestore.listeners.get(LISTEN.pending)(asSnapshot(pending));
  firestore.listeners.get(LISTEN.meta)({ data: () => meta });
}

test('janela: escuta só o recente e mais uma consulta para os eventos ainda agendados', async () => {
  const { sync, firestore } = setupWindow({ concluido: true });

  await sync.start(data());

  assert.deepEqual([...firestore.listeners.keys()].sort(), Object.values(LISTEN).sort());
});

test('janela: espera as cinco escutas antes de aplicar', async () => {
  const updates = [];
  const { sync, firestore } = setupWindow({ concluido: true, onRemoteUpdate: (m) => updates.push(m) });
  await sync.start(data());

  const vazio = { docs: [] };
  firestore.listeners.get(LISTEN.drinks)(vazio);
  firestore.listeners.get(LISTEN.events)(vazio);
  firestore.listeners.get(LISTEN.occasions)(vazio);
  firestore.listeners.get(LISTEN.meta)({ data: () => null });
  assert.equal(updates.length, 0, 'falta a escuta dos agendados: aplicar agora esconderia um agendamento');

  firestore.listeners.get(LISTEN.pending)(vazio);
  assert.equal(updates.length, 1);
});

test('janela: ocasiões recentes e agendadas chegam juntas, sem duplicar', async () => {
  const updates = [];
  const { sync, firestore } = setupWindow({ concluido: true, onRemoteUpdate: (m) => updates.push(m) });
  await sync.start(data());

  seedWindow(firestore, {
    occasions: [{ id: 'o1', startedAt: RECENTE }],
    pending: [{ id: 'ag', startedAt: null, scheduledStartAt: AGORA + DIA }],
  });

  assert.deepEqual(updates[0].occasions.map((o) => o.id).sort(), ['ag', 'o1']);
});

test('janela: histórico antigo daqui não é reenviado nem apagado ao abrir', async () => {
  const updates = [];
  const { sync, firestore } = setupWindow({ concluido: true, onRemoteUpdate: (m) => updates.push(m) });

  await sync.start(data({ events: [
    { id: 'velho', consumedAt: ANTIGO }, { id: 'novo', consumedAt: RECENTE },
  ] }));
  seedWindow(firestore, { events: [{ id: 'novo', consumedAt: RECENTE }] });
  await sync.flushPendingWrites();

  assert.deepEqual(updates[0].events.map((e) => e.id).sort(), ['novo', 'velho'], 'o antigo continua no aparelho');
  assert.equal(firestore.commits.length, 0, 'e nada foi escrito na nuvem');
});

test('janela: dose recente apagada em outro aparelho some daqui', async () => {
  const updates = [];
  const { sync, firestore } = setupWindow({ concluido: true, onRemoteUpdate: (m) => updates.push(m) });

  await sync.start(data({ events: [{ id: 'r1', consumedAt: RECENTE }] }));
  seedWindow(firestore, { events: [{ id: 'r1', consumedAt: RECENTE }] });
  firestore.listeners.get(LISTEN.events)({ docs: [] });

  assert.deepEqual(updates.at(-1).events, []);
});

test('janela: apagar uma dose antiga daqui apaga na nuvem', async () => {
  const { sync, firestore } = setupWindow({ concluido: true });
  const velho = { id: 'velho', consumedAt: ANTIGO };

  await sync.start(data({ events: [velho] }));
  seedWindow(firestore, {});
  await sync.flushPendingWrites();
  assert.equal(firestore.commits.length, 0);

  sync.scheduleSyncPush(data({ events: [velho] }), data());
  await sync.flushPendingWrites();

  assert.deepEqual(firestore.commits[0].map((op) => `${op.type}:${op.path}`), ['delete:users/u1/events/velho']);
});

test('janela: já baixou o histórico completo → não vai ao servidor por ele', async () => {
  const { sync, firestore } = setupWindow({ concluido: true });

  await sync.start(data());
  seedWindow(firestore, {});
  await settle();

  assert.deepEqual(firestore.module.lidosDoServidor, []);
});

test('janela: primeira vez baixa o histórico completo, une e só então marca como feito', async () => {
  const updates = [];
  const { sync, firestore, memoria } = setupWindow({
    servidor: {
      'users/u1/events': [
        { id: 'velhoNuvem', consumedAt: ANTIGO }, { id: 'novo', consumedAt: RECENTE },
      ],
      'users/u1/occasions': [{ id: 'oVelha', startedAt: ANTIGO - 30 * DIA, endedAt: ANTIGO }],
    },
    onRemoteUpdate: (m) => updates.push(m),
  });

  await sync.start(data({ events: [{ id: 'velhoAqui', consumedAt: ANTIGO }] }));
  seedWindow(firestore, { events: [{ id: 'novo', consumedAt: RECENTE }] });
  assert.equal(memoria.marcacoes, 0, 'ainda não terminou');
  await settle();

  assert.deepEqual([...firestore.module.lidosDoServidor].sort(), ['users/u1/events', 'users/u1/occasions']);
  const final = updates.at(-1);
  assert.deepEqual(final.events.map((e) => e.id).sort(), ['novo', 'velhoAqui', 'velhoNuvem'], 'união: nenhum lado é descartado');
  assert.deepEqual(final.occasions.map((o) => o.id), ['oVelha']);

  const enviados = firestore.commits.flat().filter((op) => op.type === 'set').map((op) => op.path);
  assert.deepEqual(enviados, ['users/u1/events/velhoAqui'], 'só sobe o que a nuvem não tinha');
  assert.equal(memoria.marcacoes, 1);
});

test('janela: sem internet no download completo não marca como feito e não derruba a sincronização', async () => {
  const erros = [];
  const { sync, firestore, memoria } = setupWindow({ servidorForaDoAr: true, onStatusChange: (s) => erros.push(s) });

  await sync.start(data());
  seedWindow(firestore, {});
  await settle();

  assert.equal(memoria.marcacoes, 0, 'tenta de novo na próxima abertura');
  assert.equal(erros.length, 1);
  assert.equal(firestore.listeners.size, 5, 'a escuta do recente segue de pé');
});

test('janela: o download completo roda uma vez só por abertura, mesmo com vários retratos', async () => {
  const { sync, firestore } = setupWindow();

  await sync.start(data());
  seedWindow(firestore, {});
  firestore.listeners.get(LISTEN.events)({ docs: [{ data: () => ({ id: 'a', consumedAt: RECENTE }) }] });
  firestore.listeners.get(LISTEN.events)({ docs: [] });
  await settle();

  assert.equal(firestore.module.lidosDoServidor.filter((p) => p === 'users/u1/events').length, 1);
});

// Regressão: com as bebidas numa ordem diferente da dos ids, o app abria e regravava o meta
// sem parar (~1 escrita por segundo), porque cada eco da gravação parecia "ordem mudou".
test('bebidas em ordem própria: abrir o app e receber o eco não regrava o meta', async () => {
  const { sync, firestore } = setup();
  const meta = { preferences: { cleanInterface: true }, drinkOrder: ['d3', 'd1', 'd2'] };
  const doIdDoFirestore = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }];

  await sync.start(data({ drinks: [{ id: 'd3' }, { id: 'd1' }, { id: 'd2' }] }));
  seedAllListeners(firestore, { drinks: doIdDoFirestore, meta });
  await sync.flushPendingWrites();
  assert.equal(firestore.commits.length, 0, 'nada mudou ao abrir');

  // O eco chega de novo, várias vezes, como acontece a cada gravação em ciclo.
  for (let i = 0; i < 3; i += 1) {
    firestore.listeners.get('users/u1/meta/app')({ data: () => meta });
    await sync.flushPendingWrites();
  }
  assert.equal(firestore.commits.length, 0, 'nenhuma regravação do meta');
});
