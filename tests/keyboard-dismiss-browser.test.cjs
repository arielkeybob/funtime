// Teclado do celular: Enter só desce o teclado (nunca salva), a tecla de ação vira ✓ e um ✓
// aparece dentro do campo enquanto ele foi modificado. Desktop mantém Enter = enviar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

async function withPage(touch, run) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', (error) => erros.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('terms-pending'));
    await page.evaluate(() => { state.preferences.eventsEnabled = true; openOccasionEditor(); });
    await run(page, erros);
  } finally {
    await browser.close();
    server.close();
  }
}

const estado = (page) => page.evaluate(() => ({
  aberto: document.querySelector('#occasion-dialog').open,
  eventos: state.occasions.length,
  campoFocado: document.activeElement?.id === 'occasion-name',
  check: (() => { const b = document.querySelector('.field-check'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; })(),
}));

test('toque: o ✓ aparece dentro do campo ao digitar; Enter desce o teclado e não salva', { timeout: 30000 }, async () => {
  await withPage(true, async (page, erros) => {
    assert.equal(await page.locator('#occasion-name').getAttribute('enterkeyhint'), 'done', 'a tecla de ação vira ✓');
    assert.equal(await page.locator('#pin-setup-value').getAttribute('enterkeyhint'), null, 'PIN não é alterado');

    await page.locator('#occasion-name').tap();
    assert.equal((await estado(page)).check, false, 'sem modificação não há ✓');
    await page.keyboard.type('Festa');
    const digitando = await estado(page);
    assert.equal(digitando.check, true, 'modificado: ✓ visível');
    const caixa = await page.evaluate(() => {
      const campo = document.querySelector('#occasion-name').getBoundingClientRect();
      const botao = document.querySelector('.field-check').getBoundingClientRect();
      return { dentro: botao.left >= campo.left && botao.right <= campo.right && botao.top >= campo.top && botao.bottom <= campo.bottom, direita: botao.left > campo.left + campo.width / 2 };
    });
    assert.deepEqual(caixa, { dentro: true, direita: true }, 'o ✓ fica dentro do campo, no lado direito');

    await page.keyboard.press('Enter');
    const depoisEnter = await estado(page);
    assert.deepEqual(depoisEnter, { aberto: true, eventos: 0, campoFocado: false, check: false });

    await page.locator('#occasion-name').tap();
    await page.keyboard.type('!');
    assert.equal((await estado(page)).check, true);
    await page.locator('.field-check').tap();
    assert.deepEqual(await estado(page), { aberto: true, eventos: 0, campoFocado: false, check: false }, 'tocar no ✓ desce o teclado sem salvar');

    await page.locator('#occasion-submit').tap();
    await page.waitForFunction(() => state.occasions.length === 1);
    assert.deepEqual(erros, []);
  });
});

test('toque: voltar ao texto original esconde o ✓', { timeout: 30000 }, async () => {
  await withPage(true, async (page, erros) => {
    await page.locator('#occasion-name').tap();
    await page.keyboard.type('A');
    assert.equal((await estado(page)).check, true);
    await page.keyboard.press('Backspace');
    assert.equal((await estado(page)).check, false);
    assert.deepEqual(erros, []);
  });
});

test('desktop: Enter continua enviando o formulário', { timeout: 30000 }, async () => {
  await withPage(false, async (page, erros) => {
    await page.locator('#occasion-name').click();
    await page.keyboard.type('Jantar');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => state.occasions.length === 1);
    assert.deepEqual(erros, []);
  });
});
