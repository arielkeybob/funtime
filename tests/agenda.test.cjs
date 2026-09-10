const { test } = require('node:test'); const assert = require('node:assert/strict');
const model = require('../occasions.js'); const hour = 3600000;
const active = { id: 'a', name: 'Festa', startedAt: 0, endedAt: null };
const planned = { id: 'b', name: 'Próxima', startedAt: null, endedAt: null, scheduledStartAt: 50 * hour, autoStart: true };
test('48h usa maior término dos snapshots, não apenas última dose, e é idempotente', () => {
  const data = { occasions: [active], events: [{ id: '1', occasionId: 'a', consumedAt: 17 * hour, intervalMinutes: 180 }, { id: '2', occasionId: 'a', consumedAt: 18 * hour, intervalMinutes: 60 }] };
  assert.equal(model.reconcile(data, 48 * hour - 1).changes.length, 0);
  const result = model.reconcile(data, 48 * hour);
  assert.equal(result.occasions[0].endedAt, 20 * hour); assert.equal(result.occasions[0].closedAt, 48 * hour);
  assert.equal(result.occasions[0].endReason, 'recovery48h'); assert.deepEqual(result.events, data.events);
  assert.equal(model.reconcile(result, 70 * hour).changes.length, 0);
});
test('recuperação aguarda contagem ativa, respeita fim programado e trata vazio', () => {
  const data = { occasions: [active], events: [{ occasionId: 'a', consumedAt: 47 * hour, intervalMinutes: 120 }] };
  assert.equal(model.reconcile(data, 48 * hour).changes.length, 0);
  assert.equal(model.reconcile(data, 49 * hour).occasions[0].endedAt, 49 * hour);
  assert.equal(model.reconcile({ occasions: [{ ...active, scheduledEndAt: 72 * hour }], events: [] }, 49 * hour).changes.length, 0);
  const result = model.reconcile({ occasions: [active], events: [] }, 49 * hour);
  assert.equal(result.occasions[0].endedAt, 48 * hour); assert.equal(result.occasions[0].endReason, 'empty48h');
});
test('agenda inicia quando devido, manual aguarda, conflito não substitui e expirado não vira ativo', () => {
  assert.equal(model.active(model.reconcile({ occasions: [planned], events: [] }, 49 * hour).occasions), null);
  assert.equal(model.active(model.reconcile({ occasions: [planned], events: [] }, 50 * hour).occasions).id, 'b');
  assert.equal(model.active(model.reconcile({ occasions: [{ ...planned, autoStart: false }], events: [] }, 50 * hour).occasions), null);
  const result = model.reconcile({ occasions: [{ ...active, scheduledEndAt: 72 * hour }, planned], events: [] }, 50 * hour);
  assert.equal(model.active(result.occasions).id, 'a'); assert.equal(result.occasions[1].startedAt, null);
  const expired = model.reconcile({ occasions: [{ ...planned, scheduledEndAt: 51 * hour }], events: [] }, 52 * hour).occasions[0];
  assert.equal(expired.startedAt, null); assert.equal(expired.endReason, 'expired');
});
test('fim programado preserva doses e não aguarda intervalos; legado não é alterado', () => {
  const data = { occasions: [{ ...active, scheduledEndAt: 20 * hour }], events: [{ occasionId: 'a', consumedAt: 19 * hour, intervalMinutes: 120 }] };
  const result = model.reconcile(data, 20 * hour); assert.equal(result.occasions[0].endedAt, 20 * hour); assert.deepEqual(result.events, data.events);
  assert.deepEqual(model.normalize({ occasions: [active], events: [] }), [active]);
  assert.throws(() => model.normalize({ occasions: [planned], events: [{ occasionId: 'b', consumedAt: 51 * hour }] }));
});
