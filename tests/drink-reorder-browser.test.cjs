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
      clearInterval(state.timerId);
      state.timerId = null;
    });

    const domOrder = () => page.locator('.drink-card').evaluateAll(cards => cards.map(card => card.dataset.drinkId));
    assert.deepEqual(await domOrder(), ['recent', 'water', 'wine', 'juice']);
    assert.equal(await page.locator('.drink-group-separator').textContent(), 'Outras bebidas');
    assert.equal(await page.locator('[data-drink-id=recent] .is-reorder-handle').count(), 0);
    assert.equal(await page.locator('.is-reorder-handle').count(), 3);

    const center = async locator => {
      return locator.evaluate(element => {
        element.scrollIntoView({ block: 'nearest' });
        const box = element.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
    };
    const cdp = await context.newCDPSession(page);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });

    // Um movimento de rolagem antes da pressão longa não inicia o arraste.
    const water = await center(page.locator('[data-drink-id=water] .drink-icon'));
    await touch('touchStart', water);
    await touch('touchMove', { x: water.x, y: water.y + 40 });
    await page.waitForTimeout(550);
    assert.equal(await page.locator('.drink-reorder-ghost').count(), 0);
    await touch('touchEnd');

    // Uma reconstrução solicitada durante os 750 ms de espera cancela o gesto
    // e nunca reinsere um card antigo que já saiu do DOM.
    const juicePending = await center(page.locator('[data-drink-id=juice] .drink-icon'));
    await touch('touchStart', juicePending);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => state.pendingDrinkReorderId), 'juice');
    await page.evaluate(() => render());
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.drink-reorder-ghost').count(), 0);
    assert.deepEqual(await domOrder(), ['recent', 'water', 'wine', 'juice']);
    await touch('touchEnd');
    await page.waitForTimeout(100);

    const juice = await center(page.locator('[data-drink-id=juice] .drink-icon'));
    const wineCard = await page.locator('[data-drink-id=wine]').evaluate(element => element.getBoundingClientRect().toJSON());
    const scrollBeforeDrag = await page.evaluate(() => scrollY);
    await touch('touchStart', juice);
    await page.waitForFunction(() => document.querySelector('.drink-reorder-ghost'));
    assert.equal(await page.locator('#log-dialog').evaluate(dialog => dialog.open), false);
    const target = { x: wineCard.x + wineCard.width / 2, y: wineCard.y + 10 };
    await touch('touchMove', target);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => scrollY), scrollBeforeDrag);
    await touch('touchEnd');
    await page.waitForFunction(() => !document.querySelector('.drink-reorder-ghost'));

    assert.deepEqual(await domOrder(), ['recent', 'water', 'juice', 'wine']);
    assert.deepEqual(await page.evaluate(() => state.drinks.map(drink => drink.id)), ['recent', 'water', 'juice', 'wine']);
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'funtime-drink-reorder.png') });

    // Ao sair do período recente, o card retorna à posição manual preservada.
    await page.evaluate(() => {
      state.events[0].consumedAt = Date.now() - 25 * 60 * 60 * 1000;
      saveData();
      render();
    });
    assert.equal(await page.locator('.drink-group-separator').count(), 0);
    assert.deepEqual(await domOrder(), ['recent', 'water', 'juice', 'wine']);

    await page.evaluate(() => openSettingsView());
    assert.equal(await page.locator('#prioritize-recent-drinks').isChecked(), true);
    await page.evaluate(() => {
      const input = document.querySelector('#prioritize-recent-drinks');
      input.checked = false;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await page.evaluate(() => state.preferences.prioritizeRecentDrinks), false);
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && state.drinks.length === 4);
    await page.evaluate(() => { clearInterval(state.timerId); state.timerId = null; });
    assert.equal(await page.locator('#prioritize-recent-drinks').isChecked(), false);
    assert.deepEqual(await domOrder(), ['recent', 'water', 'juice', 'wine']);
    await page.evaluate(() => closeSettingsView());

    // Se uma ação remover o card durante o gesto, o arraste é cancelado sem
    // reintroduzir a bebida nem gravar uma posição nula na lista.
    const wine = await center(page.locator('[data-drink-id=wine] .drink-icon'));
    await touch('touchStart', wine);
    await page.waitForFunction(() => document.querySelector('.drink-reorder-ghost'));
    await page.evaluate(() => {
      state.drinks = state.drinks.filter(drink => drink.id !== 'wine');
      saveData();
      render();
    });
    await touch('touchEnd');
    assert.equal(await page.locator('.drink-reorder-ghost').count(), 0);
    assert.deepEqual(await page.evaluate(() => state.drinks.map(drink => drink.id)), ['recent', 'water', 'juice']);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('funtime-v1-data')).drinks.includes(null)), false);

    await page.evaluate(() => {
      const corrupted = JSON.parse(localStorage.getItem('funtime-v1-data'));
      corrupted.drinks.push(null);
      localStorage.setItem('funtime-v1-data', JSON.stringify(corrupted));
    });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    assert.deepEqual(await page.evaluate(() => state.drinks.map(drink => drink.id)), ['recent', 'water', 'juice']);
    assert.equal(await page.evaluate(() => state.events.some(event => event.id === 'event')), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
