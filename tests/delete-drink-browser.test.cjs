// Excluir bebida (v2.32.2): com registros, a pergunta é o que fazer com eles — manter vem marcado
// e apagar é uma escolha explícita —, e o rodapé confirma. Navegador real, origem efêmera.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

test('excluir bebida: manter o histórico vem marcado, apagar é escolha explícita e cada uma faz o que diz', { timeout: 60000 }, async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    // demo: Cerveja com 2 registros, Caipirinha e Água com 1 cada.
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demo' });
    try {
      const escolha = () => page.evaluate(() => document.querySelector('input[name="delete-drink-history"]:checked').value);
      const registros = (id) => page.evaluate((id) => state.events.filter((event) => event.drinkId === id).length, id);

      await page.evaluate(() => { openEditDrinkDialog('cerveja'); openDeleteDrinkDialog('cerveja', { returnToEditorOnCancel: true }); });
      assert.equal(await page.locator('#delete-drink-question').textContent(), 'O que fazer com os 2 registros dela?');
      assert.equal(await page.locator('#delete-drink-summary').isVisible(), false);
      assert.equal(await escolha(), 'keep');
      assert.equal(await page.locator('#delete-drink-keep-note').textContent(), 'Continuam lá, com o nome e o ícone dela.');
      assert.equal(await page.locator('#confirm-delete-drink').textContent(), 'Excluir bebida');

      // Marcar "Apagar" e cancelar não deixa a escolha para a próxima vez.
      await page.locator('#delete-drink-option-erase').click();
      assert.equal(await escolha(), 'erase');
      await page.locator('#cancel-delete-drink').click();
      assert.equal(await page.locator('#drink-dialog').evaluate((node) => node.open), true, 'cancelar volta ao editor');
      await page.locator('#delete-drink-from-editor').click();
      assert.equal(await escolha(), 'keep');

      // Manter: a bebida sai da lista e os registros ficam com o nome e o ícone dela.
      await page.locator('#confirm-delete-drink').click();
      assert.equal(await page.evaluate(() => state.drinks.some((drink) => drink.id === 'cerveja')), false);
      assert.equal(await registros('cerveja'), 2);
      assert.deepEqual(await page.evaluate(() => [...new Set(state.events.filter((event) => event.drinkId === 'cerveja').map((event) => event.drinkName + event.drinkIcon))]), ['Cerveja🍺']);
      assert.equal(await page.locator('dialog[open]').count(), 0);

      // Apagar: um registro só, textos no singular; bebida e registro saem.
      await page.evaluate(() => { hideToast(); openDeleteDrinkDialog('caipirinha'); });
      assert.equal(await page.locator('#delete-drink-question').textContent(), 'O que fazer com o registro dela?');
      assert.equal(await page.locator('#delete-drink-erase-note').textContent(), 'Some com a bebida. Não dá para desfazer.');
      await page.locator('#delete-drink-option-erase').click();
      await page.locator('#confirm-delete-drink').click();
      assert.equal(await page.evaluate(() => state.drinks.some((drink) => drink.id === 'caipirinha')), false);
      assert.equal(await registros('caipirinha'), 0);
      assert.equal(await registros('agua'), 1, 'as outras bebidas não perdem nada');
      assert.deepEqual(erros, []);
    } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
});
