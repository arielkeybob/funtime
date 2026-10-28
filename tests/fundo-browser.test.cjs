// Imagem de fundo (spec 0031) e cor de Amigos: o fundo aparece no Início, no Histórico e nas
// Configurações, some em Eventos e Amigos, fica fora do backup e sai com "Remover".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

test('imagem de fundo: aparece fora de Eventos e Amigos, fica fora do backup e pode ser removida', { timeout: 90000 }, async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demoAmigos' });
    try {
      const png = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 700;
        const g = c.getContext('2d'); g.fillStyle = '#ff7a59'; g.fillRect(0, 0, 400, 700);
        return c.toDataURL('image/png').split(',')[1];
      });
      const camada = () => page.evaluate(() => getComputedStyle(document.querySelector('#app-background')).display);
      const corDoFundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      await page.evaluate(() => { openSettingsView(); showSettingsPage('appearance'); });
      assert.equal(await page.locator('#app-background-remove').isHidden(), true);
      await page.setInputFiles('#app-background-file', { name: 'fundo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-app-background'));
      assert.equal(await page.locator('#app-background-status').textContent(), 'Imagem escolhida');
      assert.equal(await page.locator('#app-background-choose').textContent(), 'Trocar imagem');
      assert.match(await page.evaluate(() => localStorage.getItem('funtime-background-v1')), /data:image\/jpeg/);
      assert.equal(await camada(), 'block', 'Configurações mostra a imagem');
      assert.equal(await corDoFundo(), 'rgba(0, 0, 0, 0)');

      await page.locator('#nav-home').click();
      assert.equal(await camada(), 'block', 'Início mostra a imagem');
      await page.locator('#nav-occasion').click();
      assert.equal(await camada(), 'none', 'Eventos mantém o lilás');
      await page.evaluate(() => openSharedView());
      assert.equal(await camada(), 'none', 'Amigos mantém a própria cor');
      assert.equal(await corDoFundo(), 'rgb(22, 19, 11)', 'Amigos em ouro (#16130b)');
      assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#16130b');

      // Backup leva preferências, mas não a imagem: é do aparelho.
      assert.doesNotMatch(await page.evaluate(() => JSON.stringify(buildCurrentAppData())), /data:image/);

      await page.reload();
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-app-background'));
      await page.evaluate(() => { openSettingsView(); showSettingsPage('appearance'); });
      await page.locator('#app-background-remove').click();
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-app-background')), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('funtime-background-v1')), null);
      assert.equal(await camada(), 'none');
      assert.equal(await page.locator('#app-background-status').textContent(), 'Nenhuma imagem');
      assert.deepEqual(erros, []);
    } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
});
