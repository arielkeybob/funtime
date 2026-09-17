const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diffAppData, isEmptyDiff, mergeRemote } = require('../src/data/sync-merge.js');

const base = (overrides = {}) => ({
  drinks: [], events: [], occasions: [], preferences: { cleanInterface: true }, ...overrides,
});

test('diffAppData marca registro novo como upsert', () => {
  const diff = diffAppData(base(), base({ drinks: [{ id: 'a', name: 'Café' }] }));
  assert.deepEqual(diff.drinks.upserted, [{ id: 'a', name: 'Café' }]);
  assert.deepEqual(diff.drinks.removed, []);
});

test('diffAppData marca registro alterado como upsert', () => {
  const previous = base({ drinks: [{ id: 'a', name: 'Café' }] });
  const next = base({ drinks: [{ id: 'a', name: 'Chá' }] });
  assert.deepEqual(diffAppData(previous, next).drinks.upserted, [{ id: 'a', name: 'Chá' }]);
});

test('diffAppData marca registro removido', () => {
  const previous = base({ events: [{ id: 'e1' }, { id: 'e2' }] });
  const next = base({ events: [{ id: 'e1' }] });
  const diff = diffAppData(previous, next);
  assert.deepEqual(diff.events.removed, ['e2']);
  assert.deepEqual(diff.events.upserted, []);
});

test('diffAppData ignora diferença só de ordem das chaves do objeto', () => {
  const previous = base({ drinks: [{ id: 'a', name: 'Café', icon: '☕' }] });
  const next = base({ drinks: [{ icon: '☕', name: 'Café', id: 'a' }] });
  assert.ok(isEmptyDiff(diffAppData(previous, next)));
});

test('diffAppData detecta mudança de preferências no meta', () => {
  const next = base({ preferences: { cleanInterface: false } });
  assert.equal(diffAppData(base(), next).metaChanged, true);
});

test('diffAppData detecta reordenação de bebidas no meta', () => {
  const previous = base({ drinks: [{ id: 'a' }, { id: 'b' }] });
  const next = base({ drinks: [{ id: 'b' }, { id: 'a' }] });
  const diff = diffAppData(previous, next);
  assert.equal(diff.metaChanged, true);
  assert.deepEqual(diff.drinks.upserted, [], 'reordenar não reescreve os documentos');
});

test('isEmptyDiff é verdadeiro quando nada mudou', () => {
  const data = base({ drinks: [{ id: 'a' }] });
  assert.ok(isEmptyDiff(diffAppData(data, data)));
});

test('mergeRemote: versão remota vence para id presente nos dois lados', () => {
  const merged = mergeRemote({
    local: base({ drinks: [{ id: 'a', name: 'local' }] }),
    remote: { drinks: [{ id: 'a', name: 'remoto' }], events: [], occasions: [] },
    lastPushed: { drinks: [{ id: 'a', name: 'local' }], events: [], occasions: [] },
  });
  assert.deepEqual(merged.drinks, [{ id: 'a', name: 'remoto' }]);
});

test('mergeRemote preserva registro local que ainda não foi enviado', () => {
  const merged = mergeRemote({
    local: base({ events: [{ id: 'novo' }] }),
    remote: { drinks: [], events: [], occasions: [] },
    lastPushed: { drinks: [], events: [], occasions: [] },
  });
  assert.deepEqual(merged.events, [{ id: 'novo' }]);
});

test('mergeRemote remove registro já enviado que sumiu do remoto (exclusão em outro aparelho)', () => {
  const merged = mergeRemote({
    local: base({ events: [{ id: 'e1' }, { id: 'e2' }] }),
    remote: { drinks: [], events: [{ id: 'e1' }], occasions: [] },
    lastPushed: { drinks: [], events: [{ id: 'e1' }, { id: 'e2' }], occasions: [] },
  });
  assert.deepEqual(merged.events, [{ id: 'e1' }]);
});

test('mergeRemote traz registro que só existe no remoto', () => {
  const merged = mergeRemote({
    local: base(),
    remote: { drinks: [], events: [{ id: 'deOutroAparelho' }], occasions: [] },
    lastPushed: null,
  });
  assert.deepEqual(merged.events, [{ id: 'deOutroAparelho' }]);
});

test('mergeRemote aplica a ordem de bebidas definida no remoto', () => {
  const merged = mergeRemote({
    local: base({ drinks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
    remote: { drinks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], events: [], occasions: [], drinkOrder: ['c', 'a', 'b'] },
    lastPushed: null,
  });
  assert.deepEqual(merged.drinks.map((drink) => drink.id), ['c', 'a', 'b']);
});

test('mergeRemote mantém preferências locais quando a nuvem ainda não tem meta', () => {
  const merged = mergeRemote({
    local: base({ preferences: { cleanInterface: false } }),
    remote: { drinks: [], events: [], occasions: [], preferences: null },
    lastPushed: null,
  });
  assert.deepEqual(merged.preferences, { cleanInterface: false });
});
