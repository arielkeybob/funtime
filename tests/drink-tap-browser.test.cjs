// Gestos móveis em navegador real, origem e perfil efêmeros.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

test('duplo toque registra uma vez e não deixa pressão longa abrir depois', { timeout: 60000 }, async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await page.getByRole('button', { name: 'Começar sem dados', exact: true }).click();
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    await page.evaluate(() => {
      state.drinks = [{ id: 'drink', name: 'Teste', icon: '💧', intervalMinutes: 60, askDoseSize: false }];
      state.events = [];
      saveData(); render(); clearInterval(state.timerId); state.timerId = null;
    });

    const cdp = await context.newCDPSession(page);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
    const point = await page.locator('[data-drink-id=drink] .drink-content').evaluate(element => {
      const box = element.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    const tap = async () => {
      await touch('touchStart', point);
      await page.waitForTimeout(35);
      await touch('touchEnd');
      await page.waitForTimeout(55);
    };

    // Quatro toques acidentais formam apenas o primeiro duplo toque; os extras
    // são absorvidos pelo cooldown e não iniciam uma pressão longa atrasada.
    await tap(); await tap(); await tap(); await tap();
    await page.waitForTimeout(850);
    assert.equal(await page.evaluate(() => state.events.length), 1);
    assert.equal(await page.locator('#log-dialog').evaluate(dialog => dialog.open), false);

    // O fim do toque fora do botão também cancela a pressão longa.
    const main = page.locator('[data-drink-id=drink] .drink-main');
    await main.dispatchEvent('pointerdown', { pointerId: 31, pointerType: 'touch', isPrimary: true, clientX: point.x, clientY: point.y });
    await page.locator('body').dispatchEvent('pointerup', { pointerId: 31, pointerType: 'touch', isPrimary: true, clientX: 2, clientY: 2 });
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#log-dialog').evaluate(dialog => dialog.open), false);

    // Mesmo sem pointerup, um card reconstruído não pode abrir o diálogo antigo.
    await main.dispatchEvent('pointerdown', { pointerId: 32, pointerType: 'touch', isPrimary: true, clientX: point.x, clientY: point.y });
    await page.evaluate(() => render());
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#log-dialog').evaluate(dialog => dialog.open), false);

    // A pressão longa intencional continua disponível após o cooldown.
    const currentMain = page.locator('[data-drink-id=drink] .drink-main');
    await currentMain.dispatchEvent('pointerdown', { pointerId: 33, pointerType: 'touch', isPrimary: true, clientX: point.x, clientY: point.y });
    await page.waitForTimeout(780);
    assert.equal(await page.locator('#log-dialog').evaluate(dialog => dialog.open), true);
    await page.locator('body').dispatchEvent('pointerup', { pointerId: 33, pointerType: 'touch', isPrimary: true });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
