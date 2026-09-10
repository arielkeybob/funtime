const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

test('BPM: oito toques, interrupções, isolamento e movimento reduzido', { timeout: 60000 }, async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await page.getByRole('button', { name: 'Começar sem dados', exact: true }).click();
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    const before = await page.evaluate(() => JSON.stringify(localStorage));
    const taps = (count, mode = 'normal') => page.evaluate(({ count, mode }) => {
      window.tapTestTime = (window.tapTestTime || 10000) + 3000;
      const target = document.querySelector(mode === 'button' ? '#empty-add-button' : '#home-view');
      const send = (type, time, x = 20, primary = true, id = 1) => {
        const event = new PointerEvent(type, { bubbles: true, pointerId: id, isPrimary: primary, button: 0, clientX: x, clientY: 250 });
        Object.defineProperty(event, 'timeStamp', { value: time });
        target.dispatchEvent(event);
      };
      for (let i = 0; i < count; i++) {
        const time = window.tapTestTime + i * 500;
        send('pointerdown', time);
        if (mode === 'drag') send('pointermove', time + 20, 40);
        if (mode === 'multi') send('pointerdown', time + 10, 20, false, 2);
        if (mode === 'scroll') document.dispatchEvent(new Event('scroll'));
        send('pointerup', time + (mode === 'hold' ? 400 : 50));
      }
      window.tapTestTime += count * 500;
    }, { count, mode });
    await taps(7);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);
    // A pausa entre chamadas deve reiniciar a sequência.
    await taps(1);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);
    await taps(8);
    assert.equal(await page.locator('.tap-bpm-balloon').textContent(), '120 BPM');
    assert.equal(await page.locator('.tap-bpm-balloon').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.waitForTimeout(350);
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'funtime-tap-bpm.png') });
    await page.waitForTimeout(2300);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);
    for (const mode of ['button', 'drag', 'multi', 'scroll', 'hold']) {
      await taps(8, mode);
      assert.equal(await page.locator('.tap-bpm-balloon').count(), 0, mode);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await taps(8);
    assert.equal(await page.locator('.tap-bpm-balloon').evaluate(el => getComputedStyle(el).animationName), 'tap-bpm-fade');
    await page.locator('#empty-add-button').click();
    await taps(8);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
