// Browser real, origem e perfil efêmeros; não acessa a instalação do usuário.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

test('Ícones: arraste, teclado, cancelamento e persistência em perfil isolado', { timeout: 90000 }, async () => {
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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
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
      persistIconCatalog(['💧', '🍺', '⭐', '🍷']);
      openEditDrinkDialog('d');
    });
    assert.equal(await page.locator('.icon-move').count(), 0);
    await page.locator('.icon-edit').click();
    const order = () => page.evaluate(() => state.preferences.iconCatalog);
    const selected = () => page.locator('#icon-options input:checked').inputValue();
    const handle = icon => page.locator(`.icon-move[data-icon="${icon}"]`);
    assert.equal(await selected(), '💧');
    await handle('💧').focus();
    await page.keyboard.press('End');
    assert.deepEqual(await order(), ['🍺', '⭐', '🍷', '💧']);
    assert.equal(await selected(), '💧');
    await page.keyboard.press('Home');
    assert.deepEqual(await order(), ['💧', '🍺', '⭐', '🍷']);
    const drag = async (from, to, cancel = false) => {
      const a = await handle(from).boundingBox();
      const b = await handle(to).boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    await drag('💧', '⭐', true);
    assert.deepEqual(await order(), ['💧', '🍺', '⭐', '🍷']);
    assert.equal(await page.locator('.icon-move').count(), 4);
    await drag('💧', '⭐');
    assert.deepEqual(await order(), ['🍺', '⭐', '💧', '🍷']);
    assert.equal(await selected(), '💧');
    const cdp = await context.newCDPSession(page);
    const touchDrag = async cancel => {
      const a = await handle('💧').boundingBox(), b = await handle('🍺').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + 30, y: a.y + 22 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 30, y: b.y + 22 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    };
    await touchDrag(true);
    assert.deepEqual(await order(), ['🍺', '⭐', '💧', '🍷']);
    await touchDrag(false);
    assert.deepEqual(await order(), ['💧', '🍺', '⭐', '🍷']);
    await handle('💧').focus();
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await order(), ['🍺', '⭐', '💧', '🍷']);
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'funtime-icon-reorder.png') });
    await page.evaluate(() => { globalThis.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); }; });
    await handle('💧').focus();
    await page.keyboard.press('Home');
    assert.deepEqual(await order(), ['🍺', '⭐', '💧', '🍷']);
    assert.match(await page.locator('#icon-catalog-status').textContent(), /Não foi possível salvar/);
    await page.evaluate(() => { Storage.prototype.setItem = globalThis.originalSetItem; });
    await page.locator('.icon-edit').click();
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    assert.deepEqual(await order(), ['🍺', '⭐', '💧', '🍷']);
    assert.equal(await page.evaluate(() => state.events[0].drinkIcon), '💧');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
