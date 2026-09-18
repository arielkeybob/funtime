// Navegador real. Garante que a interface de compartilhamento existe, está ligada, e
// que sem conta conectada ela não aparece nem faz nada — a invariante "sem login,
// nada muda" da spec 0023.
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
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Cross-Origin-Opener-Policy/.test(message.text())) erros.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('terms-pending'));

    await run(page, erros);
  } finally {
    await browser.close();
    server.close();
  }
}

test('sem conta conectada, o compartilhamento não aparece', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => openSettingsView());

    assert.equal(await page.locator('#settings-sharing-card').isVisible(), false,
      'o cartão só existe para quem conectou uma conta');
    assert.equal(await page.locator('#pairing-dialog').evaluate((node) => node.open), false);
    assert.equal(await page.locator('#home-shared').isVisible(), false,
      'sem ninguém compartilhando, o botão de "ver compartilhado" não aparece');
    assert.equal(await page.locator('#shared-view').isVisible(), false);
    assert.deepEqual(erros, [], 'a interface nova não pode gerar erro no console');
  });
});

// A tela do convidado é acessível mesmo sem login (não tem dado nenhum pra mostrar
// ainda, mas a navegação em si não pode quebrar) — cobre setCurrentView("shared").
// As duas listas (pareados / compartilhando com você) são compactas: sem entradas,
// mostram só os estados vazios — o histórico de verdade só existe dentro do
// diálogo de detalhe, aberto ao tocar em alguém que esteja compartilhando.
test('a tela de "compartilhado com você" abre e fecha sem erro', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => openSharedView());
    assert.equal(await page.locator('#shared-view').isVisible(), true);
    assert.equal(await page.locator('#shared-pairings-empty').isVisible(), true,
      'sem pareamento, mostra o estado vazio da lista de conectados');
    assert.equal(await page.locator('#shared-empty-state').isVisible(), true,
      'sem ninguém compartilhando, mostra o estado vazio');
    assert.equal(await page.locator('#shared-detail-dialog').evaluate((node) => node.open), false,
      'o detalhe (onde fica o aviso de segurança) só abre ao tocar em alguém');
    assert.match(
      await page.locator('#shared-detail-dialog .shared-view-disclaimer').textContent(),
      /não indicam se essa pessoa está segura/,
      'o aviso de segurança precisa existir no diálogo, mesmo fechado'
    );

    await page.locator('#close-shared').click();
    assert.equal(await page.locator('#shared-view').isVisible(), false);
    assert.equal(await page.evaluate(() => state.currentView), 'home');
    assert.deepEqual(erros, []);
  });
});

// Um código de pareamento nunca pode sair sem conta: a interface é montada no boot,
// antes de existir escritor, e não pode chamar nada nesse estado.
test('a interface montada sem conta não conversa com a nuvem', { timeout: 30000 }, async () => {
  await withPage(async (page) => {
    const pedidos = [];
    page.on('request', (request) => {
      if (/gstatic\.com|firebaseapp\.com|googleapis\.com|firebaseio\.com/.test(request.url())) pedidos.push(request.url());
    });

    await page.evaluate(() => openSettingsView());
    await page.waitForTimeout(500);

    assert.deepEqual(pedidos, [], 'nada de rede sem conta conectada');
  });
});

test('o diálogo de pareamento abre e fecha pelos próprios controles', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    // O cartão fica escondido sem conta, então o teste aciona o fluxo direto — o que
    // interessa aqui é o diálogo estar ligado aos botões.
    await page.evaluate(() => document.querySelector('#sharing-connect').click());
    assert.equal(await page.locator('#pairing-dialog').evaluate((node) => node.open), true);

    assert.equal(await page.locator('#pairing-code-display').textContent(), '— — —',
      'não mostra código antes de gerar');

    await page.locator('#pairing-done').click();
    assert.equal(await page.locator('#pairing-dialog').evaluate((node) => node.open), false);
    assert.deepEqual(erros, []);
  });
});
