// O módulo real (src/data/shared-event.js) com o SDK real contra o emulador do Firestore
// e as regras REAIS (firestore.rules). Rode com `npm run test:rules`.
//
// Existe porque o Firestore falso dos testes unitários não sabe o que as regras negam: foi
// assim que a v2.3.2 passou nos testes e falhou no primeiro uso real (spec 0023). Aqui,
// qualquer descompasso entre o que o cliente escreve e o que as regras aceitam aparece.
const { test: nodeTest, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const real = require('firebase/firestore');
const { createSharedEvents } = require('../src/data/shared-event.js');

const emuladorAtivo = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const test = (nome, fn) => nodeTest(nome, {
  skip: emuladorAtivo ? false : 'emulador do Firestore desligado — rode `npm run test:rules`',
}, fn);

const ANA = 'aaa-ana';
const BIA = 'bbb-bia';
const CAIO = 'ccc-caio';
const DINO = 'ddd-dino';
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const parDe = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

let env;
const abertos = [];

before(async () => {
  if (!emuladorAtivo) return;
  real.setLogLevel('silent');
  env = await initializeTestEnvironment({ projectId: 'funtime-evento-teste', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { for (const s of abertos) s.stop(); await env?.cleanup(); });
beforeEach(async () => {
  if (!emuladorAtivo) return;
  for (const s of abertos.splice(0)) s.stop();
  await env.clearFirestore();
  // Amizades já aceitas pelos dois lados — sem `invites`, como os pareamentos criados antes da spec.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const outro of [BIA, CAIO]) {
      await real.setDoc(real.doc(db, 'pairings', parDe(ANA, outro)), {
        uids: [ANA, outro].sort(), createdBy: outro, createdAt: real.Timestamp.now(), viaCode: null,
        acceptedBy: [ANA, outro], aliases: {}, sharing: {},
      });
    }
  });
});

function pessoa(uid, extra = {}) {
  const db = env.authenticatedContext(uid).firestore();
  const eventos = []; const convites = []; const erros = [];
  const sharedEvents = createSharedEvents({
    app: {}, uid,
    importModule: async () => ({ ...real, initializeFirestore: () => { throw new Error('sem cache persistente'); }, getFirestore: () => db }),
    onEventsChange: (lista) => eventos.push(lista),
    onInvitesChange: (lista) => convites.push(lista),
    onStatusChange: ({ error }) => erros.push(error),
    ...extra,
  });
  abertos.push(sharedEvents);
  return { uid, db, sharedEvents, eventos, convites, erros, ultimos: () => eventos.at(-1) ?? [], ultimosConvites: () => convites.at(-1) ?? [] };
}

async function esperar(condicao, descricao, ms = 4000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (await condicao()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`esperava: ${descricao}`);
}

const ocasiao = (extra = {}) => ({
  id: 'oc-1', name: 'Festa Junina', startedAt: null, endedAt: null,
  scheduledStartAt: Date.now() + 2 * DIA, scheduledEndAt: Date.now() + 2 * DIA + 6 * HORA, timeZone: 'America/Sao_Paulo', ...extra,
});
const paresDe = (otherUid, ids) => [{ pairId: parDe(ANA, otherUid), otherUid, acceptedByMe: true, acceptedByOther: true, invitesFromOther: ids }];
// Lê SEM regras: com regras, ler um documento que já não existe é negado (a regra lê
// resource.data) e a promessa rejeita — serve para perguntar "ainda existe?" sem esse efeito.
async function lerSemRegras(caminho) {
  let resultado;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snapshot = await real.getDoc(real.doc(ctx.firestore(), ...caminho.split('/')));
    resultado = { existe: snapshot.exists(), dados: snapshot.data() };
  });
  return resultado;
}
const lerPar = async (uid, outro) => (await real.getDoc(real.doc(env.authenticatedContext(uid).firestore(), 'pairings', parDe(ANA, outro)))).data();

test('ciclo completo: publicar, convidar, receber, aceitar e o organizador ver a confirmação', async () => {
  const ana = pessoa(ANA); const bia = pessoa(BIA);
  await ana.sharedEvents.start();

  const { ok, eventId } = await ana.sharedEvents.publishEvent(ocasiao());
  assert.equal(ok, true);
  await ana.sharedEvents.invite(eventId, BIA);
  assert.deepEqual((await lerPar(ANA, BIA)).invites[ANA], [eventId], 'o ponteiro chegou ao pareamento (que antes não tinha o campo)');

  bia.sharedEvents.setPairings(paresDe(ANA, [eventId]));
  await esperar(() => bia.ultimosConvites().length === 1, 'a Bia recebe o convite pendente');
  assert.equal(bia.ultimosConvites()[0].name, 'Festa Junina');
  assert.equal(bia.ultimosConvites()[0].hostUid, ANA);

  const aceite = await bia.sharedEvents.accept(eventId);
  assert.equal(aceite.ok, true, JSON.stringify(aceite));
  await esperar(() => ana.ultimos().find((item) => item.eventId === eventId)?.going.includes(BIA), 'a Ana vê que a Bia confirmou');
  assert.deepEqual(ana.erros, []);
  assert.deepEqual(bia.erros, []);
});

test('quem confirmou acompanha o evento; mudança de horário do organizador chega, e cancelar é suave', async () => {
  const timers = { fila: [] };
  const ana = pessoa(ANA, { schedule: (fn) => { timers.fila.push(fn); return timers.fila.length; }, cancel: () => { timers.fila.length = 0; } });
  const bia = pessoa(BIA);
  await ana.sharedEvents.start();
  const item = ocasiao();
  const { eventId } = await ana.sharedEvents.publishEvent(item);
  await ana.sharedEvents.invite(eventId, BIA);
  await bia.sharedEvents.accept(eventId);
  bia.sharedEvents.setLinked([{ eventId, hostUid: ANA }]);
  await esperar(() => bia.ultimos().find((v) => v.eventId === eventId)?.name === 'Festa Junina', 'a Bia escuta o evento');

  ana.sharedEvents.scheduleFichaPush({ occasions: [{ ...item, name: 'Festa no sítio', sharedEventId: eventId, sharedHostUid: ANA }] });
  timers.fila[0]();
  await esperar(() => bia.ultimos().find((v) => v.eventId === eventId)?.name === 'Festa no sítio', 'a mudança de nome chega à Bia');

  await ana.sharedEvents.cancelEvent(eventId);
  await esperar(() => bia.ultimos().find((v) => v.eventId === eventId)?.status === 'cancelled', 'a Bia vê o cancelamento em vez de perder a escuta');
  assert.equal(bia.ultimos().find((v) => v.eventId === eventId).gone, undefined, 'cancelado continua legível');
  assert.deepEqual(bia.erros, []);
});

test('retirar o convite derruba a escuta da pessoa, sem virar erro; a presença some junto', async () => {
  const ana = pessoa(ANA); const bia = pessoa(BIA);
  await ana.sharedEvents.start();
  const { eventId } = await ana.sharedEvents.publishEvent(ocasiao());
  await ana.sharedEvents.invite(eventId, BIA);
  await bia.sharedEvents.accept(eventId);
  bia.sharedEvents.setLinked([{ eventId, hostUid: ANA }]);
  await esperar(() => bia.ultimos().find((v) => v.eventId === eventId)?.going?.includes(BIA), 'a Bia está presente');

  await ana.sharedEvents.uninvite(eventId, BIA);

  await esperar(() => bia.ultimos().find((v) => v.eventId === eventId)?.gone === true, 'o evento fica indisponível para a Bia');
  assert.deepEqual(bia.erros, [], 'negado é o caminho normal, não um erro');
  await esperar(() => !ana.ultimos().find((v) => v.eventId === eventId)?.going.includes(BIA), 'a presença saiu junto com o convite');
  assert.equal((await lerPar(ANA, BIA)).invites[ANA], null);
});

test('convidar quem não é amigo é negado pelas regras e não derruba os outros', async () => {
  const ana = pessoa(ANA);
  await ana.sharedEvents.start();
  const { eventId } = await ana.sharedEvents.publishEvent(ocasiao());

  const resultado = await ana.sharedEvents.inviteMany(eventId, [DINO, CAIO]);

  assert.deepEqual(resultado, { invited: [CAIO], failed: [DINO] });
});

test('sair do evento retira só a própria presença', async () => {
  const ana = pessoa(ANA); const bia = pessoa(BIA); const caio = pessoa(CAIO);
  await ana.sharedEvents.start();
  const { eventId } = await ana.sharedEvents.publishEvent(ocasiao());
  await ana.sharedEvents.inviteMany(eventId, [BIA, CAIO]);
  await bia.sharedEvents.accept(eventId);
  await caio.sharedEvents.accept(eventId);
  await esperar(() => ana.ultimos().find((v) => v.eventId === eventId)?.going.length === 2, 'os dois confirmaram');

  await bia.sharedEvents.leave(eventId);

  await esperar(() => ana.ultimos().find((v) => v.eventId === eventId)?.going.join() === CAIO, 'só o Caio continua presente');
});

test('recusar não deixa rastro no evento do organizador', async () => {
  const ana = pessoa(ANA); const bia = pessoa(BIA);
  await ana.sharedEvents.start();
  const { eventId } = await ana.sharedEvents.publishEvent(ocasiao());
  await ana.sharedEvents.invite(eventId, BIA);
  bia.sharedEvents.setPairings(paresDe(ANA, [eventId]));
  await esperar(() => bia.ultimosConvites().length === 1, 'convite recebido');
  const antes = (await real.getDoc(real.doc(ana.db, 'sharedEvents', eventId))).data();

  await bia.sharedEvents.decline(eventId);

  const depois = (await real.getDoc(real.doc(ana.db, 'sharedEvents', eventId))).data();
  assert.deepEqual(depois.going, antes.going);
  assert.deepEqual(depois.invited, antes.invited);
  assert.equal(depois.updatedAt.toMillis(), antes.updatedAt.toMillis(), 'o documento do evento nem foi tocado');
  assert.equal(bia.ultimosConvites().length, 0);
});

test('aceitar um evento cancelado é recusado pelo cliente; um vencido some da lista do organizador e é apagado', async () => {
  const ana = pessoa(ANA); const bia = pessoa(BIA);
  await ana.sharedEvents.start();
  const { eventId } = await ana.sharedEvents.publishEvent(ocasiao());
  await ana.sharedEvents.invite(eventId, BIA);
  await ana.sharedEvents.cancelEvent(eventId);
  assert.deepEqual(await bia.sharedEvents.accept(eventId), { ok: false, reason: 'cancelled' });

  await env.withSecurityRulesDisabled((ctx) => real.setDoc(real.doc(ctx.firestore(), 'sharedEvents', 'velho'), {
    hostUid: ANA, name: 'Velho', startAt: 1, endAt: 2, timeZone: '', status: 'active', invited: [BIA], going: [], schemaVersion: 1,
    createdAt: real.Timestamp.now(), updatedAt: real.Timestamp.now(), expiresAt: real.Timestamp.fromMillis(Date.now() - HORA),
  }));
  const ana2 = pessoa(ANA);
  await ana2.sharedEvents.start();
  await esperar(async () => !(await lerSemRegras('sharedEvents/velho')).existe, 'o organizador apagou o evento vencido');
});

test('apagar dados na nuvem remove meus eventos, limpa o ponteiro e retira minha presença nos dos outros', async () => {
  const ana = pessoa(ANA); const bia = pessoa(BIA);
  await ana.sharedEvents.start(); await bia.sharedEvents.start();
  const meu = await ana.sharedEvents.publishEvent(ocasiao());
  await ana.sharedEvents.invite(meu.eventId, BIA);
  const dela = await bia.sharedEvents.publishEvent(ocasiao({ name: 'Da Bia' }));
  await bia.sharedEvents.invite(dela.eventId, ANA);
  await ana.sharedEvents.accept(dela.eventId);

  await ana.sharedEvents.deleteAllMyData({ joinedEventIds: [dela.eventId] });

  assert.equal((await lerSemRegras(`sharedEvents/${meu.eventId}`)).existe, false);
  assert.equal((await lerPar(ANA, BIA)).invites[ANA], null);
  assert.deepEqual((await lerSemRegras(`sharedEvents/${dela.eventId}`)).dados.going, []);
});
