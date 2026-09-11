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
    for (const mode of ['countdown', 'normal']) {
      await page.evaluate(mode => {
        state.preferences.countingMode = mode;
        state.drinks = [{ id: 'test-water', name: 'Água', icon: '💧', intervalMinutes: 60, askDoseSize: false }];
        state.events = [{ id: 'test-event', drinkId: 'test-water', drinkName: 'Água', drinkIcon: '💧', consumedAt: Date.now() - 600000, intervalMinutes: 60 }];
        refreshDataViews();
      }, mode);
      const dataBefore = await page.evaluate(() => JSON.stringify(buildCurrentAppData()));
      await send('pointerdown');
      await page.clock.runFor(1500);
      await send('pointerup');
      assert.equal(await page.evaluate(() => effectiveCountingMode()), mode === 'normal' ? 'countdown' : 'normal');
      assert.match(await page.locator('#drink-list').innerText(), mode === 'normal' ? /Falta: -/ : /Contando:/);
      assert.equal(await page.locator('.upside-marquee span').count(), 1);
      assert.ok(await page.locator('.upside-marquee span').textContent());
      assert.equal(await page.locator('.upside-marquee span').evaluate(el => getComputedStyle(el).animationName), 'upside-marquee-travel');
      await page.locator('#open-history').click();
      assert.match(await page.locator('#history-list').innerText(), mode === 'normal' ? /atrás/ : /Falta 00:50/);
      await page.clock.runFor(20000);
      assert.equal(await page.locator('.upside-marquee').count(), 0);
      assert.match(await page.locator('#history-list').innerText(), mode === 'normal' ? /Falta 00:50/ : /atrás/);
      assert.equal(await page.evaluate(() => JSON.stringify(buildCurrentAppData())), dataBefore);
      await page.locator('#close-history').click();
      assert.match(await page.locator('#drink-list').innerText(), mode === 'normal' ? /Contando:/ : /Falta: -/);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await send('pointerdown');
    await page.clock.runFor(1500);
    await send('pointerup');
    assert.equal(await page.locator('.upside-down-world i').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.locator('.upside-marquee span').evaluate(el => getComputedStyle(el).animationName), 'none');
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

test('Mundo invertido: ciclo sem repetição e respostas à sequência rápida', async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => { Math.random = () => .37; });
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await page.getByRole('button', { name: 'Começar sem dados', exact: true }).click();
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => !document.body.classList.contains('boot-pending'));
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const trigger = async () => {
      await page.locator('#home-header h1').dispatchEvent('pointerdown', {
        pointerId: 1, isPrimary: true, button: 0, clientX: 30, clientY: 60
      });
      await page.clock.runFor(1500);
      await page.locator('#home-header h1').dispatchEvent('pointerup', {
        pointerId: 1, isPrimary: true, button: 0, clientX: 30, clientY: 60
      });
      const phrase = await page.locator('.upside-marquee span').textContent();
      await page.clock.runFor(20000);
      return phrase;
    };
    const shown = [];
    for (let index = 0; index < 16; index++) shown.push(await trigger());
    assert.equal(shown[0], 'Você está sóbrio ou tudo ficou invertido?');
    assert.equal(new Set(shown.slice(0, 9)).size, 9);
    assert.deepEqual(shown.slice(9, 14), [
      'Parece que você gostou de ficar fazendo isso.',
      'Porra, viciou em visitar o mundo invertido?',
      'Sério, para com esses vícios estranhos.',
      'Porque você não vai dançar e me deixa em paz?',
      '!'
    ]);
    assert.equal(new Set([...shown.slice(0, 9), ...shown.slice(14, 16)]).size, 11);
    await page.clock.runFor(45001);
    const afterPause = await trigger();
    assert.equal(afterPause, 'Você está sóbrio ou tudo ficou invertido?');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

