const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dueShareIntents, executeShareIntents } = require('../src/sharing/share-intents.js');

const amigo = (otherUid, extra = {}) => ({ otherUid, myAlias: 'Ana', acceptedByMe: true, acceptedByOther: true, ...extra });
const ocasiao = (extra = {}) => ({ id: 'oc-1', name: 'Festa', startedAt: 1000, endedAt: null, shareWith: ['bia', 'caio'], ...extra });
const dose = (id, occasionId = 'oc-1') => ({ id, occasionId, consumedAt: 1500 });

test('só evento em andamento cumpre a intenção; agendado espera e encerrado não compartilha mais', () => {
  const lista = [
    ocasiao({ id: 'andamento' }),
    ocasiao({ id: 'agendado', startedAt: null, scheduledStartAt: 5000 }),
    ocasiao({ id: 'encerrado', endedAt: 2000 }),
    ocasiao({ id: 'sem-intencao', shareWith: undefined }),
    ocasiao({ id: 'vazia', shareWith: [] }),
  ];

  assert.deepEqual(dueShareIntents(lista).map((item) => item.id), ['andamento']);
});

test('inicia o compartilhamento com cada amigo, enviando só as doses DAQUELE evento', async () => {
  const chamadas = [];

  const resultados = await executeShareIntents({
    occasions: [ocasiao()], events: [dose('a'), dose('b'), dose('de-outro', 'oc-2')],
    pairings: [amigo('bia'), amigo('caio', { myAlias: 'Aninha' })], shares: [],
    startShare: async (pedido) => { chamadas.push(pedido); },
  });

  assert.deepEqual(resultados, [{ occasionId: 'oc-1', name: 'Festa', started: 2, remaining: [] }]);
  assert.deepEqual(chamadas.map((c) => [c.viewerUid, c.ownerAlias]), [['bia', 'Ana'], ['caio', 'Aninha']]);
  assert.deepEqual(chamadas[0].events.map((event) => event.id), ['a', 'b'], 'doses de outro evento nunca entram');
});

// Se a amizade acabou entre a escolha e o início da festa, a intenção deixa de valer: não é
// falha para tentar de novo, e compartilhar com quem já não é amigo nem seria aceito.
test('quem deixou de ser amigo é descartado, sem tentar compartilhar', async () => {
  const chamadas = [];

  const [resultado] = await executeShareIntents({
    occasions: [ocasiao()], events: [],
    pairings: [amigo('bia'), amigo('caio', { acceptedByOther: false })], shares: [],
    startShare: async (pedido) => { chamadas.push(pedido.viewerUid); },
  });

  assert.deepEqual(chamadas, ['bia']);
  assert.deepEqual(resultado.remaining, [], 'descartado, não pendente');
});

test('quem já recebe este evento é pulado, para não duplicar o compartilhamento', async () => {
  const chamadas = [];

  const [resultado] = await executeShareIntents({
    occasions: [ocasiao()], events: [],
    pairings: [amigo('bia'), amigo('caio')], shares: [{ occasionId: 'oc-1', viewerUid: 'bia' }],
    startShare: async (pedido) => { chamadas.push(pedido.viewerUid); },
  });

  assert.deepEqual(chamadas, ['caio']);
  assert.equal(resultado.started, 1);
  assert.deepEqual(resultado.remaining, []);
});

// Sem rede o compartilhamento falha; perder a escolha da pessoa seria pior do que tentar de novo.
test('uma falha mantém a pessoa na intenção e não impede as demais', async () => {
  const [resultado] = await executeShareIntents({
    occasions: [ocasiao({ shareWith: ['bia', 'caio', 'dino'] })], events: [],
    pairings: [amigo('bia'), amigo('caio'), amigo('dino')], shares: [],
    startShare: async ({ viewerUid }) => { if (viewerUid === 'caio') throw new Error('sem rede'); },
  });

  assert.equal(resultado.started, 2);
  assert.deepEqual(resultado.remaining, ['caio']);
});

test('um compartilhamento de outro evento com a mesma pessoa não impede este', async () => {
  const chamadas = [];

  await executeShareIntents({
    occasions: [ocasiao({ shareWith: ['bia'] })], events: [],
    pairings: [amigo('bia')], shares: [{ occasionId: 'oc-antigo', viewerUid: 'bia' }],
    startShare: async (pedido) => { chamadas.push(pedido.viewerUid); },
  });

  assert.deepEqual(chamadas, ['bia']);
});

test('sem nada devido, não faz nada', async () => {
  let chamou = false;

  const resultados = await executeShareIntents({
    occasions: [ocasiao({ startedAt: null, scheduledStartAt: 9 })], events: [], pairings: [amigo('bia')], shares: [],
    startShare: async () => { chamou = true; },
  });

  assert.deepEqual(resultados, []);
  assert.equal(chamou, false);
});
