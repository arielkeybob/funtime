// Browser real, origem e perfil efêmeros. Cobre a paginação incremental do
// histórico (débito técnico do ROADMAP.md: "Histórico sem paginação/
// virtualização") - mesmo padrão já usado na agenda de eventos
// (occasions-ui.js: agendaLimit/"Mostrar mais").
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

test('histórico pagina em blocos de 20 com "Mostrar mais"', { timeout: 60000 }, async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));

    await page.evaluate(() => {
      state.drinks = [{ id: 'd1', name: 'Água', icon: '💧', intervalMinutes: 60, askDoseSize: false }];
      state.events = Array.from({ length: 25 }, (_, i) => ({
        id: 'e' + i, drinkId: 'd1', drinkName: 'Água', drinkIcon: '💧',
        consumedAt: Date.now() - i * 3600000, intervalMinutes: 60, doseSize: null,
      }));
      saveData();
      openHistoryView();
    });

    assert.equal(await page.locator('.history-event').count(), 20, 'só a primeira página vira DOM');
    assert.equal(await page.locator('#history-count').textContent(), '25 registros', 'a contagem mostra o total, não só o visível');
    assert.equal(await page.locator('#history-show-more').isVisible(), true);

    await page.locator('#history-show-more').click();
    assert.equal(await page.locator('.history-event').count(), 25, 'clicar mostra o restante');
    assert.equal(await page.locator('#history-show-more').isVisible(), false, 'some quando não há mais nada a mostrar');

    // Editar um registro (refreshDataViews -> renderHistory) preserva a página
    // expandida, em vez de recolher de volta para 20.
    await page.locator('.history-event').first().click();
    await page.locator('#close-event-dialog').click();
    assert.equal(await page.locator('.history-event').count(), 25, 'refresh por outra ação não recolhe a página expandida');

    // Reabrir a tela do zero volta para o limite inicial.
    await page.evaluate(() => { closeHistoryView(); openHistoryView(); });
    assert.equal(await page.locator('.history-event').count(), 20, 'reabrir o histórico volta ao limite inicial');
  } finally {
    await browser.close();
    server.close();
  }
});
