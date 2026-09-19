const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSharedEvents, buildEventFicha, readEventDoc, EVENT_MAX_AHEAD_MS } = require('../src/data/shared-event.js');

const EU = 'uid-ana';
const BIA = 'uid-bia';
const CAIO = 'uid-caio';
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const AGORA = 1_000_000_000_000;
const PAR_BIA = 'uid-ana_uid-bia';

// Firestore em memória que APLICA as escritas (arrayUnion, arrayRemove, caminhos com
// ponto), notifica escutas e espelha o que o emulador mostrou: ler um documento que não
// existe fora de users/ é negado e REJEITA, e escuta negada chega como erro.
function fakeFirestore({ documentos = {}, negados = [] } = {}) {
  // Copia profunda que mantém os timestamps (objetos com toMillis) como estão.
  const clonar = (valor) => (Array.isArray(valor) ? valor.map(clonar)
    : valor && typeof valor === 'object' && typeof valor.toMillis !== 'function'
      ? Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, clonar(item)])) : valor);
  const docs = new Map(Object.entries(documentos).map(([path, data]) => [path, clonar(data)]));
  const escritas = [];
  const exclusoes = [];
  const escutas = [];
  const proibidos = new Set(negados);
  const erroNegado = () => Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  const ehUsers = (path) => path.startsWith('users/');

  const ts = (ms) => ({ toMillis: () => ms });
  const resolver = (valor, atual) => {
    if (valor?.__t === 'union') return [...new Set([...(atual || []), ...valor.v])];
    if (valor?.__t === 'remove') return (atual || []).filter((item) => !valor.v.includes(item));
    if (valor?.__t === 'ts') return ts(AGORA);
    return valor;
  };
  const gravar = (alvo, caminho, valor) => {
    const partes = caminho.split('.');
    const ultimo = partes.pop();
    let cursor = alvo;
    for (const parte of partes) cursor = (cursor[parte] ??= {});
    cursor[ultimo] = resolver(valor, cursor[ultimo]);
  };

  const snapshotDe = (path) => ({
    id: path.split('/').pop(), ref: { path },
    exists: () => docs.has(path), data: () => clonar(docs.get(path)),
    metadata: { fromCache: false },
  });
  const docsDaConsulta = (consulta) => [...docs.keys()]
    .filter((path) => path.startsWith(`${consulta.path}/`) && path.split('/').length === consulta.path.split('/').length + 1)
    .filter((path) => consulta.restricoes.every(({ campo, valor }) => docs.get(path)[campo] === valor))
    .map(snapshotDe);

  function notificar() {
    for (const escuta of escutas) {
      if (!escuta.ativa) continue;
      if (escuta.consulta) escuta.next({ docs: docsDaConsulta(escuta.consulta) });
      else if (docs.has(escuta.path)) escuta.next(snapshotDe(escuta.path));
      else escuta.next({ exists: () => false, data: () => undefined });
    }
  }

  const module = {
    initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}), getFirestore: () => ({}),
    serverTimestamp: () => ({ __t: 'ts' }),
    arrayUnion: (...v) => ({ __t: 'union', v }),
    arrayRemove: (...v) => ({ __t: 'remove', v }),
    Timestamp: { fromMillis: (ms) => ts(ms) },
    doc: (db, ...path) => ({ path: path.join('/') }),
    collection: (db, ...path) => ({ path: path.join('/') }),
    query: (referencia, ...restricoes) => ({ path: referencia.path, restricoes, consulta: true }),
    where: (campo, operador, valor) => ({ campo, operador, valor }),
    getDoc: async (ref) => {
      if (proibidos.has(ref.path)) throw erroNegado();
      if (docs.has(ref.path)) return snapshotDe(ref.path);
      if (!ehUsers(ref.path)) throw erroNegado();
      return { exists: () => false, data: () => undefined };
    },
    getDocs: async (consulta) => ({ docs: docsDaConsulta(consulta) }),
    setDoc: async (ref, data, opcoes) => {
      escritas.push({ path: ref.path, data, set: true });
      const novo = opcoes?.merge ? (docs.get(ref.path) || {}) : {};
      for (const [chave, valor] of Object.entries(data)) gravar(novo, chave, valor);
      docs.set(ref.path, novo);
      notificar();
    },
    updateDoc: async (ref, data) => {
      escritas.push({ path: ref.path, data, update: true });
      if (proibidos.has(ref.path)) throw erroNegado();
      if (!docs.has(ref.path)) throw Object.assign(new Error('not-found'), { code: 'not-found' });
      for (const [chave, valor] of Object.entries(data)) gravar(docs.get(ref.path), chave, valor);
      notificar();
    },
    deleteDoc: async (ref) => { exclusoes.push(ref.path); docs.delete(ref.path); notificar(); },
    onSnapshot: (referencia, next, erro) => {
      const escuta = { path: referencia.path, consulta: referencia.consulta ? referencia : null, next, erro, ativa: true };
      escutas.push(escuta);
      Promise.resolve().then(() => {
        if (!escuta.ativa) return;
        if (escuta.consulta) next({ docs: docsDaConsulta(escuta.consulta) });
        else if (proibidos.has(escuta.path) || (!docs.has(escuta.path) && !ehUsers(escuta.path))) { escuta.ativa = false; erro?.(erroNegado()); }
        else next(docs.has(escuta.path) ? snapshotDe(escuta.path) : { exists: () => false, data: () => undefined });
      });
      return () => { escuta.ativa = false; };
    },
  };

  return {
    module, docs, escritas, exclusoes,
    negar: (path) => { proibidos.add(path); },
    // O servidor derruba a escuta: o que o SDK faz quando a regra passa a negar.
    derrubar: (path, codigo = 'permission-denied') => {
      for (const escuta of escutas) if (escuta.ativa && escuta.path === path) { escuta.ativa = false; escuta.erro?.(Object.assign(new Error(codigo), { code: codigo })); }
    },
    escutasAtivas: (path) => escutas.filter((escuta) => escuta.ativa && escuta.path === path).length,
    notificar,
  };
}

function setup({ documentos, negados, uid = EU, now = () => AGORA, timers, ...callbacks } = {}) {
  const firestore = fakeFirestore({ documentos, negados });
  let contador = 0;
  const eventos = []; const convites = []; const erros = [];
  const sharedEvents = createSharedEvents({
    app: {}, uid, importModule: async () => firestore.module, now,
    createEventId: () => `ev-${++contador}`,
    onEventsChange: (lista) => eventos.push(lista),
    onInvitesChange: (lista) => convites.push(lista),
    onStatusChange: ({ error }) => erros.push(error),
    schedule: timers?.schedule, cancel: timers?.cancel,
    ...callbacks,
  });
  const ultimos = () => ({ eventos: eventos.at(-1), convites: convites.at(-1) });
  return { sharedEvents, firestore, eventos, convites, erros, ultimos };
}

const ocasiao = (extra = {}) => ({ id: 'oc-1', name: 'Festa Junina', startedAt: null, endedAt: null, scheduledStartAt: AGORA + 2 * DIA, scheduledEndAt: AGORA + 2 * DIA + 6 * HORA, timeZone: 'America/Sao_Paulo', ...extra });
const paresCom = (invitesFromOther, otherUid = BIA) => [{ pairId: `${EU}_${otherUid}`, otherUid, acceptedByMe: true, acceptedByOther: true, invitesFromOther }];
const docEvento = (extra = {}) => ({
  hostUid: BIA, name: 'Festa', startAt: AGORA + 2 * DIA, endAt: AGORA + 2 * DIA + 6 * HORA, timeZone: 'America/Sao_Paulo',
  status: 'active', invited: [EU], going: [], schemaVersion: 1,
  expiresAt: { toMillis: () => AGORA + 3 * DIA }, updatedAt: { toMillis: () => AGORA }, ...extra,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- funções puras --------------------------------------------------------------

test('a ficha carrega só nome, horário, fuso e prazo — nada de dose, bebida ou id da ocasião', () => {
  const ficha = buildEventFicha(ocasiao({ id: 'segredo', drinkId: 'd1', events: [1] }));

  assert.deepEqual(Object.keys(ficha).sort(), ['endAt', 'expiresAtMs', 'name', 'startAt', 'timeZone']);
  assert.ok(!JSON.stringify(ficha).includes('segredo'));
});

test('o prazo da ficha é fim + 24h, ou início + 48h + 24h se não há fim', () => {
  assert.equal(buildEventFicha(ocasiao()).expiresAtMs, AGORA + 2 * DIA + 6 * HORA + DIA);
  assert.equal(buildEventFicha(ocasiao({ scheduledEndAt: null })).expiresAtMs, AGORA + 2 * DIA + 48 * HORA + DIA);
});

test('evento em andamento usa o início efetivo; encerrado, o fim efetivo', () => {
  const ficha = buildEventFicha({ id: 'a', name: 'X', startedAt: 500, endedAt: 900, scheduledStartAt: 400, scheduledEndAt: 800 });
  assert.equal(ficha.startAt, 500);
  assert.equal(ficha.endAt, 900);
});

test('sem horário de início não há ficha', () => {
  assert.equal(buildEventFicha({ id: 'a', name: 'X', startedAt: null }), null);
});

test('readEventDoc falha fechado com dado malformado', () => {
  for (const ruim of [null, {}, { hostUid: '' }, { hostUid: 'x' }, { hostUid: 'x', startAt: 1 }, 'texto']) {
    assert.equal(readEventDoc(ruim, 'ev'), null);
  }
  const ok = readEventDoc(docEvento({ invited: [EU, 5, ''], going: 'x' }), 'ev');
  assert.deepEqual(ok.invited, [EU], 'descarta o que não é uid');
  assert.deepEqual(ok.going, []);
});

// --- organizador ----------------------------------------------------------------

test('publicar cria a ficha SEM convidados e só com os campos que as regras aceitam', async () => {
  const { sharedEvents, firestore } = setup();

  const resultado = await sharedEvents.publishEvent(ocasiao());

  assert.deepEqual(resultado, { ok: true, eventId: 'ev-1' });
  const gravacao = firestore.escritas.find((item) => item.path === 'sharedEvents/ev-1');
  assert.deepEqual(Object.keys(gravacao.data).sort(), ['createdAt', 'endAt', 'expiresAt', 'going', 'hostUid', 'invited', 'name', 'schemaVersion', 'startAt', 'status', 'timeZone', 'updatedAt']);
  assert.deepEqual([gravacao.data.invited, gravacao.data.going, gravacao.data.status, gravacao.data.hostUid], [[], [], 'active', EU]);
});

test('não publica evento que já acabou nem além do teto das regras', async () => {
  const { sharedEvents, firestore } = setup();

  assert.deepEqual(await sharedEvents.publishEvent(ocasiao({ scheduledStartAt: AGORA - 3 * DIA, scheduledEndAt: AGORA - 2 * DIA })), { ok: false, reason: 'over' });
  assert.deepEqual(await sharedEvents.publishEvent(ocasiao({ scheduledStartAt: AGORA + EVENT_MAX_AHEAD_MS, scheduledEndAt: null })), { ok: false, reason: 'too-far' });
  assert.deepEqual(firestore.escritas, []);
});

// Se o ponteiro chegasse antes do documento, o amigo tentaria ler e seria negado — e a
// escuta negada morre de vez (spec 0025).
test('convidar escreve o documento do evento ANTES do ponteiro no pareamento', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { [`pairings/${PAR_BIA}`]: { uids: [EU, BIA] } } });
  const { eventId } = await sharedEvents.publishEvent(ocasiao());
  firestore.escritas.length = 0;

  await sharedEvents.invite(eventId, BIA);

  assert.deepEqual(firestore.escritas.map((item) => item.path), [`sharedEvents/${eventId}`, `pairings/${PAR_BIA}`]);
  assert.deepEqual(firestore.docs.get(`sharedEvents/${eventId}`).invited, [BIA]);
  assert.deepEqual(firestore.docs.get(`pairings/${PAR_BIA}`).invites[EU], [eventId]);
});

test('reconvidar quem já foi convidado não escreve nada', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { [`pairings/${PAR_BIA}`]: { uids: [EU, BIA] } } });
  const { eventId } = await sharedEvents.publishEvent(ocasiao());
  await sharedEvents.invite(eventId, BIA);
  firestore.escritas.length = 0;

  await sharedEvents.invite(eventId, BIA);

  assert.deepEqual(firestore.escritas, []);
});

test('o ponteiro lista todos os eventos a que a pessoa foi convidada, e só os que valem', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { [`pairings/${PAR_BIA}`]: { uids: [EU, BIA] } } });
  const a = await sharedEvents.publishEvent(ocasiao());
  const b = await sharedEvents.publishEvent(ocasiao({ name: 'Jantar' }));
  await sharedEvents.invite(a.eventId, BIA);
  await sharedEvents.invite(b.eventId, BIA);
  assert.deepEqual(firestore.docs.get(`pairings/${PAR_BIA}`).invites[EU], [a.eventId, b.eventId]);

  await sharedEvents.cancelEvent(a.eventId);
  await sharedEvents.uninvite(b.eventId, BIA);

  assert.equal(firestore.docs.get(`pairings/${PAR_BIA}`).invites[EU], null, 'sem nada válido o ponteiro volta a null');
});

// `going` só pode conter quem está em `invited` (regra): a retirada leva os dois juntos.
test('retirar um convidado tira convite e presença na MESMA escrita', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { [`pairings/${PAR_BIA}`]: { uids: [EU, BIA] } } });
  const { eventId } = await sharedEvents.publishEvent(ocasiao());
  await sharedEvents.invite(eventId, BIA);
  firestore.docs.get(`sharedEvents/${eventId}`).going = [BIA];
  firestore.escritas.length = 0;

  await sharedEvents.uninvite(eventId, BIA);

  const escrita = firestore.escritas.find((item) => item.path === `sharedEvents/${eventId}`);
  assert.deepEqual(Object.keys(escrita.data).sort(), ['going', 'invited', 'updatedAt']);
  assert.deepEqual(firestore.docs.get(`sharedEvents/${eventId}`).going, []);
});

test('convidar vários: uma falha não impede as outras', async () => {
  const { sharedEvents, firestore, erros } = setup({ documentos: { [`pairings/${PAR_BIA}`]: { uids: [EU, BIA] }, [`pairings/uid-ana_${CAIO}`]: { uids: [EU, CAIO] } } });
  const { eventId } = await sharedEvents.publishEvent(ocasiao());
  const original = firestore.module.updateDoc;
  firestore.module.updateDoc = async (ref, data) => {
    if (ref.path === `sharedEvents/${eventId}` && data.invited?.v?.[0] === BIA) throw new Error('negado');
    return original(ref, data);
  };

  const resultado = await sharedEvents.inviteMany(eventId, [BIA, CAIO, BIA]);

  assert.deepEqual(resultado, { invited: [CAIO], failed: [BIA] });
  assert.equal(erros.length, 1);
});

// Apagar derrubaria a escuta de quem foi convidado.
test('cancelar muda só o estado do evento, não apaga nada', async () => {
  const { sharedEvents, firestore } = setup();
  const { eventId } = await sharedEvents.publishEvent(ocasiao());
  firestore.escritas.length = 0;

  await sharedEvents.cancelEvent(eventId);

  assert.deepEqual(firestore.exclusoes, []);
  assert.equal(firestore.docs.get(`sharedEvents/${eventId}`).status, 'cancelled');
  assert.deepEqual(Object.keys(firestore.escritas[0].data).sort(), ['status', 'updatedAt']);
});

// O callback do timer não devolve a promessa do flush: sem esperar um ciclo, a asserção
// rodaria antes de a escrita acontecer e um teste "sem escrita" passaria por acaso.
async function disparar(timers) {
  timers.fila[0]();
  await tick(); await tick(); await tick();
}

function timerManual() {
  const fila = [];
  return { fila, schedule: (fn) => { fila.push(fn); return fila.length; }, cancel: () => { fila.length = 0; } };
}

test('a ficha só é regravada quando mudou; commit sem relação não escreve', async () => {
  const timers = timerManual();
  const { sharedEvents, firestore } = setup({ timers });
  const item = ocasiao();
  const { eventId } = await sharedEvents.publishEvent(item);
  const ligada = { ...item, sharedEventId: eventId, sharedHostUid: EU };
  firestore.escritas.length = 0;

  sharedEvents.scheduleFichaPush({ occasions: [ligada] });
  await disparar(timers);
  assert.deepEqual(firestore.escritas, [], 'nada mudou na ficha');

  sharedEvents.scheduleFichaPush({ occasions: [{ ...ligada, name: 'Festa Junina 2' }] });
  await disparar(timers);
  assert.equal(firestore.escritas.length, 1);
  assert.equal(firestore.docs.get(`sharedEvents/${eventId}`).name, 'Festa Junina 2');

  firestore.escritas.length = 0;
  sharedEvents.scheduleFichaPush({ occasions: [{ ...ligada, name: 'Festa Junina 2' }] });
  await disparar(timers);
  assert.deepEqual(firestore.escritas, [], 'repetir o mesmo estado não regrava');
});

// Outro aparelho da mesma conta pode simplesmente ainda não ter sincronizado a ocasião.
test('a ocasião AUSENTE do estado local não cancela nem apaga o evento', async () => {
  const timers = timerManual();
  const { sharedEvents, firestore } = setup({ timers });
  const { eventId } = await sharedEvents.publishEvent(ocasiao());
  firestore.escritas.length = 0;

  sharedEvents.scheduleFichaPush({ occasions: [] });
  await disparar(timers);

  assert.deepEqual(firestore.escritas, []);
  assert.deepEqual(firestore.exclusoes, []);
  assert.equal(firestore.docs.get(`sharedEvents/${eventId}`).status, 'active');
});

test('ao reabrir o app, o documento lido vira a base: a ficha igual não é regravada', async () => {
  const timers = timerManual();
  const doc = { hostUid: EU, name: 'Festa Junina', startAt: AGORA + 2 * DIA, endAt: AGORA + 2 * DIA + 6 * HORA, timeZone: 'America/Sao_Paulo', status: 'active', invited: [], going: [], expiresAt: { toMillis: () => AGORA + 2 * DIA + 6 * HORA + DIA } };
  const { sharedEvents, firestore } = setup({ timers, documentos: { 'sharedEvents/ev-9': doc } });
  await sharedEvents.start();
  await tick();
  firestore.escritas.length = 0;

  sharedEvents.scheduleFichaPush({ occasions: [ocasiao({ sharedEventId: 'ev-9', sharedHostUid: EU })] });
  await disparar(timers);

  assert.deepEqual(firestore.escritas, []);
});

test('uma ficha que falhou ao gravar é tentada de novo', async () => {
  const timers = timerManual();
  const { sharedEvents, firestore } = setup({ timers });
  const item = ocasiao();
  const { eventId } = await sharedEvents.publishEvent(item);
  const ligada = { ...item, name: 'Novo nome', sharedEventId: eventId, sharedHostUid: EU };

  firestore.negar(`sharedEvents/${eventId}`);
  sharedEvents.scheduleFichaPush({ occasions: [ligada] });
  await disparar(timers);
  firestore.escritas.length = 0;
  firestore.module.updateDoc = async (ref, data) => { firestore.escritas.push({ path: ref.path, data }); };

  sharedEvents.scheduleFichaPush({ occasions: [ligada] });
  await disparar(timers);

  assert.equal(firestore.escritas.length, 1, 'a segunda tentativa grava');
});

test('a consulta do organizador ignora documento de outro organizador e vencido é apagado', async () => {
  const doc = (extra) => ({ hostUid: EU, name: 'X', startAt: AGORA, endAt: null, timeZone: '', status: 'active', invited: [BIA], going: [], ...extra });
  const { sharedEvents, firestore, ultimos } = setup({
    documentos: {
      'sharedEvents/vivo': doc({ expiresAt: { toMillis: () => AGORA + DIA } }),
      'sharedEvents/vencido': doc({ expiresAt: { toMillis: () => AGORA - 1 } }),
      'sharedEvents/alheio': doc({ hostUid: BIA, expiresAt: { toMillis: () => AGORA + DIA } }),
      [`pairings/${PAR_BIA}`]: { uids: [EU, BIA], invites: { [EU]: ['vivo', 'vencido'] } },
    },
  });

  await sharedEvents.start();
  await tick(); await tick();

  assert.deepEqual(ultimos().eventos.map((item) => item.eventId), ['vivo']);
  assert.ok(firestore.exclusoes.includes('sharedEvents/vencido'));
  assert.ok(!firestore.exclusoes.includes('sharedEvents/alheio'), 'nunca apaga o que não é seu');
  assert.deepEqual(firestore.docs.get(`pairings/${PAR_BIA}`).invites[EU], ['vivo'], 'tira o vencido do ponteiro do convidado');
});

// --- convidado ------------------------------------------------------------------

test('um ponteiro de amigo vira convite pendente, lendo o evento uma vez', async () => {
  const { sharedEvents, ultimos } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });

  sharedEvents.setPairings(paresCom(['ev-b']));
  await tick(); await tick();

  assert.equal(ultimos().convites.length, 1);
  assert.equal(ultimos().convites[0].eventId, 'ev-b');
  assert.equal(ultimos().convites[0].hostUid, BIA);
});

test('o ponteiro que aponta para evento de OUTRA pessoa é ignorado', async () => {
  // Bia publica um ponteiro para um evento cujo organizador é Caio: seria um convite
  // com a cara da Bia para algo que não é dela.
  const { sharedEvents, convites } = setup({ documentos: { 'sharedEvents/ev-c': docEvento({ hostUid: CAIO }) } });

  sharedEvents.setPairings(paresCom(['ev-c']));
  await tick(); await tick();

  assert.equal(convites.length, 0);
});

test('convite cancelado, vencido, inexistente ou de amizade não aceita não aparece', async () => {
  const { sharedEvents, convites, erros } = setup({
    documentos: {
      'sharedEvents/cancelado': docEvento({ status: 'cancelled' }),
      'sharedEvents/vencido': docEvento({ expiresAt: { toMillis: () => AGORA - 1 } }),
      'sharedEvents/ja-acabou': docEvento({ endAt: AGORA - 1 }),
      'sharedEvents/ok': docEvento(),
    },
  });

  sharedEvents.setPairings(paresCom(['cancelado', 'vencido', 'ja-acabou', 'nao-existe']));
  sharedEvents.setPairings([{ ...paresCom(['ok'])[0], acceptedByOther: false }]);
  await tick(); await tick();

  assert.equal(convites.length, 0);
  assert.deepEqual(erros, [], 'negado/inexistente não é erro para reportar');
});

test('recusar lembra na conta e não escreve nada no documento do evento', async () => {
  const { sharedEvents, firestore, ultimos } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });
  sharedEvents.setPairings(paresCom(['ev-b']));
  await tick(); await tick();

  await sharedEvents.decline('ev-b');

  assert.equal(ultimos().convites.length, 0);
  assert.deepEqual(firestore.escritas.map((item) => item.path), [`users/${EU}/meta/sharedEvents`], 'só a área exclusiva do dono');
  assert.ok(firestore.docs.get(`users/${EU}/meta/sharedEvents`).dismissed['ev-b'] > 0);
});

test('convite recusado não volta a aparecer, nem em outra sessão', async () => {
  const { sharedEvents, convites } = setup({
    documentos: { 'sharedEvents/ev-b': docEvento(), [`users/${EU}/meta/sharedEvents`]: { dismissed: { 'ev-b': AGORA - 1000 } } },
  });

  sharedEvents.setPairings(paresCom(['ev-b']));
  await tick(); await tick();

  assert.equal(convites.length, 0);
});

test('aceitar relê o evento, escreve só a própria presença e devolve o que virará a ocasião', async () => {
  const { sharedEvents, firestore, ultimos } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });
  sharedEvents.setPairings(paresCom(['ev-b']));
  await tick(); await tick();
  firestore.escritas.length = 0;

  const resultado = await sharedEvents.accept('ev-b');

  assert.equal(resultado.ok, true);
  assert.equal(resultado.event.name, 'Festa');
  assert.deepEqual(resultado.event.going, [EU]);
  assert.equal(firestore.escritas.length, 1);
  assert.deepEqual(Object.keys(firestore.escritas[0].data), ['going'], 'a única coisa que o convidado pode escrever');
  assert.deepEqual(firestore.docs.get('sharedEvents/ev-b').going, [EU]);
  assert.equal(ultimos().convites.length, 0);
});

test('aceitar um evento cancelado, vencido ou retirado devolve o motivo e não escreve', async () => {
  const { sharedEvents, firestore } = setup({
    documentos: {
      'sharedEvents/cancelado': docEvento({ status: 'cancelled' }),
      'sharedEvents/acabou': docEvento({ endAt: AGORA - 1 }),
    },
    negados: ['sharedEvents/retirado'],
  });

  assert.deepEqual(await sharedEvents.accept('cancelado'), { ok: false, reason: 'cancelled' });
  assert.deepEqual(await sharedEvents.accept('acabou'), { ok: false, reason: 'over' });
  assert.deepEqual(await sharedEvents.accept('retirado'), { ok: false, reason: 'not-found' });
  assert.deepEqual(await sharedEvents.accept('inexistente'), { ok: false, reason: 'not-found' });
  assert.deepEqual(firestore.escritas, []);
});

test('sair retira só a própria presença; convite já retirado não é erro', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { 'sharedEvents/ev-b': docEvento({ going: [EU, CAIO] }) } });

  await sharedEvents.leave('ev-b');
  assert.deepEqual(firestore.docs.get('sharedEvents/ev-b').going, [CAIO]);

  firestore.negar('sharedEvents/ev-b');
  await assert.doesNotReject(sharedEvents.leave('ev-b'));
});

test('a ocasião ligada passa a ser escutada e reflete mudança do organizador', async () => {
  const { sharedEvents, firestore, ultimos } = setup({ documentos: { 'sharedEvents/ev-b': docEvento({ going: [CAIO] }) } });

  sharedEvents.setLinked([{ eventId: 'ev-b', hostUid: BIA }]);
  await tick(); await tick();
  assert.equal(ultimos().eventos.find((item) => item.eventId === 'ev-b').name, 'Festa');
  assert.equal(ultimos().eventos[0].isHost, false);

  firestore.docs.get('sharedEvents/ev-b').name = 'Festa no sítio';
  firestore.notificar();
  assert.equal(ultimos().eventos[0].name, 'Festa no sítio');
  assert.deepEqual(ultimos().eventos[0].going, [CAIO]);
});

test('quando o convite é retirado a escuta cai e o evento vira "indisponível", sem reportar erro', async () => {
  const { sharedEvents, firestore, ultimos, erros } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });
  sharedEvents.setLinked([{ eventId: 'ev-b', hostUid: BIA }]);
  await tick(); await tick();

  firestore.derrubar('sharedEvents/ev-b');

  assert.deepEqual(ultimos().eventos, [{ eventId: 'ev-b', hostUid: BIA, isHost: false, gone: true }]);
  assert.deepEqual(erros, []);
});

test('desligar a ocasião para de escutar; evento meu nunca é escutado como de outro', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });

  sharedEvents.setLinked([{ eventId: 'ev-b', hostUid: BIA }, { eventId: 'ev-meu', hostUid: EU }]);
  await tick(); await tick();
  assert.equal(firestore.escutasAtivas('sharedEvents/ev-b'), 1);
  assert.equal(firestore.escutasAtivas('sharedEvents/ev-meu'), 0, 'os meus vêm da consulta por hostUid');

  sharedEvents.setLinked([]);
  assert.equal(firestore.escutasAtivas('sharedEvents/ev-b'), 0);
});

test('convite já aceito (ocasião ligada) sai da lista de pendentes', async () => {
  const { sharedEvents, ultimos } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });
  sharedEvents.setPairings(paresCom(['ev-b']));
  await tick(); await tick();
  assert.equal(ultimos().convites.length, 1);

  sharedEvents.setLinked([{ eventId: 'ev-b', hostUid: BIA }]);

  assert.equal(ultimos().convites.length, 0);
});

test('quando o ponteiro some, o convite pendente some junto', async () => {
  const { sharedEvents, ultimos } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });
  sharedEvents.setPairings(paresCom(['ev-b']));
  await tick(); await tick();

  sharedEvents.setPairings(paresCom([]));

  assert.equal(ultimos().convites.length, 0);
});

// --- apagar tudo / parar --------------------------------------------------------

test('apagar dados na nuvem: apaga meus eventos, limpa ponteiros e retira minha presença nos dos outros', async () => {
  const { sharedEvents, firestore } = setup({
    documentos: {
      'sharedEvents/meu': { hostUid: EU, name: 'X', startAt: AGORA, invited: [BIA], going: [], expiresAt: { toMillis: () => AGORA + DIA } },
      'sharedEvents/dele': docEvento({ going: [EU, CAIO] }),
      [`pairings/${PAR_BIA}`]: { uids: [EU, BIA], invites: { [EU]: ['meu'] } },
      [`users/${EU}/meta/sharedEvents`]: { dismissed: { a: 1 } },
    },
  });

  await sharedEvents.deleteAllMyData({ joinedEventIds: ['dele'] });

  assert.ok(firestore.exclusoes.includes('sharedEvents/meu'));
  assert.equal(firestore.docs.get(`pairings/${PAR_BIA}`).invites[EU], null);
  assert.deepEqual(firestore.docs.get('sharedEvents/dele').going, [CAIO]);
  assert.ok(firestore.exclusoes.includes(`users/${EU}/meta/sharedEvents`));
});

test('stop interrompe as escutas e não apaga nada', async () => {
  const { sharedEvents, firestore, eventos } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() } });
  await sharedEvents.start();
  sharedEvents.setLinked([{ eventId: 'ev-b', hostUid: BIA }]);
  await tick(); await tick();
  const antes = eventos.length;

  sharedEvents.stop();
  firestore.notificar();

  assert.deepEqual(firestore.exclusoes, []);
  assert.equal(eventos.length, antes, 'depois de parar, nada mais é emitido');
  assert.equal(firestore.escutasAtivas('sharedEvents/ev-b'), 0);
});

// A ficha nunca leva dose, bebida ou o id da ocasião — vira asserção sobre o que de fato
// é gravado, não só sobre a função que monta o payload.
test('PRIVACIDADE: nada gravado no evento carrega dose, bebida ou id da ocasião', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { [`pairings/${PAR_BIA}`]: { uids: [EU, BIA] } } });
  const { eventId } = await sharedEvents.publishEvent(ocasiao({ id: 'oc-segredo', drinkId: 'd-segredo', events: [{ drinkName: 'Cerveja' }] }));
  await sharedEvents.invite(eventId, BIA);

  const gravado = JSON.stringify(firestore.escritas.filter((item) => item.path.startsWith('sharedEvents/')));
  assert.ok(!/segredo|drink|Cerveja|occasionId/i.test(gravado), gravado);
});

// Offline o SDK só resolve a escrita quando o servidor confirma: esperar isso prenderia a
// pessoa numa tela travada depois de tocar "Vou" ou "Sair".
test('aceitar sem internet não trava: a escrita fica na fila e a pessoa segue em frente', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() }, ackWaitMs: 20 });
  const original = firestore.module.updateDoc;
  firestore.module.updateDoc = () => new Promise(() => { /* nunca confirma: sem rede */ });

  const resultado = await sharedEvents.accept('ev-b');

  assert.equal(resultado.ok, true);
  assert.equal(resultado.event.name, 'Festa');
  firestore.module.updateDoc = original;
});

test('sair sem internet também não trava', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() }, ackWaitMs: 20 });
  firestore.module.updateDoc = () => new Promise(() => {});

  await assert.doesNotReject(sharedEvents.leave('ev-b'));
});

test('uma negação que chega dentro do prazo ainda é respeitada ao aceitar', async () => {
  const { sharedEvents, firestore } = setup({ documentos: { 'sharedEvents/ev-b': docEvento() }, ackWaitMs: 500 });
  firestore.module.updateDoc = async () => { throw Object.assign(new Error('negado'), { code: 'permission-denied' }); };

  assert.deepEqual(await sharedEvents.accept('ev-b'), { ok: false, reason: 'not-found' });
});
