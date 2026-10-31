const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  fitWithin, serializeBackground, parseStoredBackground, encodeBackgroundImage, BACKGROUND_MAX_CHARS,
  legibleBackgroundColor, relativeLuminance, MAX_BACKGROUND_LUMINANCE, BACKGROUND_COLORS, DEFAULT_BACKGROUND_COLOR
} = require('../src/ui/app-background.js');

test('fitWithin reduz pelo lado maior e nunca aumenta', () => {
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.throws(() => fitWithin(0, 100, 1600));
});

test('a escolha guardada volta igual; v1 vira "Minha imagem"; qualquer outra coisa vira o padrão', () => {
  const image = 'data:image/jpeg;base64,AAAA';
  const padrao = { mode: 'default', image: null, color: null };
  for (const setting of [
    { mode: 'default', image: null, color: null },
    { mode: 'image', image, color: '#2a0f17' },
    { mode: 'color', image, color: '#ffd1dc' },
  ]) assert.deepEqual(parseStoredBackground(serializeBackground(setting, 1)), setting);
  // Versão 1 (spec 0031) só guardava a imagem.
  assert.deepEqual(parseStoredBackground(JSON.stringify({ version: 1, image, updatedAt: 1 })), { mode: 'image', image, color: null });
  assert.deepEqual(parseStoredBackground(null), padrao);
  assert.deepEqual(parseStoredBackground('não é json'), padrao);
  assert.deepEqual(parseStoredBackground(JSON.stringify({ version: 1, image: 'javascript:alert(1)' })), padrao);
  assert.deepEqual(parseStoredBackground(JSON.stringify({ version: 3, mode: 'color', color: '#000000' })), padrao);
  // Modo sem o que precisa, modo desconhecido e cor inválida não quebram.
  assert.deepEqual(parseStoredBackground(JSON.stringify({ version: 2, mode: 'image', image: null })), padrao);
  assert.deepEqual(parseStoredBackground(JSON.stringify({ version: 2, mode: 'video', color: 'red' })), padrao);
  assert.deepEqual(parseStoredBackground(JSON.stringify({ version: 2, mode: 'color', color: 'url(x)' })), { mode: 'color', image: null, color: null });
});

test('cor clara é escurecida mantendo o tom; cor escura fica como está', () => {
  assert.deepEqual(legibleBackgroundColor('#0f1a2e'), { color: '#0f1a2e', adjusted: false });
  assert.deepEqual(legibleBackgroundColor('#ABCDEF').adjusted, true);
  for (const hex of ['#ffffff', '#ffd1dc', '#f2c94c', '#5ee99b', '#808080']) {
    const { color, adjusted } = legibleBackgroundColor(hex);
    assert.equal(adjusted, true, hex);
    assert.ok(relativeLuminance(color) <= MAX_BACKGROUND_LUMINANCE, `${hex} → ${color}`);
    // Escurecer o bastante, não tudo: perto do limite, não preto.
    assert.ok(relativeLuminance(color) > MAX_BACKGROUND_LUMINANCE * 0.85, `${hex} → ${color} escureceu demais`);
  }
  // Mesmo tom: a proporção entre os canais se mantém (#ffd1dc é rosado, continua rosado).
  const [r, g, b] = legibleBackgroundColor('#ffd1dc').color.match(/\w\w/g).map((h) => parseInt(h, 16));
  assert.ok(r > g && r > b && b > g);
  // --muted (#a1a1aa) sobre o fundo mais claro permitido fica em pelo menos 4,5:1.
  assert.ok((relativeLuminance('#a1a1aa') + 0.05) / (MAX_BACKGROUND_LUMINANCE + 0.05) >= 4.5);
  assert.deepEqual(legibleBackgroundColor('vermelho'), { color: DEFAULT_BACKGROUND_COLOR, adjusted: false });
});

test('as cores prontas já são legíveis e o preto padrão vem primeiro', () => {
  assert.equal(BACKGROUND_COLORS[0].color, DEFAULT_BACKGROUND_COLOR);
  for (const { name, color } of BACKGROUND_COLORS) assert.equal(legibleBackgroundColor(color).adjusted, false, name);
  assert.equal(new Set(BACKGROUND_COLORS.map((c) => c.color)).size, BACKGROUND_COLORS.length);
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
