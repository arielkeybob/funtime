// Configurações é um menu de categorias; cada uma abre a própria tela e o Voltar retorna
// ao menu antes de sair. Os controles antigos (mesmos ids) continuam funcionando.
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

const visiblePages = (page) => page.evaluate(() => [...document.querySelectorAll('[data-settings-page]')].filter((n) => !n.hidden).map((n) => n.dataset.settingsPage));

test('o menu lista as categorias com resumo; tocar abre a tela e ← volta ao menu e depois à Home', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.locator('#open-settings').click();
    assert.equal(await page.locator('#settings-menu').isVisible(), true);
    assert.deepEqual(await page.locator('#settings-menu .settings-nav-row strong').allTextContents(),
      ['Aparência', 'Privacidade', 'Backup e conta', 'Como usar', 'Sobre o app', 'Redefinir e apagar dados']);
    assert.match(await page.locator('#settings-summary-appearance').textContent(), /Contagem regressiva · Eventos desligados/);
    assert.equal(await page.locator('#settings-summary-privacy').textContent(), 'Bloqueio desativado');
    assert.match(await page.locator('#settings-summary-tutorials').textContent(), /^\d+ tutoriais?$/);
    assert.equal(await page.locator('#settings-summary-backup').textContent(), 'Sem conta conectada');
    assert.match(await page.locator('#settings-summary-about').textContent(), /^Versão \d+\.\d+\.\d+$/);
    assert.deepEqual(await visiblePages(page), []);

    await page.locator('[data-settings-open=privacy]').click();
    assert.deepEqual(await visiblePages(page), ['privacy']);
    assert.equal(await page.locator('#settings-menu').isVisible(), false);
    assert.equal(await page.locator('#settings-header-title').textContent(), 'Privacidade');
    assert.equal(await page.locator('#security-enabled').count(), 1);

    await page.locator('#close-settings').click();
    assert.equal(await page.locator('#settings-menu').isVisible(), true);
    assert.equal(await page.locator('#settings-header-title').textContent(), 'Configurações');
    await page.locator('#close-settings').click();
    assert.equal(await page.evaluate(() => state.currentView), 'home');
    assert.deepEqual(erros, []);
  });
});

test('o botão voltar do app desce da tela interna ao menu e depois à Home', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.locator('#open-settings').click();
    await page.locator('[data-settings-open=backup]').click();
    await page.waitForFunction(() => history.state?.funtimeNavigation?.depth === 2);
    await page.goBack();
    await page.waitForFunction(() => state.currentView === 'settings' && state.settingsPage === null);
    await page.goBack();
    await page.waitForFunction(() => state.currentView === 'home');
    assert.deepEqual(erros, []);
  });
});

test('os controles reposicionados continuam funcionando e o resumo acompanha', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.locator('#open-settings').click();
    await page.locator('[data-settings-open=appearance]').click();
    assert.equal(await page.locator('#events-enabled').isChecked(), false);
    await page.locator('label[for=events-enabled]').click();
    assert.equal(await page.locator('#events-enabled').isChecked(), true);
    await page.locator('#close-settings').click();
    assert.match(await page.locator('#settings-summary-appearance').textContent(), /Eventos ativos/);

    await page.locator('[data-settings-open=reset]').click();
    assert.deepEqual(await visiblePages(page), ['reset']);
    assert.equal(await page.locator('[data-reset]').count(), 4);
    assert.deepEqual(erros, []);
  });
});

test('"Ativar em Configurações" (tela do amigo) cai em Aparência, na linha de eventos', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => { openEventsSetting(); });
    assert.equal(await page.evaluate(() => state.currentView), 'settings');
    assert.deepEqual(await visiblePages(page), ['appearance']);
    assert.equal(await page.locator('.settings-toggle-row.is-highlighted').count(), 1);
    assert.deepEqual(erros, []);
  });
});
