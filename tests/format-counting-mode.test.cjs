const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCountingMode } = require('../src/format/counting-mode.js');

test('resolveCountingMode combina preferência e modo de cabeça para baixo nas 4 combinações', () => {
  assert.equal(resolveCountingMode('normal', false), 'normal');
  assert.equal(resolveCountingMode('countdown', false), 'countdown');
  assert.equal(resolveCountingMode('normal', true), 'countdown');
  assert.equal(resolveCountingMode('countdown', true), 'normal');
});
