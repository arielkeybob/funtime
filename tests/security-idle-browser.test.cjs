// Bloqueio por inatividade: um contador só — o tempo escolhido vale fora do app (caminho
// existente) e parado com o app aberto. Só toque/rolagem/digitação contam como uso.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

async function withPage(run) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', (error) => erros.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    await run(page, erros);
  } finally {
    await browser.close();
    server.close();
  }
}

// Liga o bloqueio (PIN fictício) e deixa a contagem parada há `parado` segundos.
const preparar = (page, { relockSeconds, relockIdle, parado }) => page.evaluate(({ relockSeconds, relockIdle, parado }) => {
  state.securityConfig = { version: 4, enabled: true, method: 'pin', relockSeconds, relockIdle, eventUnlockOccasionId: null, pin: { salt: 'AQID', hash: 'BAUG', iterations: 1, length: 4 }, webauthn: null };
  state.securityLocked = false;
  state.securityLastActivityAt = Date.now() - parado * 1000;
}, { relockSeconds, relockIdle, parado });

const travado = (page) => page.evaluate(() => { checkSecurityIdle(); return state.securityLocked; });

test('parado além do tempo escolhido, o app bloqueia; dentro do tempo, não', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await preparar(page, { relockSeconds: 30, relockIdle: true, parado: 10 });
    assert.equal(await travado(page), false);
    await preparar(page, { relockSeconds: 30, relockIdle: true, parado: 31 });
    assert.equal(await travado(page), true);
    assert.equal(await page.locator('#lock-screen').isVisible(), true);
    assert.deepEqual(erros, []);
  });
});

test('tocar, rolar ou digitar conta como uso e zera a contagem', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    for (const evento of ['keydown', 'input', 'wheel', 'touchmove', 'scroll']) {
      await preparar(page, { relockSeconds: 30, relockIdle: true, parado: 31 });
      await page.evaluate((tipo) => document.body.dispatchEvent(new Event(tipo, { bubbles: true })), evento);
      assert.equal(await travado(page), false, `${evento} deveria contar como uso`);
    }
    await preparar(page, { relockSeconds: 30, relockIdle: true, parado: 31 });
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    assert.equal(await travado(page), false, 'toque conta como uso');
    assert.deepEqual(erros, []);
  });
});

test('"Ao sair do app" (0) e configuração antiga (relockIdle falso) nunca bloqueiam parado', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await preparar(page, { relockSeconds: 0, relockIdle: true, parado: 3600 });
    assert.equal(await travado(page), false);
    await preparar(page, { relockSeconds: 300, relockIdle: false, parado: 3600 });
    assert.equal(await travado(page), false);
    assert.deepEqual(erros, []);
  });
});

test('app oculto e "manter desbloqueado durante o evento" não bloqueiam', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await preparar(page, { relockSeconds: 30, relockIdle: true, parado: 3600 });
    await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
    assert.equal(await travado(page), false, 'oculto: o caminho de "fora do app" é outro');
    await page.evaluate(() => { delete document.hidden; });

    await preparar(page, { relockSeconds: 30, relockIdle: true, parado: 3600 });
    await page.evaluate(() => {
      state.preferences.eventsEnabled = true;
      state.securityConfig.eventUnlockOccasionId = 'o1';
      state.occasions = [{ id: 'o1', name: 'Festa', startedAt: Date.now() - 1000, endedAt: null, scheduledEndAt: null }];
    });
    assert.equal(await travado(page), false, 'evento em andamento com o desbloqueio mantido');
    assert.deepEqual(erros, []);
  });
});

test('escolher um tempo liga o bloqueio por parado e a ajuda acompanha', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await preparar(page, { relockSeconds: 300, relockIdle: false, parado: 0 });
    await page.evaluate(() => { openSettingsView(); showSettingsPage('privacy'); });
    assert.match(await page.locator('#security-relock-help').textContent(), /Hoje só conta o tempo fora do app/);
    assert.equal(await page.locator('#security-relock-help').evaluate((n) => n.classList.contains('clean-optional')), false);
    assert.equal(await page.locator('label[for=security-relock] span').first().textContent(), 'Bloquear após ficar sem uso');
    assert.deepEqual(await page.locator('#security-relock option').allTextContents(), ['Ao sair do app', '30 segundos', '1 minuto', '5 minutos', '15 minutos']);

    await page.locator('#security-relock').selectOption('60');
    assert.equal(await page.evaluate(() => state.securityConfig.relockIdle), true);
    assert.match(await page.locator('#security-relock-help').textContent(), /fora do app ou parado com ele aberto/);
    await page.locator('#security-relock').selectOption('0');
    assert.equal(await page.locator('#security-relock-help').textContent(), 'Bloqueia assim que você sai do app.');
    await page.evaluate(() => showSettingsPage(null));
    assert.match(await page.locator('#settings-summary-privacy').textContent(), /ao sair do app$/);
    assert.deepEqual(erros, []);
  });
});
