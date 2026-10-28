const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fitWithin, serializeBackground, parseStoredBackground, encodeBackgroundImage, BACKGROUND_MAX_CHARS } = require('../src/ui/app-background.js');

test('fitWithin reduz pelo lado maior e nunca aumenta', () => {
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.throws(() => fitWithin(0, 100, 1600));
});

test('o valor guardado volta como a imagem; qualquer outra coisa vira "sem imagem"', () => {
  const image = 'data:image/jpeg;base64,AAAA';
  assert.equal(parseStoredBackground(serializeBackground(image, 1)), image);
  assert.equal(parseStoredBackground(null), null);
  assert.equal(parseStoredBackground('não é json'), null);
  assert.equal(parseStoredBackground(JSON.stringify({ version: 2, image })), null);
  assert.equal(parseStoredBackground(JSON.stringify({ version: 1, image: 'javascript:alert(1)' })), null);
});

function fakes(urls) {
  const calls = [];
  const documentRef = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL(type, quality) { calls.push({ width: this.width, quality }); return urls.shift(); } }) };
  const bitmap = { width: 3000, height: 4000, closed: false, close() { this.closed = true; } };
  return { calls, bitmap, documentRef, createBitmap: async () => bitmap };
}

test('encodeBackgroundImage reduz e tenta de novo, menor, até caber', async () => {
  const f = fakes(['x'.repeat(BACKGROUND_MAX_CHARS + 1), 'data:image/jpeg;base64,ok']);
  const url = await encodeBackgroundImage({ type: 'image/png' }, f);
  assert.equal(url, 'data:image/jpeg;base64,ok');
  assert.deepEqual(f.calls.map((c) => c.width), [1200, 960]);
  assert.equal(f.bitmap.closed, true);
});

test('encodeBackgroundImage recusa o que não é imagem, o que não abre e o que não cabe', async () => {
  await assert.rejects(encodeBackgroundImage({ type: 'application/pdf' }, fakes([])), /arquivo de imagem/);
  await assert.rejects(encodeBackgroundImage({ type: 'image/heic' }, { ...fakes([]), createBitmap: async () => { throw new Error('decode'); } }), /Não foi possível abrir/);
  const grande = 'x'.repeat(BACKGROUND_MAX_CHARS + 1);
  await assert.rejects(encodeBackgroundImage({ type: '' }, fakes([grande, grande, grande])), /grande demais/);
});
