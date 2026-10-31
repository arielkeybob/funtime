// Navegador real. Importar bebidas de um arquivo: a prévia mostra cada bebida como uma
// etiqueta de marcar (todas marcadas ao abrir), e só as marcadas entram — ao adicionar e
// ao substituir. O histórico nunca muda.
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

const ARQUIVO = JSON.stringify({
  type: 'funtime-drinks', formatVersion: 1, appVersion: '2.31', exportedAt: '2026-10-30T20:00:00.000Z',
  drinks: [
    { id: 'vinho', name: 'Vinho', icon: '🍷', intervalMinutes: 90, askDoseSize: false },
    { id: 'suco', name: 'Suco', icon: '🧃', intervalMinutes: 20, askDoseSize: false },
    { id: 'agua', name: 'Água', icon: '💧', intervalMinutes: 30, askDoseSize: false },
    { id: 'cerveja', name: 'Cerveja', icon: '🍺', intervalMinutes: 60, askDoseSize: false },
  ],
});

test('importar bebidas: só as marcadas entram, ao adicionar e ao substituir', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      state.drinks = [{ id: 'cerveja', name: 'Cerveja', icon: '🍺', intervalMinutes: 60, askDoseSize: false }];
      state.events = [{ id: 'e1', drinkId: 'cerveja', drinkName: 'Cerveja', drinkIcon: '🍺', intervalMinutes: 60, doseSize: null, consumedAt: Date.now() - 3600000, occasionId: null }];
      saveData();
      render();
      openSettingsView();
    });
    const dados = () => page.evaluate(() => JSON.parse(localStorage.getItem(DATA_STORAGE_KEY)));
    const antes = await dados();
    const abrir = (conteudo) => page.evaluate((texto) => prepareDrinkImportFile(new File([texto], 'bebidas.txt', { type: 'text/plain' })), conteudo);
    const etiqueta = (nome) => page.locator('#drink-import-drinks .drink-pick', { hasText: nome });
    const importar = page.locator('#confirm-drink-import');
    const marcarTodas = page.locator('#drink-import-pick-all');

    await abrir(ARQUIVO);
    await page.locator('#drink-import-dialog[open]').waitFor();
    assert.equal(await page.locator('#drink-import-file-summary').textContent(), '4 bebidas no arquivo · 1 duplicata exata');
    assert.equal(await page.locator('#drink-import-drinks .drink-pick[aria-pressed="true"]').count(), 3, 'todas as livres marcadas');
    assert.equal(await etiqueta('Cerveja').isDisabled(), true, 'a que você já tem fica de fora ao adicionar');
    assert.equal(await importar.textContent(), 'Adicionar 3 bebidas');
    assert.equal(await marcarTodas.textContent(), 'Desmarcar todas');

    await marcarTodas.click();
    assert.equal(await page.locator('#drink-import-drinks .drink-pick[aria-pressed="true"]').count(), 0);
    assert.equal(await importar.textContent(), 'Marque ao menos uma bebida');
    assert.equal(await importar.isDisabled(), true);
    assert.equal(await marcarTodas.textContent(), 'Marcar todas');
    await etiqueta('Suco').click();
    assert.equal(await importar.textContent(), 'Adicionar 1 bebida');
    assert.deepEqual(await dados(), antes, 'marcar e desmarcar não grava nada');

    await importar.click();
    let depois = await dados();
    assert.deepEqual(depois.drinks.map((drink) => drink.name), ['Cerveja', 'Suco']);
    assert.deepEqual(depois.events, antes.events, 'o histórico fica intacto');

    // Substituir: a lista nova é só a das marcadas, e a cada prévia todas voltam marcadas.
    await abrir(ARQUIVO);
    await page.locator('#drink-import-dialog[open]').waitFor();
    assert.equal(await importar.textContent(), 'Adicionar 2 bebidas', 'abrir de novo marca todas outra vez');
    await page.locator('input[name="drink-import-mode"][value="replace"]').check();
    assert.equal(await importar.textContent(), 'Substituir por 4 bebidas');
    await etiqueta('Vinho').click();
    await etiqueta('Cerveja').click();
    assert.equal(await importar.textContent(), 'Substituir por 2 bebidas');
    await importar.click();
    depois = await dados();
    assert.deepEqual(depois.drinks.map((drink) => drink.name), ['Suco', 'Água']);
    assert.deepEqual(depois.events, antes.events, 'substituir também preserva o histórico');

    assert.deepEqual(erros, []);
  });
});
