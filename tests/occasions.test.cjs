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
