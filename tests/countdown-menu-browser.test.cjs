// Browser real, origem e perfil efêmeros; não acessa a instalação do usuário.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

test('Menu de dose, contagem cancelada e editor de horário', { timeout: 90000 }, async () => {
  const server = http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.replace(/^\/funtime\//, '') || 'index.html';
    if (file.includes('..') || file.startsWith('/')) return res.writeHead(404).end();
    try {
      const type = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }).end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await page.getByRole('button', { name: 'Começar sem dados', exact: true }).click();
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => history.state?.funtimeNavigation && !document.body.classList.contains('boot-pending'));
    await page.evaluate(() => {
      state.drinks = [{ id: 'd', name: 'Teste', icon: '💧', intervalMinutes: 30, askDoseSize: false }];
      state.events = [{ id: 'e', drinkId: 'd', drinkName: 'Teste', drinkIcon: '💧', consumedAt: Date.now(), intervalMinutes: 30, doseSize: null }];
      saveData(); render();
    });
    await page.evaluate(() => {
      state.drinks.push({ id: 'other', name: 'Outra', icon: '⭐', intervalMinutes: 60, askDoseSize: false });
      state.events[0].consumedAt = Date.now() - 600000;
      state.events.push({ ...state.events[0], id: 'older', consumedAt: Date.now() - 7200000 });
      state.events.push({ ...state.events[0], id: 'other-event', drinkId: 'other' });
      saveData(); render(); openDrinkMenuDialog('d');
    });
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(state.events)));
    assert.equal(await page.locator('#drink-menu-stop').isVisible(), true);
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'funtime-dose-menu.png') });
    await page.locator('#drink-menu-stop').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#drink-menu-dialog').evaluate(node => node.open), true);
    assert.deepEqual(await page.evaluate(() => state.events), before);
    await page.locator('#drink-menu-stop').click();
    await page.evaluate(() => { globalThis.realSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); }; });
    await page.locator('#confirm-stop-countdown').click();
    assert.equal(await page.locator('#stop-countdown-error').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => state.events), before);
    await page.evaluate(() => { Storage.prototype.setItem = realSetItem; });
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'funtime-stop-confirm.png') });
    await page.locator('#confirm-stop-countdown').click();
    assert.equal(await page.locator('#drink-menu-stop').isVisible(), false);
    assert.ok(await page.evaluate(() => getDrinkActivity(state.drinks[0]).remainingMs <= 0));
    assert.deepEqual(await page.evaluate(() => state.events), before.slice(1));
    assert.ok(await page.evaluate(() => getDrinkActivity(state.drinks[1]).remainingMs > 0));
    await page.evaluate(() => { closeDrinkMenuDialog(); openDeleteDrinkDialog('d'); });
    assert.equal(await page.locator('#delete-drink-name').textContent(), '💧 Teste');
    await page.evaluate(() => { closeDeleteDrinkDialog(); openHistoryView('d'); });
    assert.equal(await page.getByText('Contagem desfeita', { exact: true }).count(), 0);
    await page.evaluate(() => openEventDialog('older'));
    assert.equal(await page.locator('#event-dialog input[type=time]').count(), 0);
    assert.equal(await page.locator('#event-hour option').count(), 24);
    assert.equal(await page.locator('#event-minute option').count(), 60);
    await page.locator('#event-hour').selectOption('01');
    await page.locator('#event-minute').selectOption('23');
    await page.locator('#event-date').fill('2026-09-06');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.locator('.event-time-selects').evaluate(node => node.getBoundingClientRect().right <= innerWidth));
    }
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'funtime-event-time.png') });
    await page.locator('#event-form button[type=submit]').click();
    const edited = await page.evaluate(() => state.events[0]);
    assert.equal(new Date(edited.consumedAt).getHours(), 1);
    assert.equal(new Date(edited.consumedAt).getMinutes(), 23);
    assert.equal(edited.intervalMinutes, before[0].intervalMinutes);
    assert.equal(edited.countingStoppedAt, undefined);
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    assert.equal(await page.evaluate(() => state.events.some(event => event.id === 'e')), false);
    await page.evaluate(() => {
      state.events.push({ ...state.events[0], id: 'new', consumedAt: Date.now() });
      saveData(); openDrinkMenuDialog('d');
    });
    assert.equal(await page.locator('#drink-menu-stop').isVisible(), true);
    await page.locator('#drink-menu-stop').click();
    // Uma nova dose durante a confirmação invalida o alvo antigo.
    await page.evaluate(() => { state.events.push({ ...state.events.at(-1), id: 'newest', consumedAt: Date.now() + 1 }); });
    await page.locator('#confirm-stop-countdown').click();
    assert.equal(await page.evaluate(() => state.events.at(-1).id), 'newest');
    assert.equal(await page.locator('#stop-countdown-dialog').evaluate(node => node.open), false);
    await page.evaluate(() => {
      state.events = state.events.filter(event => !['new', 'newest'].includes(event.id));
      state.events[0] = { ...state.events[0], countingStoppedAt: undefined, consumedAt: Date.now() - 7200000 };
      updateDrinkMenuCountdown();
    });
    assert.equal(await page.locator('#drink-menu-stop').isVisible(), false);
    await page.evaluate(() => { state.events = state.events.filter(event => event.drinkId !== 'd'); updateDrinkMenuCountdown(); });
    assert.equal(await page.locator('#drink-menu-stop').isVisible(), false);
    await page.evaluate(() => { closeDrinkMenuDialog(); openSettingsView(); });
    const style = selector => page.locator(selector).evaluate(node => { const s = getComputedStyle(node); return [s.backgroundColor, s.borderRadius, s.minHeight, s.fontSize]; });
    assert.deepEqual(await style('#counting-mode'), await style('#security-relock'));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});