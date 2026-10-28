// Menu ⋮ da bebida (spec 0029, pacote D): janela compacta com linhas, tempo que falta na linha de
// cancelar a contagem, intervalo na de editar, e o menu fecha depois de salvar a edição.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

test('menu ⋮: linhas com tempo e intervalo, janela compacta, e fecha depois de editar', { timeout: 90000 }, async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demo' });
    try {
      await page.evaluate(() => openDrinkMenuDialog('agua'));
      assert.equal(await page.locator('#drink-menu-name').textContent(), '💧 Água');
      assert.equal(await page.locator('#drink-menu-stop').isVisible(), true, 'Água está em contagem');
      assert.match(await page.locator('#drink-menu-remaining').textContent(), /^\d{2}:\d{2}:\d{2}$/);
      assert.equal(await page.locator('#drink-menu-interval').textContent(), '30 min ›');
      const caixa = await page.locator('#drink-menu-dialog').boundingBox();
      assert.ok(caixa.height < page.viewportSize().height / 2, 'janela compacta, não tela cheia');

      await page.locator('#close-drink-menu-dialog').click();
      await page.evaluate(() => openDrinkMenuDialog('cerveja'));
      assert.equal(await page.locator('#drink-menu-stop').isVisible(), false, 'sem contagem, sem a linha de cancelar');
      await page.locator('#drink-menu-edit').click();
      await page.locator('#drink-name').fill('Cerveja gelada');
      await page.locator('#drink-submit-button').click();
      await page.waitForFunction(() => !document.querySelector('#drink-dialog').open);
      assert.equal(await page.locator('#drink-menu-dialog').evaluate((no) => no.open), false, 'o menu não fica aberto com o nome antigo');
      assert.deepEqual(erros, []);
    } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
});
