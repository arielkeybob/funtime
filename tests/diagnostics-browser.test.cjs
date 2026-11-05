// Modo tester avançado (docs/specs/0035), no app real: desligado por padrão, liga em Sobre o app,
// sobrevive a reabrir, exporta sem dados pessoais e desligar apaga o registro.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

const CHAVE = 'funtime-diagnostics-v1';
const registro = (page) => page.evaluate((chave) => JSON.parse(localStorage.getItem(chave)), CHAVE);
const abrirSobre = (page) => page.evaluate(() => { openSettingsView(); showSettingsPage('about'); });

test('modo tester: desligado por padrão, liga, sobrevive a reabrir, exporta sem dados pessoais e desligar apaga', { timeout: 120000 }, async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demo' });
    try {
      await abrirSobre(page);
      const cartao = page.locator('#diagnostics-enabled');
      assert.equal(await cartao.isChecked(), false, 'desligado por padrão');
      assert.equal(await page.locator('#diagnostics-actions').isHidden(), true);
      assert.equal(await registro(page), null, 'desligado não grava nada');

      await page.locator('label[for=diagnostics-enabled]').click();
      await page.waitForFunction(() => /Registrando desde/.test(document.querySelector('#diagnostics-status').textContent));
      assert.equal(await cartao.isChecked(), true);
      await page.waitForFunction((chave) => JSON.parse(localStorage.getItem(chave))?.entries?.some((e) => e.type === 'app.ambiente'), CHAVE);

      // Reabrir: o registro continua e ganha a nova abertura.
      await page.reload();
      await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
      await page.waitForFunction((chave) => JSON.parse(localStorage.getItem(chave))?.entries?.filter((e) => e.type === 'app.abriu').length >= 1, CHAVE);
      assert.equal((await registro(page)).enabled, true);
      await abrirSobre(page);
      assert.equal(await page.locator('#diagnostics-enabled').isChecked(), true);

      // Exportar baixa um arquivo sem nomes de bebidas (o semeado tem Cerveja e Caipirinha).
      await page.evaluate(() => { navigator.canShare = () => false; });
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-diagnostics').click()]);
      const relatorio = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.equal(relatorio.type, 'funtime-diagnostics');
      assert.ok(relatorio.events.some((e) => e.type === 'app.ambiente' && e.bebidas === 3), 'conta as bebidas sem nomeá-las');
      assert.doesNotMatch(JSON.stringify(relatorio), /Cerveja|Caipirinha|Água/);

      // Desligar pede confirmação e apaga.
      await page.locator('label[for=diagnostics-enabled]').click();
      await page.waitForSelector('#app-confirm-dialog[open]');
      assert.equal(await page.locator('#app-confirm-title').textContent(), 'Desligar o modo tester?');
      await page.locator('#app-confirm-accept').click();
      await page.waitForFunction(() => !document.querySelector('#diagnostics-enabled').checked);
      assert.equal(await registro(page), null);
      assert.equal(await page.locator('#diagnostics-status').isHidden(), true);
      assert.deepEqual(erros, []);
    } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
});
