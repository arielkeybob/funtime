// "Ativar em Configurações", aberto a partir de um amigo (spec 0029, pacote N): o ← volta para Amigos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

test('Ativar em Configurações, vindo de Amigos: o ← volta para Amigos, não para o menu', { timeout: 90000 }, async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demoAmigos' });
    try {
      await page.evaluate(() => { const next = FunTimeOccasions.configure(buildCurrentAppData(), false); commitOccasions(next.occasions, next.events, next.preferences); openSharedView(); });
      await page.locator('#friends-grid button').first().click();
      await page.locator('#shared-detail-tab-compartilhando').click();
      await page.locator('#shared-detail-body button', { hasText: 'Ativar em Configurações' }).click();
      assert.equal(await page.evaluate(() => state.settingsPage), 'appearance');
      await page.locator('#close-settings').click();
      assert.equal(await page.evaluate(() => state.currentView), 'shared');
      assert.deepEqual(erros, []);
    } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
});
