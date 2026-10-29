const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isLandscapePhone } = require('../src/ui/orientation-lock.js');

const iphone = { coarsePointer: true, screenWidth: 390, screenHeight: 844 };
const deitado = { ...iphone, viewportLandscape: true };

test('celular deitado: janela larga e aparelho deitado', () => {
  assert.equal(isLandscapePhone({ ...deitado, orientationType: 'landscape-primary' }), true);
  assert.equal(isLandscapePhone({ ...deitado, orientationType: 'landscape-secondary' }), true);
  // Android troca largura e altura da tela ao girar; o lado curto continua o mesmo.
  assert.equal(isLandscapePhone({ coarsePointer: true, screenWidth: 915, screenHeight: 412, viewportLandscape: true, orientationType: 'landscape-primary' }), true);
});

test('teclado aberto deixa a janela larga, mas o aparelho em pé não aciona o aviso', () => {
  assert.equal(isLandscapePhone({ ...deitado, orientationType: 'portrait-primary' }), false);
  assert.equal(isLandscapePhone({ ...deitado, legacyAngle: 0 }), false);
});

test('janela em pé nunca aciona o aviso, mesmo com a tela dizendo "deitada"', () => {
  assert.equal(isLandscapePhone({ ...iphone, viewportLandscape: false, orientationType: 'landscape-primary' }), false);
  assert.equal(isLandscapePhone({ ...iphone, viewportLandscape: false, legacyAngle: 90 }), false);
});

test('sem screen.orientation, usa window.orientation e por último só o formato da janela', () => {
  assert.equal(isLandscapePhone({ ...deitado, legacyAngle: 90 }), true);
  assert.equal(isLandscapePhone({ ...deitado, legacyAngle: -90 }), true);
  assert.equal(isLandscapePhone({ ...deitado, legacyAngle: 180 }), false);
  assert.equal(isLandscapePhone(deitado), true);
});

test('tablet, computador e tela sem toque giram livres', () => {
  assert.equal(isLandscapePhone({ coarsePointer: true, screenWidth: 1133, screenHeight: 744, viewportLandscape: true, orientationType: 'landscape-primary' }), false);
  assert.equal(isLandscapePhone({ ...deitado, coarsePointer: false, orientationType: 'landscape-primary' }), false);
  assert.equal(isLandscapePhone({ coarsePointer: true, screenWidth: undefined, screenHeight: undefined, viewportLandscape: true, orientationType: 'landscape-primary' }), false);
});
