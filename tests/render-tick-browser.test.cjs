const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

async function environment() {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
  for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
  await page.locator('#terms-continue').click();
  await page.waitForFunction(() => !document.body.classList.contains('boot-pending'));
  return { browser, server };
}

test('tick não recria o nó do card quando nada estrutural muda', async () => {
  const { browser, server } = await environment();
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.evaluate(() => {
      state.drinks = [{ id: 'd1', name: 'Água', icon: '💧', intervalMinutes: 10, askDoseSize: false }];
      state.events = [{ id: 'e1', drinkId: 'd1', drinkName: 'Água', drinkIcon: '💧', consumedAt: Date.now() - 60000, intervalMinutes: 10 }];
      render();
    });
    await page.evaluate(() => { document.querySelector('.drink-card').dataset.testMarker = 'original'; });
    const before = await page.evaluate(() => document.querySelector('.drink-time').textContent);

    // Simula 3 ticks do relógio avançando o consumo em 5s a cada vez (sem esperar
    // tempo real e sem sair do estado "waiting", para manter a assinatura igual).
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { state.events[0].consumedAt -= 5000; tickDrinkCards(); });
    }

    const after = await page.evaluate(() => ({
      marker: document.querySelector('.drink-card')?.dataset.testMarker,
      time: document.querySelector('.drink-time').textContent,
    }));
    assert.equal(after.marker, 'original', 'nó do card foi recriado num tick sem mudança estrutural');
    assert.notEqual(after.time, before, 'texto do contador não avançou (esperado: o tempo real passou entre as chamadas)');
  } finally {
    await browser.close();
    server.close();
  }
});

test('tick detecta transição waiting → completed e faz o render completo', async () => {
  const { browser, server } = await environment();
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.evaluate(() => {
      state.drinks = [{ id: 'd1', name: 'Água', icon: '💧', intervalMinutes: 10, askDoseSize: false }];
      state.events = [{ id: 'e1', drinkId: 'd1', drinkName: 'Água', drinkIcon: '💧', consumedAt: Date.now() - 60000, intervalMinutes: 10 }];
      render();
    });
    const beforeState = await page.evaluate(() => document.querySelector('.drink-card').classList.contains('waiting'));
    assert.equal(beforeState, true, 'pré-condição: card deveria começar em waiting');
    await page.evaluate(() => { document.querySelector('.drink-card').dataset.testMarker = 'original'; });

    // Avança o intervalo artificialmente para além do fim (sem esperar tempo real).
    await page.evaluate(() => {
      state.events[0].consumedAt = Date.now() - 11 * 60000; // 11 min atrás, intervalo de 10 min já passou
      tickDrinkCards();
    });

    const after = await page.evaluate(() => ({
      marker: document.querySelector('.drink-card')?.dataset.testMarker,
      isCompleted: document.querySelector('.drink-card').classList.contains('completed') || document.querySelector('.drink-card').classList.contains('neutral'),
      time: document.querySelector('.drink-time').textContent,
    }));
    assert.equal(after.marker, undefined, 'nó deveria ter sido recriado pelo render completo após a transição de estado');
    assert.equal(after.isCompleted, true, 'card deveria refletir o estado concluído imediatamente');
    assert.match(after.time, /Anotar/, 'texto deveria convidar a anotar nova dose');
  } finally {
    await browser.close();
    server.close();
  }
});

test('tick detecta a saída do grupo "recentes" após 24h e reagrupa os cards', async () => {
  const { browser, server } = await environment();
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.evaluate(() => {
      // d2 vem antes de d1 no array — sem nenhuma bebida "recente", a ordem de
      // exibição segue essa ordem original (grupo "manual" não é reordenado).
      state.drinks = [
        { id: 'd2', name: 'Suco', icon: '🧃', intervalMinutes: 10, askDoseSize: false },
        { id: 'd1', name: 'Água', icon: '💧', intervalMinutes: 10, askDoseSize: false },
      ];
      // d1 consumida há 23h (ainda dentro da janela de 24h de "recentes", por isso
      // aparece antes de d2 apesar de vir depois no array); d2 nunca consumida.
      state.events = [{ id: 'e1', drinkId: 'd1', drinkName: 'Água', drinkIcon: '💧', consumedAt: Date.now() - 23 * 3600000, intervalMinutes: 10 }];
      render();
    });
    const beforeOrder = await page.evaluate(() => [...document.querySelectorAll('.drink-card')].map(card => card.dataset.drinkId));
    assert.deepEqual(beforeOrder, ['d1', 'd2'], 'd1 (recente) deveria vir antes de d2 (manual), mesmo vindo depois no array');
    await page.evaluate(() => { document.querySelector('[data-drink-id="d1"]').dataset.testMarker = 'original'; });

    // Avança para 25h atrás (fora da janela de 24h) sem esperar tempo real.
    await page.evaluate(() => {
      state.events[0].consumedAt = Date.now() - 25 * 3600000;
      tickDrinkCards();
    });

    const after = await page.evaluate(() => ({
      marker: document.querySelector('[data-drink-id="d1"]')?.dataset.testMarker,
      order: [...document.querySelectorAll('.drink-card')].map(card => card.dataset.drinkId),
    }));
    assert.equal(after.marker, undefined, 'nó deveria ter sido recriado pelo render completo após o reagrupamento');
    assert.deepEqual(after.order, ['d2', 'd1'], 'd1 deveria migrar para o grupo manual e voltar à ordem original do array (d2 primeiro), sem nenhuma bebida "recente"');
  } finally {
    await browser.close();
    server.close();
  }
});
