// Confirmações (spec 0029, pacote A): nenhuma caixa nativa do navegador; o que apaga confirma em
// vermelho e o que não apaga nada (reabrir, o evento acabou, ativar) confirma com o botão branco.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

async function comApp(seed, executar) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed });
    page.on('dialog', async (dialogo) => { erros.push('Caixa nativa: ' + dialogo.message()); await dialogo.dismiss(); });
    try { await executar(page, erros); } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
}
const confirmacao = async (page) => {
  await page.waitForSelector('#app-confirm-dialog[open]');
  return page.evaluate(() => ({ titulo: document.querySelector('#app-confirm-title').textContent, botao: document.querySelector('#app-confirm-accept').textContent, classe: document.querySelector('#app-confirm-accept').className }));
};
const cancelar = async (page) => { await page.locator('#app-confirm-dialog button[value=cancel]').click(); await page.waitForFunction(() => !document.querySelector('#app-confirm-dialog').open); };

test('Desfazer amizade e Apagar dados na nuvem usam a confirmação do app, em vermelho', { timeout: 90000 }, async () => {
  await comApp('demoAmigos', async (page, erros) => {
    await page.evaluate(() => openSharedView());
    await page.locator('#friends-grid button').first().click();
    await page.locator('#shared-detail-info').click();
    await page.locator('#friend-info-dialog button', { hasText: 'Desfazer amizade' }).click();
    assert.deepEqual(await confirmacao(page), { titulo: 'Desfazer amizade', botao: 'Desfazer amizade', classe: 'danger-button' });
    await cancelar(page);
    assert.equal(await page.locator('#friend-info-dialog').evaluate((no) => no.open), true, 'cancelar não desfaz nada');

    await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); openSettingsView(); showSettingsPage('backup'); });
    await page.locator('#sync-delete-cloud').click();
    assert.deepEqual(await confirmacao(page), { titulo: 'Apagar dados na nuvem?', botao: 'Apagar da nuvem', classe: 'danger-button' });
    await cancelar(page);
    assert.deepEqual(erros, []);
  });
});

test('o que não apaga nada confirma com o botão branco; o que apaga continua vermelho', { timeout: 90000 }, async () => {
  await comApp('demoEventoAtivo', async (page, erros) => {
    await page.evaluate(() => openOccasionDetails('oc1'));
    await page.getByRole('button', { name: 'O evento acabou', exact: true }).click();
    assert.equal((await confirmacao(page)).classe, 'primary-button');
    await cancelar(page);
    await page.getByRole('button', { name: 'Excluir evento', exact: true }).click();
    assert.equal((await confirmacao(page)).classe, 'danger-button', 'o tom não "vaza" da confirmação anterior');
    await cancelar(page);
    assert.deepEqual(erros, []);
  });
});

test('Sair da conta com compartilhamento ativo pede confirmação; sem nenhum, sai direto', { timeout: 90000 }, async () => {
  await comApp('demoAmigos', async (page, erros) => {
    await page.evaluate(() => { openSettingsView(); showSettingsPage('backup'); });
    await page.evaluate(async () => { const item = state.occasions[0]; await startOccasionShares(item, state.events.filter((r) => r.occasionId === item.id), ['bia']); });
    await page.locator('#sync-sign-out').click();
    assert.deepEqual(await confirmacao(page), { titulo: 'Sair da conta?', botao: 'Sair', classe: 'danger-button' });
    await cancelar(page);
    assert.equal(await page.locator('#sync-sign-out').isVisible(), true, 'cancelar mantém a conta conectada');
    assert.deepEqual(erros, []);
  });
});
