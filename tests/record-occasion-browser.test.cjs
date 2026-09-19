// Evento de um registro: o horário decide (os eventos nunca se sobrepõem). Dose nova entra
// sozinha no evento que a contém (em andamento ou encerrado); na edição, a opção só aparece
// quando há evento cobrindo o horário e nunca oferece um evento impossível.
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
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    // Um evento já encerrado (5 a 4 dias atrás) e três registros: um dentro dele sem evento,
    // um dentro dele já vinculado, e um fora de qualquer evento.
    await page.evaluate(() => {
      const dia = 86400000, agora = Date.now();
      const inicio = agora - 5 * dia, fim = agora - 4 * dia;
      state.preferences.eventsEnabled = true;
      state.drinks = [{ id: 'd', name: 'Suco', icon: '💧', intervalMinutes: 1, askDoseSize: false }];
      state.occasions = [{ id: 'p', name: 'Passado', startedAt: inicio, endedAt: fim, scheduledEndAt: null, closedAt: fim, endReason: 'manual' }];
      const base = { drinkId: 'd', drinkName: 'Suco', drinkIcon: '💧', intervalMinutes: 1, doseSize: null };
      state.events = [
        { ...base, id: 'solto', consumedAt: inicio + 3600000, occasionId: null },
        { ...base, id: 'preso', consumedAt: inicio + 7200000, occasionId: 'p' },
        { ...base, id: 'fora', consumedAt: agora - 2 * dia, occasionId: null },
      ];
      window.__t = { dia, agora, inicio, fim };
      saveData();
    });
    await run(page, erros);
  } finally {
    await browser.close();
    server.close();
  }
}

const abrir = (page, id) => page.evaluate((x) => openEventDialog(x), id);
const campo = (page) => page.evaluate(() => {
  const select = document.querySelector('#record-occasion');
  return { visivel: !select.parentElement.hidden, opcoes: [...select.options].map((o) => o.textContent.split(' · ')[0]), valor: select.value };
});
const definirHorario = (page, timestamp) => page.evaluate((t) => {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  const setar = (id, valor) => { const el = document.getElementById(id); el.value = valor; el.dispatchEvent(new Event('input', { bubbles: true })); };
  setar('event-date', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  setar('event-hour', pad(d.getHours()));
  setar('event-minute', pad(d.getMinutes()));
}, timestamp);
const salvar = async (page) => { await page.locator('#event-form button[type=submit]').click(); await page.waitForFunction(() => !document.querySelector('#event-dialog').open); };
const evento = (page, id) => page.evaluate((x) => state.events.find((e) => e.id === x).occasionId, id);

test('dose nova entra sozinha no evento que contém o horário; fora de qualquer evento fica sem evento', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    const ids = await page.evaluate(() => {
      const t = window.__t;
      const antes = new Set(state.events.map((e) => e.id));
      registerDrinkAt('d', t.inicio + 1800000);
      registerDrinkAt('d', t.agora - 3600000);
      const novos = state.events.filter((e) => !antes.has(e.id)).sort((x, y) => x.consumedAt - y.consumedAt);
      return novos.map((e) => e.occasionId);
    });
    assert.deepEqual(ids, ['p', null], 'dentro do evento já encerrado → nele; fora → sem evento');
    assert.deepEqual(erros, []);
  });
});

test('registro solto dentro de um evento: a opção aparece, mantém "Sem evento" e permite vincular', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await abrir(page, 'solto');
    assert.deepEqual(await campo(page), { visivel: true, opcoes: ['Sem evento', 'Passado'], valor: '' });
    await page.locator('#record-occasion').selectOption('p');
    await definirHorario(page, await page.evaluate(() => window.__t.inicio + 3600000)); // mesmo horário: escolha manual vale
    assert.equal((await campo(page)).valor, 'p');
    await salvar(page);
    assert.equal(await evento(page, 'solto'), 'p');
    assert.deepEqual(erros, []);
  });
});

test('sem evento cobrindo o horário a opção some; mover para dentro de um evento já o seleciona', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await abrir(page, 'fora');
    assert.equal((await campo(page)).visivel, false, 'nenhum evento naquele horário → sem a opção');
    await definirHorario(page, await page.evaluate(() => window.__t.inicio + 5400000));
    assert.deepEqual(await campo(page), { visivel: true, opcoes: ['Sem evento', 'Passado'], valor: 'p' });
    await salvar(page);
    assert.equal(await evento(page, 'fora'), 'p');
    assert.deepEqual(erros, []);
  });
});

test('mover um registro vinculado para fora do evento o desvincula sem erro', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await abrir(page, 'preso');
    assert.deepEqual(await campo(page), { visivel: true, opcoes: ['Sem evento', 'Passado'], valor: 'p' });
    await definirHorario(page, await page.evaluate(() => window.__t.agora - 3600000));
    assert.equal((await campo(page)).visivel, false);
    await salvar(page);
    assert.equal(await evento(page, 'preso'), null);
    assert.equal(await page.locator('#event-form-error').isVisible(), false);
    assert.deepEqual(erros, []);
  });
});
