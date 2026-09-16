// Navegador real, origem e perfil efêmeros. Cobre o caminho de recuperação
// quando funtime-v1-data está corrompido: boot.js nunca chega a rodar app.js
// por completo, então a UI de recuperação mora no próprio boot.js (débito
// técnico do ROADMAP.md, achado original em docs/history/AUDIT.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

async function withPage(run) {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    await run(page, `http://127.0.0.1:${server.address().port}/funtime/`, context);
  } finally {
    await browser.close();
    server.close();
  }
}

test('dado corrompido mostra recuperação com download; leitura válida não mostra nada', { timeout: 30000 }, async () => {
  await withPage(async (page, origin) => {
    await page.addInitScript(() => localStorage.setItem('funtime-v1-data', '{corrompido'));
    await page.goto(origin);
    await page.locator('#startup-download').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#startup-message').textContent(), 'Não foi possível ler seus dados. Eles não foram apagados, mas o app não conseguiu abri-los.');
    assert.equal(await page.locator('#startup-retry').isVisible(), true);
    // O app nunca chega a carregar; o corpo continua marcado como boot pendente.
    assert.equal(await page.evaluate(() => document.body.classList.contains('boot-pending')), true);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#startup-download').click();
    const savedPath = await (await downloadPromise).path();
    assert.equal(fs.readFileSync(savedPath, 'utf8'), '{corrompido');

    // O dado bruto continua no localStorage: baixar não apaga nem tenta corrigir.
    assert.equal(await page.evaluate(() => localStorage.getItem('funtime-v1-data')), '{corrompido');
  });
});

test('dado válido nunca mostra o botão de recuperação', { timeout: 30000 }, async () => {
  await withPage(async (page, origin) => {
    await page.goto(origin);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    assert.equal(await page.locator('#startup-download').isVisible(), false);
  });
});
