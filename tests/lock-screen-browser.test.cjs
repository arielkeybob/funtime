// Tela de bloqueio: sempre nas cores neutras, de qualquer módulo que tenha travado; e a recarga do
// Atualizar, com "Bloquear ao sair do app", continua desbloqueada só por uma marca de uso único,
// desta janela e de prazo curto. Navegador real, origem efêmera; nunca usa armazenamento do usuário.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

const MARK_KEY = 'funtime-security-update-reload-v1';
const currentVersion = fs.readFileSync('app.js', 'utf8').match(/const APP_VERSION = "([^"]+)"/)[1];
const OLD_VERSION = '1.0.0';
const renumber = (bytes) => Buffer.from(bytes.toString('utf8').replaceAll(currentVersion, OLD_VERSION)
  .replaceAll(`funtime-v2-${currentVersion.replaceAll('.', '-')}`, `funtime-v2-${OLD_VERSION.replaceAll('.', '-')}`));

async function newInstalledPage(context) {
  const page = await context.newPage();
  const erros = [];
  page.on('pageerror', (error) => erros.push(error.message));
  return { page, erros };
}

async function installedContext(browser) {
  // Movimento reduzido: a animação de 8 s do Atualizar não roda e a recarga sai na hora.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    try { localStorage.setItem('funtime-tutorial-v1', '{"seen":true,"at":0}'); } catch (e) { /* sem armazenamento */ }
    // A próxima abertura nasce escondida (a pessoa saiu do app no meio da recarga), quando o teste pede.
    if (sessionStorage.getItem('__abrir-oculto')) {
      sessionStorage.removeItem('__abrir-oculto');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    }
  });
  return context;
}

const booted = (page, version = null) => page.waitForFunction((version) => typeof state !== 'undefined'
  && (!version || APP_VERSION === version) && !document.body.classList.contains('boot-pending')
  && !document.body.classList.contains('security-booting'), version);

async function acceptTerms(page) {
  await page.locator('#terms-screen').waitFor({ state: 'visible' });
  for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
  await page.locator('#terms-continue').click();
  await booted(page);
}

// PIN 1234 de verdade (o desbloqueio precisa conferir), bloqueando "ao sair do app".
async function enablePin(page) {
  await page.evaluate(() => { openSettingsView(); openSecurityMethodDialog(); choosePinSecurity(); });
  // O diálogo põe o foco no primeiro campo 50 ms depois de abrir; sob carga esse foco chega no meio
  // do preenchimento do segundo e o texto cai no campo errado. Preencher de novo resolve.
  for (let tentativa = 1; ; tentativa++) {
    await page.locator('#pin-setup-value').fill('1234');
    await page.locator('#pin-setup-confirm').fill('1234');
    const preenchido = await page.waitForFunction(() => document.querySelector('#pin-setup-value').value === '1234'
      && document.querySelector('#pin-setup-confirm').value === '1234', null, { timeout: 1000 }).then(() => true, () => false);
    if (preenchido) break;
    assert.ok(tentativa < 5, 'os campos do PIN não guardaram o valor');
  }
  await page.locator('#pin-setup-dialog button[type=submit]').click();
  await page.waitForFunction(() => state.securityConfig.enabled === true);
  await page.evaluate(() => { state.securityConfig.relockSeconds = 0; saveSecurityConfig(); closeSettingsView(); });
}

async function unlockWithPin(page) {
  await page.locator('#pin-unlock-value').fill('1234');
  await page.locator('#pin-unlock-button').click();
  await page.waitForFunction(() => state.securityLocked === false);
}

const lockState = (page) => page.evaluate((key) => ({
  locked: state.securityLocked,
  lockScreen: !document.querySelector('#lock-screen').hidden,
  mark: sessionStorage.getItem(key),
}), MARK_KEY);

async function withDevServer(run) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await installedContext(browser);
    await run(context, `http://127.0.0.1:${server.address().port}/funtime/`);
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('a tela de bloqueio fica neutra mesmo travando em Eventos ou Amigos; desbloquear devolve a cor', { timeout: 60000 }, async () => {
  await withDevServer(async (context, url) => {
    const { page, erros } = await newInstalledPage(context);
    await page.goto(url);
    await acceptTerms(page);
    await enablePin(page);
    const theme = () => page.evaluate(() => ({
      view: document.documentElement.dataset.view,
      bar: document.querySelector('meta[name="theme-color"]').content,
      button: getComputedStyle(document.querySelector('#pin-unlock-button')).backgroundColor,
    }));

    await page.evaluate(() => { state.preferences.eventsEnabled = true; lockApp(); });
    const neutral = await theme();
    assert.equal(neutral.bar, '#09090b');
    await unlockWithPin(page);

    for (const [open, view, bar] of [['openSharedView', 'shared', '#16130b'], ['openOccasionView', 'occasion', '#130e1c']]) {
      await page.evaluate((open) => globalThis[open](), open);
      assert.equal((await theme()).bar, bar, `${view} tem a própria cor antes de bloquear`);
      await page.evaluate(() => lockApp());
      assert.deepEqual(await theme(), neutral, `bloqueado a partir de ${view}: mesmas cores do bloqueio no Início`);
      await unlockWithPin(page);
      assert.equal(await page.evaluate(() => state.currentView), view, 'desbloquear volta para a mesma tela');
      assert.deepEqual(await theme().then(({ view, bar }) => ({ view, bar })), { view, bar }, 'e com a cor do módulo');
      await page.evaluate(() => closeSharedView());
    }
    assert.deepEqual(erros, []);
  });
});

test('marca da recarga: só com o app desbloqueado e à vista, apagada ao bloquear, no prazo, uma vez e só nesta janela', { timeout: 90000 }, async () => {
  await withDevServer(async (context, url) => {
    let { page, erros } = await newInstalledPage(context);
    await page.goto(url);
    await acceptTerms(page);
    await enablePin(page);

    // Sem a marca, recarregar é uma abertura como outra qualquer: começa bloqueado.
    await page.reload(); await booted(page);
    assert.equal((await lockState(page)).locked, true);
    await page.evaluate(() => markUpdateReloadUnlocked());
    assert.equal((await lockState(page)).mark, null, 'bloqueado não grava a marca');
    await unlockWithPin(page);

    await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
    await page.evaluate(() => markUpdateReloadUnlocked());
    await page.evaluate(() => { delete document.hidden; });
    assert.equal((await lockState(page)).mark, null, 'fora da vista não grava a marca');

    await page.evaluate(() => { markUpdateReloadUnlocked(); lockApp(); });
    assert.equal((await lockState(page)).mark, null, 'bloquear apaga a marca');
    await unlockWithPin(page);

    // Recarga demorou além do prazo (10 s): bloqueia, e a marca não fica para a próxima.
    await page.evaluate((key) => sessionStorage.setItem(key, String(Date.now() - 10001)), MARK_KEY);
    await page.reload(); await booted(page);
    assert.deepEqual(await lockState(page), { locked: true, lockScreen: true, mark: null });
    await unlockWithPin(page);

    // Marca do relógio no futuro (relógio voltou): também não vale.
    await page.evaluate((key) => sessionStorage.setItem(key, String(Date.now() + 60000)), MARK_KEY);
    await page.reload(); await booted(page);
    assert.deepEqual(await lockState(page), { locked: true, lockScreen: true, mark: null });
    await unlockWithPin(page);

    // No prazo: abre desbloqueado, uma vez só.
    await page.evaluate(() => markUpdateReloadUnlocked());
    await page.reload(); await booted(page);
    assert.deepEqual(await lockState(page), { locked: false, lockScreen: false, mark: null });
    await page.reload(); await booted(page);
    assert.equal((await lockState(page)).locked, true, 'a marca é de uso único');
    await unlockWithPin(page);

    // No prazo, mas a página nova abre escondida: bloqueia como qualquer saída do app.
    await page.evaluate(() => { markUpdateReloadUnlocked(); sessionStorage.setItem('__abrir-oculto', '1'); });
    await page.reload(); await booted(page);
    await page.evaluate(() => { delete document.hidden; });
    assert.deepEqual(await lockState(page), { locked: true, lockScreen: true, mark: null });
    await unlockWithPin(page);

    // Outra janela não herda a marca (sessionStorage é desta janela), nem fechar e reabrir o app.
    await page.evaluate(() => markUpdateReloadUnlocked());
    assert.equal(typeof (await lockState(page)).mark, 'string');
    assert.deepEqual(erros, []);
    await page.close();
    ({ page, erros } = await newInstalledPage(context));
    await page.goto(url); await booted(page);
    assert.deepEqual(await lockState(page), { locked: true, lockScreen: true, mark: null });
    assert.deepEqual(erros, []);
  });
});

test('"Bloquear ao sair do app": tocar em Atualizar abre a versão nova sem pedir o PIN, e só essa recarga', { timeout: 90000 }, async () => {
  // A "versão anterior" é a própria árvore atual com outro número, como em update-animation-browser.
  let published = false;
  const server = http.createServer((req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.replace(/^\/funtime\//, '')) || 'index.html';
    if (file.includes('..')) { res.writeHead(403).end(); return; }
    let bytes; try { bytes = fs.readFileSync(path.join(process.cwd(), file)); } catch { /* 404 abaixo */ }
    if (!bytes) { res.writeHead(404).end(); return; }
    if (!published && ['sw.js', 'boot.js', 'app.js'].includes(file)) bytes = renumber(bytes);
    const type = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'text/plain';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await installedContext(browser);
    const { page, erros } = await newInstalledPage(context);
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await acceptTerms(page);
    await enablePin(page);
    await page.reload(); await booted(page, OLD_VERSION);
    assert.equal((await lockState(page)).locked, true, 'recarregar à toa continua pedindo o PIN');
    await unlockWithPin(page);

    published = true;
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    await page.locator('#apply-update').waitFor({ state: 'visible' });
    await page.locator('#apply-update').click();
    await booted(page, currentVersion);
    assert.deepEqual(await lockState(page), { locked: false, lockScreen: false, mark: null });

    await page.reload(); await booted(page, currentVersion);
    assert.equal((await lockState(page)).locked, true, 'a recarga seguinte volta a pedir o PIN');
    assert.deepEqual(erros, []);
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
