const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../occasions.js');
test('ocasiões validam referências, um evento aberto e períodos, preservando legado', () => {
  assert.deepEqual(model.normalize({ events: [{ id: 'old', consumedAt: 3 }] }), []);
  const item = { id: 'a', name: 'Festa', startedAt: 10, endedAt: null };
  assert.deepEqual(model.normalize({ occasions: [item], events: [{ occasionId: 'a', consumedAt: 11 }] }), [item]);
  for (const data of [
    { occasions: [item, { ...item, id: 'b', startedAt: 20 }], events: [] },
    { occasions: [item], events: [{ occasionId: 'a', consumedAt: 9 }] },
    { occasions: [], events: [{ occasionId: 'unknown', consumedAt: 20 }] },
  ]) assert.throws(() => model.normalize(data));
});

test('editar período inclui apenas doses sem evento no intervalo, sem mudar snapshots', () => {
  const records = [ { id: 'before', consumedAt: 9 }, { id: 'start', consumedAt: 10, intervalMinutes: 60 }, { id: 'end', consumedAt: 20 }, { id: 'after', consumedAt: 21 }, { id: 'other', consumedAt: 15, occasionId: 'b' } ];
  const result = model.includeUnassigned(records, { id: 'a', startedAt: 10, endedAt: 20 });
  assert.deepEqual(result.map(record => record.occasionId), [undefined, 'a', 'a', undefined, 'b']);
  assert.equal(records[1].occasionId, undefined);
  assert.equal(result[1].intervalMinutes, 60);
  assert.equal(result[1].consumedAt, 10);
});

// Evento compartilhado (spec 0025): três campos opcionais que o vínculo com um convite
// precisa carregar. Sem passar por normalize eles seriam descartados ao carregar.
test('campos de evento compartilhado sobrevivem ao normalize e são opcionais', () => {
  const base = { id: 'a', name: 'Festa', startedAt: null, endedAt: null, scheduledStartAt: 100 };
  assert.deepEqual(model.normalize({ occasions: [base], events: [] }), [base], 'sem os campos, nada muda');

  const ligada = { ...base, sharedEventId: 'ev-1', sharedHostUid: 'uid-ana', shareWith: ['uid-bia', 'uid-caio'] };
  assert.deepEqual(model.normalize({ occasions: [ligada], events: [] }), [ligada]);
});

test('shareWith repetido vira único e vazio some', () => {
  const base = { id: 'a', name: 'Festa', startedAt: null, endedAt: null, scheduledStartAt: 100 };
  assert.deepEqual(model.normalize({ occasions: [{ ...base, shareWith: ['x', 'x', 'y'] }], events: [] })[0].shareWith, ['x', 'y']);
  assert.equal('shareWith' in model.normalize({ occasions: [{ ...base, shareWith: [] }], events: [] })[0], false);
});

test('campos de evento compartilhado com tipo errado falham em vez de serem descartados em silêncio', () => {
  const base = { id: 'a', name: 'Festa', startedAt: null, endedAt: null, scheduledStartAt: 100 };
  for (const invalido of [
    { sharedEventId: 5 }, { sharedEventId: '' }, { sharedHostUid: {} }, { sharedEventId: 'x'.repeat(201) },
    { shareWith: 'uid' }, { shareWith: [1] }, { shareWith: [''] },
  ]) assert.throws(() => model.normalize({ occasions: [{ ...base, ...invalido }], events: [] }), undefined, JSON.stringify(invalido));
});

test('o vínculo atravessa início, encerramento e reabertura da ocasião', () => {
  const ligada = { id: 'a', name: 'Festa', startedAt: null, endedAt: null, scheduledStartAt: 100, scheduledEndAt: 500, autoStart: true, sharedEventId: 'ev-1', sharedHostUid: 'uid-ana', shareWith: ['uid-bia'] };
  const iniciada = model.reconcile({ occasions: [ligada], events: [], preferences: { eventsEnabled: true } }, 200).occasions[0];
  assert.equal(iniciada.startedAt, 100);
  assert.equal(iniciada.sharedEventId, 'ev-1');
  assert.deepEqual(iniciada.shareWith, ['uid-bia']);

  const encerrada = model.reconcile({ occasions: [iniciada], events: [], preferences: { eventsEnabled: true } }, 600).occasions[0];
  assert.equal(encerrada.endedAt, 500);
  assert.equal(encerrada.sharedHostUid, 'uid-ana');
});

// Chave da ficha que o convidado já viu: sem ela, editar o horário de propósito faria a
// ocasião divergir da ficha para sempre e o aviso de "atualização" nunca sairia.
test('sharedFichaKey é opcional, sobrevive ao normalize e recusa tipo errado', () => {
  const base = { id: 'a', name: 'Festa', startedAt: null, endedAt: null, scheduledStartAt: 100, sharedEventId: 'ev-1', sharedHostUid: 'uid-ana' };
  assert.deepEqual(model.normalize({ occasions: [{ ...base, sharedFichaKey: '["Festa",100,null]' }], events: [] })[0].sharedFichaKey, '["Festa",100,null]');
  assert.equal('sharedFichaKey' in model.normalize({ occasions: [base], events: [] })[0], false);
  for (const ruim of [5, '', 'x'.repeat(501), {}]) assert.throws(() => model.normalize({ occasions: [{ ...base, sharedFichaKey: ruim }], events: [] }));
});
