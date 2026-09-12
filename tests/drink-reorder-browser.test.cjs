// Browser real em viewport móvel, origem e perfil efêmeros; não acessa dados do usuário.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

test('Home separa recentes e preserva a ordem manual pelo arraste no ícone', { timeout: 60000 }, async () => {
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
      state.drinks = [
        { id: 'recent', name: 'Recente', icon: '🍺', intervalMinutes: 60, askDoseSize: false },
        { id: 'water', name: 'Água', icon: '💧', intervalMinutes: 60, askDoseSize: false },
        { id: 'wine', name: 'Vinho', icon: '🍷', intervalMinutes: 60, askDoseSize: false },
        { id: 'juice', name: 'Suco', icon: '🍹', intervalMinutes: 60, askDoseSize: false },
      ];
      state.events = [{
        id: 'event', drinkId: 'recent', drinkName: 'Recente', drinkIcon: '🍺',
        consumedAt: Date.now() - 60000, intervalMinutes: 60, doseSize: null,
      }];
      saveData();
      render();
    });

    const domOrder = () => page.locator('.drink-card').evaluateAll(cards => cards.map(card => card.dataset.drinkId));
    assert.deepEqual(await domOrder(), ['recent', 'water', 'wine', 'juice']);
    assert.equal(await page.locator('.drink-group-separator').textContent(), 'Outras bebidas');
    assert.equal(await page.locator('[data-drink-id=recent] .is-reorder-handle').count(), 0);
    assert.equal(await page.locator('.is-reorder-handle').count(), 3);

    const center = locator => locator.boundingBox().then(box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }));
    const cdp = await context.newCDPSession(page);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });

    // Um movimento de rolagem antes da pressão longa não inicia o arraste.
    const water = await center(page.locator('[data-drink-id=water] .drink-icon'));
    await touch('touchStart', water);
    await touch('touchMove', { x: water.x, y: water.y + 40 });
    await page.waitForTimeout(550);
    assert.equal(await page.locator('.drink-reorder-ghost').count(), 0);
    await touch('touchEnd');

    const juice = await center(page.locator('[data-drink-id=juice] .drink-icon'));
    await touch('touchStart', juice);
    await page.waitForFunction(() => document.querySelector('.drink-reorder-ghost'));
    assert.equal(await page.locator('#log-dialog').evaluate(dialog => dialog.open), false);
    const waterCard = await page.locator('[data-drink-id=water]').boundingBox();
    const target = { x: waterCard.x + waterCard.width / 2, y: waterCard.y + 10 };
    await touch('touchMove', target);
    await touch('touchEnd');
    await page.waitForFunction(() => !document.querySelector('.drink-reorder-ghost'));

    assert.deepEqual(await domOrder(), ['recent', 'juice', 'water', 'wine']);
    assert.deepEqual(await page.evaluate(() => state.drinks.map(drink => drink.id)), ['recent', 'juice', 'water', 'wine']);
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'funtime-drink-reorder.png') });

    // Ao sair do período recente, o card retorna à posição manual preservada.
    await page.evaluate(() => {
      state.events[0].consumedAt = Date.now() - 25 * 60 * 60 * 1000;
      saveData();
      render();
    });
    assert.equal(await page.locator('.drink-group-separator').count(), 0);
    assert.deepEqual(await domOrder(), ['recent', 'juice', 'water', 'wine']);

    await page.evaluate(() => openSettingsView());
    assert.equal(await page.locator('#prioritize-recent-drinks').isChecked(), true);
    await page.locator('label[for=prioritize-recent-drinks]').click();
    assert.equal(await page.evaluate(() => state.preferences.prioritizeRecentDrinks), false);
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && state.drinks.length === 4);
    assert.equal(await page.locator('#prioritize-recent-drinks').isChecked(), false);
    assert.deepEqual(await domOrder(), ['recent', 'juice', 'water', 'wine']);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
