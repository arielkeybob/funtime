// A conta lembrada que cai sozinha (o Firebase não renovou a sessão ao abrir) não pode
// sumir em silêncio como se a pessoa tivesse saído: antes, só se notava pelo ícone de
// Amigos ausente, e o app nem tentava mais voltar. O SDK do Firebase é trocado por um
// falso servido no lugar do CDN, para o caminho real do app rodar sem rede nem login.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

const FAKE_APP = 'export const initializeApp = () => ({});';
const FAKE_AUTH = `
export const getAuth = () => ({});
export function onAuthStateChanged(auth, callback) {
  globalThis.__notifyAuth = callback;
  setTimeout(() => callback(globalThis.__fakeAuthUser || null), 0);
}
export const getRedirectResult = async () => null;
export class GoogleAuthProvider { setCustomParameters() {} }
export const signInWithPopup = async () => { globalThis.__popups = (globalThis.__popups || 0) + 1; };
export const signInWithRedirect = async () => {};
export const signOut = async () => { globalThis.__notifyAuth(null); };
`;

async function withPage({ memory, user = null, offline = false }, run) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(({ memory, user }) => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      if (memory && sessionStorage.getItem('teste-memoria') === null) {
        localStorage.setItem('funtime-sync-v1', JSON.stringify(memory));
        sessionStorage.setItem('teste-memoria', '1');
      }
      globalThis.__fakeAuthUser = user;
    }, { memory, user });
    const rede = { offline };
    await context.route('https://www.gstatic.com/firebasejs/**', (route) => {
      const url = route.request().url();
      if (rede.offline || url.includes('firestore')) return route.abort();
      route.fulfill({ contentType: 'text/javascript', body: url.endsWith('firebase-app.js') ? FAKE_APP : FAKE_AUTH });
    });
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', (error) => erros.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    await run(page, { rede, erros });
  } finally {
    await browser.close();
    server.close();
  }
}

const memoria = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('funtime-sync-v1')));
const resumoConta = async (page) => {
  await page.locator('#open-settings').click();
  const row = page.locator('[data-settings-open=backup]');
  const resultado = {
    texto: await page.locator('#settings-summary-backup').textContent(),
    classes: await row.getAttribute('class'),
  };
  await page.locator('#close-settings').click();
  return resultado;
};

test('a conta que cai sozinha avisa na Home, continua lembrada e o menu fica laranja', { timeout: 40000 }, async () => {
  await withPage({ memory: { connected: true, account: 'eu@exemplo.com', fullHistoryFor: 'u1' } }, async (page, { erros }) => {
    const aviso = page.locator('#sync-lost-notice');
    await aviso.waitFor({ state: 'visible' });
    assert.match(await page.locator('#sync-lost-text').textContent(), /^Conta eu@exemplo\.com desconectada/);
    assert.equal(await page.locator('#home-friends-button').isVisible(), false);

    const lembrada = await memoria(page);
    assert.equal(lembrada.connected, true, 'continua tentando voltar na próxima abertura');
    assert.equal(lembrada.lost, true);
    assert.equal(lembrada.fullHistoryFor, 'u1', 'não força baixar tudo de novo ao reconectar');

    const resumo = await resumoConta(page);
    assert.equal(resumo.texto, 'Conta desconectada');
    assert.match(resumo.classes, /settings-nav-row--warning/);
    assert.match(resumo.classes, /is-disconnected/);

    await page.locator('#sync-lost-later').click();
    assert.equal(await aviso.isVisible(), false);
    assert.ok((await memoria(page)).snoozedUntil > Date.now(), '"Mais tarde" adia em vez de calar');

    // Passado o adiamento, volta a perguntar quando o app volta à frente.
    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('funtime-sync-v1'));
      localStorage.setItem('funtime-sync-v1', JSON.stringify({ ...m, snoozedUntil: Date.now() - 1 }));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await aviso.isVisible(), true);

    await page.locator('#sync-lost-connect').click();
    await page.waitForFunction(() => globalThis.__popups === 1);

    await page.locator('#sync-lost-never').click();
    assert.equal(await aviso.isVisible(), false);
    assert.equal((await memoria(page)).dontAsk, true);
    assert.equal((await resumoConta(page)).texto, 'Conta desconectada', 'o menu continua mostrando a queda');
    assert.deepEqual(erros, []);
  });
});

test('aberto sem internet, mostra o motivo e reconecta sozinho quando a rede volta', { timeout: 40000 }, async () => {
  await withPage({ memory: { connected: true, account: 'eu@exemplo.com' }, offline: true }, async (page, { rede, erros }) => {
    await page.waitForFunction(() => document.querySelector('#settings-summary-backup')?.textContent === 'Sem internet para conectar a conta');
    assert.equal(await page.locator('#sync-lost-notice').isVisible(), false, 'sem rede não é queda da conta');
    assert.equal((await memoria(page)).lost, undefined);

    rede.offline = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    // O Firebase falso responde "sem sessão": agora sim é queda, e o aviso aparece.
    await page.locator('#sync-lost-notice').waitFor({ state: 'visible' });
    assert.deepEqual(erros, []);
  });
});

test('quem nunca conectou vê a nuvem cortada em laranja, sem aviso na Home', { timeout: 40000 }, async () => {
  await withPage({}, async (page, { erros }) => {
    const resumo = await resumoConta(page);
    assert.equal(resumo.texto, 'Sem conta conectada');
    assert.match(resumo.classes, /settings-nav-row--warning/);
    assert.equal(await page.locator('#sync-lost-notice').isVisible(), false);
    assert.equal(await memoria(page), null);
    assert.deepEqual(erros, []);
  });
});

test('sair pelo botão esquece a conta e não vira aviso de queda', { timeout: 40000 }, async () => {
  await withPage({ memory: { connected: true, account: 'eu@exemplo.com' }, user: { uid: 'u1', email: 'eu@exemplo.com' } }, async (page) => {
    await page.locator('#home-friends-button').waitFor({ state: 'visible' });
    assert.equal((await resumoConta(page)).texto, 'Conta: eu@exemplo.com');

    await page.locator('#open-settings').click();
    await page.locator('[data-settings-open=backup]').click();
    await page.locator('#sync-sign-out').click();
    await page.waitForFunction(() => localStorage.getItem('funtime-sync-v1') === null);
    await page.locator('#close-settings').click();
    await page.locator('#close-settings').click();
    assert.equal(await page.locator('#sync-lost-notice').isVisible(), false);
    assert.equal(await page.locator('#home-friends-button').isVisible(), false);
  });
});
