const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
test('prévia local abre em aba comum e cards concluídos são neutros', { timeout: 60000 }, async () => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    assert.equal((await fetch(origin + '/funtime/.git/config')).status, 404);
    assert.equal((await fetch(origin + '/funtime/scripts/dev-server.cjs')).status, 404);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/funtime/');
    await page.getByRole('button', { name: 'Começar sem dados', exact: true }).click();
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    assert.equal(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), false);
    await page.evaluate(() => {
      state.drinks = ['antiga','recente','ativa','nova'].map((id, i) => ({ id, name: ['Semana passada','Intervalo terminado','Em contagem','Sem registros'][i], icon: '💧', intervalMinutes: 60, askDoseSize: false }));
      state.events = [['antiga', 7 * 86400000], ['recente', 3600001], ['ativa', 600000]].map(([id, elapsed]) => ({ id, drinkId: id, consumedAt: Date.now() - elapsed, intervalMinutes: 60, drinkName: id, drinkIcon: '💧', doseSize: null }));
      saveData(); render();
    });

    for (const id of ['antiga','recente']) {
      const card = page.locator(`[data-drink-id="${id}"]`);
      assert.ok((await card.getAttribute('class')).includes('neutral'));
      assert.equal(await card.locator('.drink-time').textContent(), 'Anotar dose');
      assert.equal(await card.locator('.drink-state').isVisible(), false);
      assert.match(await card.locator('.drink-status').textContent(), /^Último registro:/);
    }
    assert.match(await page.locator('[data-drink-id=antiga] .drink-status').textContent(), /\d{2}\/\d{2}\/\d{2}/);
    assert.ok((await page.locator('[data-drink-id=ativa]').getAttribute('class')).includes('waiting'));
    assert.equal(await page.locator('[data-drink-id=nova] .drink-time').textContent(), 'Anotar primeira dose');
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'funtime-neutral-preview.png') });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && state.drinks.length === 4);
    assert.equal(await page.locator('[data-drink-id=antiga] .drink-time').textContent(), 'Anotar dose');
    await page.evaluate(() => {
      state.events.push({ ...state.events[0], id: 'retroativa-nova', consumedAt: Date.now() - 7200000 });
      render();
    });
    assert.ok((await page.locator('[data-drink-id=antiga]').getAttribute('class')).includes('neutral'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
