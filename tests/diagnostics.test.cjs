// Modo tester avançado (docs/specs/0035): registro local de diagnóstico, desligado por padrão.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDiagnosticsLog, DIAGNOSTICS_STORAGE_KEY } = require('../src/diagnostics/log.js');
const { watchAuthRequests, hasStoredSession } = require('../src/diagnostics/probes.js');
const { createFirestoreSync } = require('../src/data/firestore-sync.js');

function fakeStorage(inicial = {}, { cheio = false } = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    get length() { return dados.size; },
    key: (indice) => [...dados.keys()][indice] ?? null,
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => {
      if (typeof cheio === 'function' ? cheio(valor) : cheio) throw Object.assign(new Error('cheio'), { name: 'QuotaExceededError' });
      dados.set(chave, String(valor));
    },
    removeItem: (chave) => dados.delete(chave),
  };
}

function setup({ storage = fakeStorage(), maxEntries } = {}) {
  const timers = { pendente: null };
  let agora = 1_800_000_000_000;
  const log = createDiagnosticsLog({
    storage, now: () => agora, maxEntries,
    schedule: (callback) => { timers.pendente = callback; return 1; },
    cancel: () => { timers.pendente = null; },
  });
  const salvo = () => JSON.parse(storage.getItem(DIAGNOSTICS_STORAGE_KEY));
  return { log, storage, timers, salvo, avancar: (ms) => { agora += ms; } };
}

test('desligado por padrão: registrar não grava nada', () => {
  const { log, storage, timers } = setup();
  log.record('app.abriu', { versao: '2.35.0' });
  assert.equal(log.isEnabled(), false);
  assert.equal(log.count(), 0);
  assert.equal(timers.pendente, null);
  assert.equal(storage.getItem(DIAGNOSTICS_STORAGE_KEY), null);
});

test('ligado, registra e grava no aparelho com um pequeno atraso; sobrevive a reabrir', () => {
  const { log, storage, timers, salvo } = setup();
  log.enable();
  log.record('conta.caiu', { online: true });
  assert.equal(salvo().entries.length, 0, 'ainda não gravou: espera o atraso');
  timers.pendente();
  assert.deepEqual(salvo().entries.map((e) => e.type), ['conta.caiu']);

  const reaberto = createDiagnosticsLog({ storage });
  assert.equal(reaberto.isEnabled(), true);
  assert.equal(reaberto.count(), 1);
});

test('flush grava na hora, para o sistema fechar o app em segundo plano sem perder nada', () => {
  const { log, timers, salvo } = setup();
  log.enable();
  log.record('app.oculto');
  log.flush();
  assert.equal(salvo().entries.length, 1);
  assert.equal(timers.pendente, null);
});

test('flush desligado não mexe no armazenamento (não desfaz um registro ligado por outra abertura)', () => {
  const storage = fakeStorage();
  const { log } = setup({ storage });
  storage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify({ enabled: true, since: 1, entries: [] }));
  log.flush();
  assert.notEqual(storage.getItem(DIAGNOSTICS_STORAGE_KEY), null);
});

test('desligar apaga o registro do aparelho', () => {
  const { log, storage } = setup();
  log.enable();
  log.record('rede', { online: false });
  log.flush();
  log.disable();
  assert.equal(log.count(), 0);
  assert.equal(storage.getItem(DIAGNOSTICS_STORAGE_KEY), null);
  log.record('rede', { online: true });
  assert.equal(log.count(), 0, 'desligado não volta a registrar');
});

test('apagar registro mantém o modo ligado e recomeça a contagem', () => {
  const { log, avancar } = setup();
  log.enable();
  const inicio = log.since();
  log.record('rede');
  avancar(60000);
  log.clear();
  assert.equal(log.isEnabled(), true);
  assert.equal(log.count(), 0);
  assert.ok(log.since() > inicio);
});

test('guarda só os mais recentes quando passa do limite', () => {
  const { log } = setup({ maxEntries: 3 });
  log.enable();
  for (let i = 0; i < 5; i += 1) log.record('evento', { i });
  assert.deepEqual(log.report().events.map((e) => e.i), [2, 3, 4]);
});

test('detalhes: textos curtos, um nível de objeto, nada de listas ou funções', () => {
  const { log } = setup();
  log.enable();
  log.record('teste', {
    longo: 'x'.repeat(500), numero: 3, infinito: Infinity, nada: undefined, nulo: null,
    contagem: { aqui: 3, fundo: { mais: 1 } }, lista: [1, 2], funcao: () => {},
  });
  const [evento] = log.report().events;
  assert.equal(evento.longo.length, 201);
  assert.equal(evento.numero, 3);
  assert.equal(evento.infinito, null);
  assert.equal(evento.nulo, null);
  assert.deepEqual(evento.contagem, { aqui: 3 });
  assert.equal('lista' in evento || 'funcao' in evento || 'nada' in evento, false);
});

test('relatório tem tipo, versão do formato e horários legíveis', () => {
  const { log } = setup();
  log.enable();
  log.record('app.abriu', { versao: '2.35.0' });
  const relatorio = log.report({ appVersion: '2.35.0', agora: { persistente: true } });
  assert.equal(relatorio.type, 'funtime-diagnostics');
  assert.equal(relatorio.formatVersion, 1);
  assert.equal(relatorio.appVersion, '2.35.0');
  assert.deepEqual(relatorio.agora, { persistente: true });
  assert.equal(relatorio.events[0].t, new Date(1_800_000_000_000).toISOString());
});

test('registro ilegível começa desligado, sem quebrar o app', () => {
  const storage = fakeStorage({ [DIAGNOSTICS_STORAGE_KEY]: '{quebrado' });
  const log = createDiagnosticsLog({ storage });
  assert.equal(log.isEnabled(), false);
});

test('sem espaço no aparelho, descarta a metade mais antiga e nunca lança', () => {
  // Só aceita gravar com até 2 eventos: com 4, o primeiro save falha e o segundo (2) passa.
  const storage = fakeStorage({}, { cheio: (valor) => JSON.parse(valor).entries.length > 2 });
  const { log, salvo } = setup({ storage });
  log.enable();
  for (let i = 0; i < 4; i += 1) log.record('evento', { i });
  assert.doesNotThrow(() => log.flush());
  assert.deepEqual(salvo().entries.map((e) => e.i), [2, 3]);
});

// --- Sondas -----------------------------------------------------------------------------

function fakeTarget(responder) {
  const chamadas = [];
  const target = {
    navigator: { onLine: true },
    fetch: async (...args) => { chamadas.push(args); return responder(...args); },
  };
  return { target, chamadas };
}
const resposta = (status, corpo) => ({ ok: status < 400, status, clone: () => ({ json: async () => corpo }) });

test('login: guarda só rota, status e o código do erro do Google', async () => {
  const registros = [];
  const { target } = fakeTarget(() => resposta(400, { error: { message: 'TOKEN_EXPIRED : detalhe com dado' } }));
  watchAuthRequests({ target, record: (type, d) => registros.push({ type, ...d }), isEnabled: () => true, now: () => 0 });

  const r = await target.fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSECRETA', { body: 'refresh_token=segredo' });
  assert.equal(r.status, 400);
  assert.deepEqual(registros, [{ type: 'conta.http', rota: 'token', status: 400, erro: 'TOKEN_EXPIRED', ms: 0, online: true }]);
  assert.equal(JSON.stringify(registros).includes('AIza') || JSON.stringify(registros).includes('segredo'), false);
});

test('login: falha de rede é registrada e repassada ao Firebase', async () => {
  const registros = [];
  const { target } = fakeTarget(() => { throw new TypeError('Failed to fetch'); });
  watchAuthRequests({ target, record: (type, d) => registros.push({ type, ...d }), isEnabled: () => true });

  await assert.rejects(() => target.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=x'), /Failed to fetch/);
  assert.equal(registros[0].rota, 'accounts:lookup');
  assert.equal(registros[0].falha, 'Failed to fetch');
});

test('login: outras requisições e o modo desligado passam direto, sem registro', async () => {
  const registros = [];
  let ligado = true;
  const { target, chamadas } = fakeTarget(() => resposta(200, {}));
  watchAuthRequests({ target, record: (type, d) => registros.push({ type, ...d }), isEnabled: () => ligado });
  watchAuthRequests({ target, record: () => registros.push('duplicado'), isEnabled: () => true });

  await target.fetch('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js', { mode: 'no-cors' });
  ligado = false;
  await target.fetch('https://securetoken.googleapis.com/v1/token?key=x');
  assert.equal(chamadas.length, 2);
  assert.deepEqual(registros, []);
});

test('sessão guardada: reconhece a chave do Firebase no localStorage', () => {
  assert.equal(hasStoredSession(fakeStorage({ 'firebase:authUser:k:[DEFAULT]': '{}' })), true);
  assert.equal(hasStoredSession(fakeStorage({ 'funtime-v1-data': '{}' })), false);
});

// --- Sincronização ----------------------------------------------------------------------

test('sincronização: cada retrato informa quantos registros ficaram e quantos foram descartados', async () => {
  const listeners = new Map();
  const firestore = {
    initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    collection: (db, ...p) => ({ path: p.join('/') }), doc: (db, ...p) => ({ path: p.join('/') }),
    serverTimestamp: () => 'ts', setDoc: async () => {},
    onSnapshot: (ref, next) => { listeners.set(ref.path, next); return () => {}; },
    writeBatch: () => ({ set() {}, delete() {}, commit: async () => {} }),
  };
  const notas = [];
  const sync = createFirestoreSync({
    app: {}, uid: 'u1', onRemoteUpdate: () => {},
    onDiagnostic: (type, build) => notas.push({ type, ...build() }),
    importModule: async () => firestore, schedule: () => 1, cancel: () => {},
  });
  const snap = (records) => ({ docs: records.map((r) => ({ data: () => r })) });

  await sync.start({ drinks: [], events: [{ id: 'a' }, { id: 'b' }], occasions: [], preferences: {} });
  for (const [path, next] of listeners) next(path.endsWith('meta/app') ? { data: () => null } : snap(path.endsWith('events') ? [{ id: 'a' }] : []));
  // Depois do primeiro retrato, a nuvem passa a não ter `a`: exclusão feita em outro aparelho.
  listeners.get('users/u1/events')(snap([]));

  const retratos = notas.filter((n) => n.type === 'sync.retrato');
  assert.deepEqual(retratos.map((r) => [r.primeiro, r.events]), [
    [true, { aqui: 2, nuvem: 1, resultado: 2, descartados: 0 }],
    [false, { aqui: 2, nuvem: 0, resultado: 1, descartados: 1 }],
  ]);
  assert.ok(notas.some((n) => n.type === 'sync.escutando'));
});
