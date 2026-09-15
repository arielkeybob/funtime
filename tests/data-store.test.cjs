const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit } = require('../src/data/store.js');

function fakeStorage(overrides = {}) {
  const map = new Map();
  return {
    map,
    setItem: overrides.setItem || ((key, value) => map.set(key, value)),
    getItem: key => map.get(key),
  };
}

test('commit funde current+patch, grava e devolve o objeto gravado', () => {
  globalThis.localStorage = fakeStorage();
  const current = { version: 11, drinks: ['a'], events: [], occasions: [], preferences: { x: 1 } };
  const result = commit('funtime-v1-data', current, { events: ['e1'] });
  assert.deepEqual(result, { version: 11, drinks: ['a'], events: ['e1'], occasions: [], preferences: { x: 1 } });
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('funtime-v1-data')), result);
});

test('patch sobrescreve só as chaves informadas (merge raso)', () => {
  globalThis.localStorage = fakeStorage();
  const current = { version: 11, drinks: ['a', 'b'], events: ['e1'], occasions: [], preferences: { x: 1 } };
  const result = commit('funtime-v1-data', current, { drinks: ['c'] });
  assert.deepEqual(result.drinks, ['c']);
  assert.deepEqual(result.events, ['e1']);
  assert.deepEqual(result.preferences, { x: 1 });
});

test('propaga exceção de localStorage.setItem sem capturar (ex.: QuotaExceededError)', () => {
  globalThis.localStorage = fakeStorage({
    setItem: () => { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error; },
  });
  assert.throws(() => commit('funtime-v1-data', { version: 11 }, { drinks: [] }), /quota/);
});
