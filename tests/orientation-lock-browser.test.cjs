// Celular deitado (v2.31.2): o app some atrás do aviso "Deixe o celular em pé" e, ao voltar à
// vertical, tudo continua como estava, inclusive um diálogo aberto. Computador não é afetado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

test('celular deitado esconde o app atrás do aviso e volta intacto ao ficar em pé', { timeout: 90000 }, async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => !document.body.classList.contains('boot-pending'));
    const deitado = () => page.evaluate(() => document.documentElement.classList.contains('is-landscape-phone'));
    const visibilidade = selector => page.locator(selector).evaluate(el => getComputedStyle(el).visibility);

    assert.equal(await deitado(), false);
    assert.equal(await page.locator('#orientation-lock').isVisible(), false);
    await page.locator('#empty-add-button').click();
    assert.equal(await page.locator('#drink-dialog').getAttribute('open'), '');

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.documentElement.classList.contains('is-landscape-phone'));
    assert.equal(await page.locator('#orientation-lock').isVisible(), true);
    assert.equal(await page.locator('#orientation-lock strong').textContent(), 'Deixe o celular em pé');
    assert.equal(await visibilidade('#drink-dialog'), 'hidden', 'diálogo aberto fica escondido');
    assert.equal(await visibilidade('#app-shell'), 'hidden');
    assert.equal(await page.locator('#drink-dialog').evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0)');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-landscape-phone'));
    assert.equal(await page.locator('#orientation-lock').isVisible(), false);
    assert.equal(await page.locator('#drink-dialog').getAttribute('open'), '', 'o diálogo continua aberto');
    assert.equal(await visibilidade('#drink-dialog'), 'visible');
    assert.deepEqual(errors, []);
    await context.close();

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await desktopPage.waitForFunction(() => typeof window.initializeDateTimeEditor === 'function');
    assert.equal(await desktopPage.evaluate(() => document.documentElement.classList.contains('is-landscape-phone')), false, 'computador deitado não é celular');
    await desktop.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
