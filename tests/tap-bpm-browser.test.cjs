const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

test('BPM: quatro toques, refinamento em oito seguidos, reinício, interrupções, isolamento e movimento reduzido', { timeout: 60000 }, async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Player de teste</title><div>vídeo</div>'
    }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    const before = await page.evaluate(() => JSON.stringify(localStorage));
    // `gaps`: um intervalo (ms) por toque, contado a partir do toque anterior enviado
    // nesta sessão de testes. Um gap > 2000 (ou < 200) reproduz uma pausa/aproximação
    // que a própria página usa para reiniciar a sequência — assim cada burst pode
    // isolar-se do anterior (primeiro gap grande) ou continuar de onde parou.
    const taps = (gaps, mode = 'normal') => page.evaluate(({ gaps, mode }) => {
      const target = document.querySelector(mode === 'button' ? '#empty-add-button' : mode === 'notice' ? '.notice' : '#home-view');
      const send = (type, time, x = 20, primary = true, id = 1) => {
        const event = new PointerEvent(type, { bubbles: true, pointerId: id, isPrimary: primary, button: 0, clientX: x, clientY: 250 });
        Object.defineProperty(event, 'timeStamp', { value: time });
        target.dispatchEvent(event);
      };
      for (const gap of gaps) {
        window.tapTestTime = (window.tapTestTime ?? 10000) + gap;
        const time = window.tapTestTime;
        send('pointerdown', time);
        if (mode === 'drag') send('pointermove', time + 20, 40);
        if (mode === 'multi') send('pointerdown', time + 10, 20, false, 2);
        if (mode === 'scroll') document.dispatchEvent(new Event('scroll'));
        send('pointerup', time + (mode === 'hold' ? 400 : 50));
      }
    }, { gaps, mode });
    const burst = (count, mode = 'normal', spacing = 500) => taps([3000, ...Array(count - 1).fill(spacing)], mode);

    // Três toques isolados: abaixo do novo limite de 4, não deve exibir nada.
    await burst(3);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);
    // A pausa entre chamadas deve reiniciar a sequência (3 + 1 não vira 4).
    await taps([3000]);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);

    // Sequência nova de 4 toques seguidos: primeiro palpite (mais grosseiro).
    await burst(4);
    assert.equal(await page.locator('.tap-bpm-balloon').textContent(), '120 BPM');
    assert.equal(await page.locator('.tap-bpm-balloon').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.waitForTimeout(350);
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'funtime-tap-bpm.png') });

    // Continuando a MESMA sequência (sem pausa) até 8 toques, com um ritmo mais
    // acelerado no final: o segundo palpite deve recalcular sobre os 8, não repetir
    // nem ignorar o novo ritmo.
    await taps([500, 300, 300, 300]);
    assert.equal(await page.locator('.tap-bpm-balloon').textContent(), '145 BPM');
    await page.waitForTimeout(2300);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);

    // Após os 8 toques seguidos, a contagem reinicia: continuar tocando (mesmo sem
    // pausa) só deve disparar de novo ao completar outros 4, não em 9/10/11.
    await taps([500, 500, 500, 500]);
    assert.equal(await page.locator('.tap-bpm-balloon').textContent(), '120 BPM');
    await page.waitForTimeout(2300);

    await burst(8, 'notice');
    assert.equal(await page.locator('.tap-bpm-balloon').textContent(), '120 BPM');
    assert.equal(await page.locator('.notice').evaluate(el => getComputedStyle(el).userSelect), 'none');
    await page.waitForTimeout(2300);
    for (const mode of ['button', 'drag', 'multi', 'scroll', 'hold']) {
      await burst(8, mode);
      assert.equal(await page.locator('.tap-bpm-balloon').count(), 0, mode);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await burst(8);
    assert.equal(await page.locator('.tap-bpm-balloon').evaluate(el => getComputedStyle(el).animationName), 'tap-bpm-fade');
    await page.locator('#empty-add-button').click();
    await burst(8);
    assert.equal(await page.locator('.tap-bpm-balloon').count(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('vídeo: segurar o aviso abre um player temporário ao fundo', { timeout: 60000 }, async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      window.testVibrations = [];
      Object.defineProperty(navigator, 'vibrate', { value: duration => { window.testVibrations.push(duration); return true; } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    const before = await page.evaluate(() => JSON.stringify(localStorage));
    const trigger = () => page.evaluate(() => {
      if (!window.originalTapTestTimeout) {
        window.originalTapTestTimeout = window.setTimeout;
        window.setTimeout = (callback, delay, ...args) => window.originalTapTestTimeout(callback, delay === 1500 ? 300 : delay === 1200 ? 100 : delay === 20000 ? 1500 : delay === 2000 ? 300 : delay, ...args);
        window.backgroundTestRandom = .34;
        Math.random = () => window.backgroundTestRandom;
      }
      window.videoTapTestTime = (window.videoTapTestTime || 50000) + 3000;
      const target = document.querySelector('.notice');
      const send = (type, time) => {
        const event = new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: 30, clientY: 700 });
        Object.defineProperty(event, 'timeStamp', { value: time });
        target.dispatchEvent(event);
      };
      send('pointerdown', window.videoTapTestTime);
    });
    await trigger();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.youtube-easter-egg').count(), 0);
    await page.waitForSelector('.youtube-easter-egg.is-visible');
    const firstSource = await page.locator('.youtube-easter-egg').getAttribute('data-source');
    assert.match(firstSource, /^\.\/bg\/[\w.-]+\.mp4$/);
    assert.deepEqual(await page.locator('.youtube-easter-egg video').evaluate(video => ({
      autoplay: video.autoplay, muted: video.muted, loop: video.loop,
      playsInline: video.playsInline, controls: video.controls, src: video.src
    })), { autoplay: true, muted: true, loop: true, playsInline: true, controls: false, src: await page.locator('.youtube-easter-egg video').getAttribute('src') });
    assert.match(await page.locator('.youtube-easter-egg video').getAttribute('src'), /\/bg\/[\w.-]+\.mp4$/);
    assert.equal(await page.locator('.youtube-easter-egg').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    assert.deepEqual(await page.evaluate(() => window.testVibrations), [1200]);
    assert.equal(await page.locator('#app-shell').getAttribute('inert'), null);
    assert.equal(await page.locator('#app-shell').evaluate(el => getComputedStyle(el).visibility), 'visible');
    assert.equal(await page.locator('.youtube-easter-egg').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    assert.ok(Number(await page.locator('.youtube-easter-egg').evaluate(el => getComputedStyle(el).opacity)) <= .52);
    assert.match(await page.locator('.notice').evaluate(el => getComputedStyle(el).backgroundColor), /rgba\(/);
    await page.locator('#empty-add-button').click();
    assert.equal(await page.locator('#drink-dialog').getAttribute('open'), '');
    assert.equal(await page.locator('.youtube-easter-egg').count(), 1);
    await page.locator('#cancel-dialog').click();
    await page.waitForSelector('.youtube-easter-egg', { state: 'detached', timeout: 8000 });
    await page.waitForFunction(async source => Boolean(await (await caches.open('funtime-bg-v1')).match(new URL(source, location.href).href)), firstSource);
    await page.evaluate(() => { window.backgroundTestRandom = 0; });
    await trigger();
    await page.waitForSelector('.youtube-easter-egg.is-visible');
    const secondSource = await page.locator('.youtube-easter-egg').getAttribute('data-source');
    assert.notEqual(secondSource, firstSource);
    assert.deepEqual(await page.evaluate(() => window.testVibrations), [1200, 1200]);
    await page.waitForSelector('.youtube-easter-egg', { state: 'detached', timeout: 8000 });
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), before);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
