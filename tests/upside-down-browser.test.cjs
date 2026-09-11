const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

test('Mundo invertido: gesto, cancelamento, duração, isolamento e movimento reduzido', async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await page.getByRole('button', { name: 'Começar sem dados', exact: true }).click();
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => !document.body.classList.contains('boot-pending'));
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const before = await page.evaluate(() => JSON.stringify(localStorage));
    const size = await page.locator('.home-header-eyebrow').evaluate(el => getComputedStyle(el).fontSize);
    const send = (type, selector = '#home-header h1', extra = {}) => page.locator(selector).dispatchEvent(type, {
      pointerId: 1, isPrimary: true, button: 0, clientX: 30, clientY: 60, ...extra
    });
    const active = () => page.locator('.upside-down-world').count();
    for (const mode of ['short', 'move', 'cancel', 'multi', 'scroll']) {
      await send('pointerdown');
      if (mode === 'short') await send('pointerup');
      if (mode === 'move') await send('pointermove', '#home-header h1', { clientX: 70 });
      if (mode === 'cancel') await send('pointercancel');
      if (mode === 'multi') await send('pointerdown', '#home-header h1', { pointerId: 2, isPrimary: false });
      if (mode === 'scroll') await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
      await page.clock.runFor(1600);
      assert.equal(await active(), 0, mode);
      await send('pointerup');
    }
    for (const selector of ['#home-header h1', '.home-header-eyebrow', '#home-header', '#app-shell']) {
      await send('pointerdown', selector);
      await page.clock.runFor(1499);
      assert.equal(await active(), 0);
      await page.clock.runFor(1);
      assert.equal(await active(), 1);
      await send('pointerup', selector);
      assert.equal(await page.locator('.home-header-eyebrow').textContent(), 'TimeFun');
      assert.equal(await page.locator('#home-header h1').textContent(), 'Final');
      assert.equal(await page.locator('.home-header-eyebrow').evaluate(el => getComputedStyle(el).fontSize), size);
      assert.equal(await page.locator('.upside-down-world').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
      await page.locator('#empty-add-button').click();
      assert.equal(await page.locator('#drink-dialog').getAttribute('open'), '');
      await page.locator('#cancel-dialog').click();
      await page.clock.runFor(19000);
      assert.equal(await active(), 1);
      await page.clock.runFor(1000);
      assert.equal(await active(), 0);
      assert.equal(await page.locator('.home-header-eyebrow').textContent(), 'FunTime');
      assert.equal(await page.locator('#home-header h1').textContent(), 'Início');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await send('pointerdown');
    await page.clock.runFor(1500);
    await send('pointerup');
    assert.equal(await page.locator('.upside-down-world i').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'funtime-upside-down.png') });
    await page.keyboard.press('Escape');
    assert.equal(await active(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

