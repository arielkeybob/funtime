const { test } = require('node:test');
const assert = require('node:assert/strict');
const { derEcdsaSignatureToRaw } = require('../src/security/webauthn-signature.js');

function hex(u8) { return Buffer.from(u8).toString('hex'); }

test('DER sem padding: R e S de 32 bytes viram R++S concatenados', () => {
  const r = new Uint8Array(32).fill(0); r[0] = 0x01; r[31] = 0xAA;
  const s = new Uint8Array(32).fill(0); s[0] = 0x02; s[31] = 0xBB;
  const der = new Uint8Array([0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s]);
  const raw = derEcdsaSignatureToRaw(der, 32);
  assert.equal(raw.length, 64);
  assert.equal(hex(raw), hex(r) + hex(s));
});

test('DER com padding 0x00 em R (bit alto ligado): padding é removido', () => {
  const r32 = new Uint8Array(32).fill(0); r32[0] = 0xFF; r32[31] = 0x01;
  const rDer = new Uint8Array([0x00, ...r32]);
  const s = new Uint8Array(32).fill(0); s[0] = 0x03;
  const innerLen = 2 + rDer.length + 2 + s.length;
  const der = new Uint8Array([0x30, innerLen, 0x02, rDer.length, ...rDer, 0x02, s.length, ...s]);
  const raw = derEcdsaSignatureToRaw(der, 32);
  assert.equal(hex(raw), hex(r32) + hex(s));
});

test('entrada já em formato raw (64 bytes, primeiro byte != 0x30) é devolvida sem alteração', () => {
  const raw = new Uint8Array(64); raw[0] = 0x01; raw[63] = 0x99;
  assert.equal(hex(derEcdsaSignatureToRaw(raw, 32)), hex(raw));
});

test('bytes inválidos (nem DER nem raw) lançam erro', () => {
  assert.throws(() => derEcdsaSignatureToRaw(new Uint8Array([0x01, 0x02, 0x03]), 32), /Assinatura ECDSA inválida\./);
});

test('DER sem marcador 0x02 de R lança erro', () => {
  const der = new Uint8Array([0x30, 4, 0x99, 0, 0x02, 0]);
  assert.throws(() => derEcdsaSignatureToRaw(der, 32), /Assinatura ECDSA sem R\./);
});

test('R maior que o esperado mesmo após remover padding lança erro', () => {
  const r = new Uint8Array(33).fill(0xAA);
  const s = new Uint8Array(32).fill(0x01);
  const innerLen = 2 + r.length + 2 + s.length;
  const der = new Uint8Array([0x30, innerLen, 0x02, r.length, ...r, 0x02, s.length, ...s]);
  assert.throws(() => derEcdsaSignatureToRaw(der, 32), /Assinatura ECDSA fora do tamanho esperado\./);
});
