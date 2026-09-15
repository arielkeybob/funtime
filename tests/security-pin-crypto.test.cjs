const { test } = require('node:test');
const assert = require('node:assert/strict');
const { derivePinHash, PIN_PBKDF2_ITERATIONS } = require('../src/security/pin-crypto.js');

function hex(u8) { return Buffer.from(u8).toString('hex'); }

test('PIN_PBKDF2_ITERATIONS é 210000', () => {
  assert.equal(PIN_PBKDF2_ITERATIONS, 210000);
});

test('mesmo pin+salt+iterations produz sempre o mesmo hash de 32 bytes', async () => {
  const salt = new Uint8Array([1, 2, 3, 4]);
  const a = await derivePinHash('1234', salt, 1000);
  const b = await derivePinHash('1234', salt, 1000);
  assert.equal(a.length, 32);
  assert.equal(hex(a), hex(b));
});

test('salt diferente produz hash diferente', async () => {
  const a = await derivePinHash('1234', new Uint8Array([1, 2, 3, 4]), 1000);
  const b = await derivePinHash('1234', new Uint8Array([5, 6, 7, 8]), 1000);
  assert.notEqual(hex(a), hex(b));
});

test('número de iterações diferente produz hash diferente', async () => {
  const salt = new Uint8Array([1, 2, 3, 4]);
  const a = await derivePinHash('1234', salt, 1000);
  const b = await derivePinHash('1234', salt, 2000);
  assert.notEqual(hex(a), hex(b));
});

test('omitir iterations usa exatamente PIN_PBKDF2_ITERATIONS', async () => {
  const salt = new Uint8Array([9, 9, 9, 9]);
  const withDefault = await derivePinHash('1234', salt);
  const explicit = await derivePinHash('1234', salt, PIN_PBKDF2_ITERATIONS);
  assert.equal(hex(withDefault), hex(explicit));
});
