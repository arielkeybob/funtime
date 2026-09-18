const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shareState, bestState } = require('../src/sharing/share-state.js');
const { pointerToList, listToPointer } = require('../src/data/share-codes.js');

const HORA = 3600_000;

test('ao vivo, encerrado dentro do prazo, e sem nada depois do prazo', () => {
  const agora = 100 * HORA;
  assert.equal(shareState({ endedAt: null, expiresAtMs: agora + 48 * HORA }, agora), 'live');
  assert.equal(shareState({ endedAt: agora - HORA, expiresAtMs: agora + 23 * HORA }, agora), 'grace');
  assert.equal(shareState({ endedAt: agora - 25 * HORA, expiresAtMs: agora - HORA }, agora), 'none');
});

test('a fronteira do prazo: no instante exato já é nada', () => {
  assert.equal(shareState({ endedAt: 1, expiresAtMs: 1000 }, 999), 'grace');
  assert.equal(shareState({ endedAt: 1, expiresAtMs: 1000 }, 1000), 'none');
});

test('vários eventos viram o melhor estado', () => {
  assert.equal(bestState(['grace', 'live', 'none']), 'live');
  assert.equal(bestState(['none', 'grace']), 'grace');
  assert.equal(bestState(['none']), 'none');
  assert.equal(bestState([]), 'none');
});

test('ponteiro: texto, lista e vazio nos dois sentidos', () => {
  assert.deepEqual(pointerToList('a'), ['a']);
  assert.deepEqual(pointerToList(['a', 'b']), ['a', 'b']);
  assert.deepEqual(pointerToList(null), []);
  assert.deepEqual(pointerToList(['a', 3, '']), ['a']);
  assert.equal(listToPointer([]), null);
  assert.equal(listToPointer(['a']), 'a');
  assert.deepEqual(listToPointer(['a', 'b']), ['a', 'b']);
});
