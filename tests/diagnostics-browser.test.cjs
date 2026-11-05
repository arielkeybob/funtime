// Modo tester avançado (docs/specs/0035), no app real, atrás do gesto secreto das opções de teste
// (docs/specs/0036): oculto e desligado por padrão, liberado por 7 toques na versão, sobrevive a
// reabrir, exporta sem dados pessoais, desligar apaga e nada fica gravando escondido.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

const CHAVE = 'funtime-diagnostics-v1';
const LIBERADAS = 'funtime-hidden-options-v1';
const registro = (page) => page.evaluate((chave) => JSON.parse(localStorage.getItem(chave)), CHAVE);
const abrirSobre = (page) => page.evaluate(() => { openSettingsView(); showSettingsPage('about'); });
const opcoesVisiveis = (page) => page.locator('#hidden-options').isVisible();
const toast = (page) => page.locator('#toast').textContent();
const recarregar = async (page) => {
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
};
const tocarVersao = async (page, vezes) => { for (let i = 0; i < vezes; i += 1) await page.locator('#about-version').click(); };

async function comApp(executar) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demo' });
    try { await executar(page, erros); } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
}

test('opções de teste: ocultas, 7 toques na versão liberam e continuam liberadas ao reabrir', { timeout: 120000 }, async () => {
  await comApp(async (page, erros) => {
    await abrirSobre(page);
    assert.equal(await opcoesVisiveis(page), false, 'ocultas por padrão');

    await tocarVersao(page, 4);
    assert.match(await toast(page), /Faltam 3 toques/);
    assert.equal(await opcoesVisiveis(page), false);
    await tocarVersao(page, 3);
    assert.match(await toast(page), /Opções de teste liberadas/);
    assert.equal(await opcoesVisiveis(page), true);
    assert.equal(await page.locator('#diagnostics-enabled').isChecked(), false, 'o modo tester continua desligado');

    await recarregar(page);
    await abrirSobre(page);
    assert.equal(await opcoesVisiveis(page), true, 'a liberação fica gravada neste aparelho');
    await tocarVersao(page, 4);
    assert.match(await toast(page), /já estão liberadas/);

    await page.locator('#hide-hidden-options').click();
    assert.equal(await opcoesVisiveis(page), false);
    assert.equal(await page.evaluate((chave) => localStorage.getItem(chave), LIBERADAS), null);
    assert.deepEqual(erros, []);
  });
});

test('modo tester: liga, sobrevive a reabrir, exporta sem dados pessoais, não fica oculto ligado e desligar apaga', { timeout: 120000 }, async () => {
  await comApp(async (page, erros) => {
    await abrirSobre(page);
    await tocarVersao(page, 7);
    const cartao = page.locator('#diagnostics-enabled');
    assert.equal(await cartao.isChecked(), false, 'desligado por padrão');
    assert.equal(await page.locator('#diagnostics-actions').isHidden(), true);
    assert.equal(await registro(page), null, 'desligado não grava nada');

    await page.locator('label[for=diagnostics-enabled]').click();
    await page.waitForFunction(() => /Registrando desde/.test(document.querySelector('#diagnostics-status').textContent));
    assert.equal(await cartao.isChecked(), true);
    await page.waitForFunction((chave) => JSON.parse(localStorage.getItem(chave))?.entries?.some((e) => e.type === 'app.ambiente'), CHAVE);

    // Ligado, não dá para ocultar: nada pode ficar gravando escondido.
    await page.locator('#hide-hidden-options').click();
    assert.match(await toast(page), /Desligue o modo tester/);
    assert.equal(await opcoesVisiveis(page), true);

    // Reabrir: o registro continua e ganha a nova abertura.
    await recarregar(page);
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

    // Desligar pede confirmação e apaga; as opções continuam à vista até a pessoa ocultar.
    await page.locator('label[for=diagnostics-enabled]').click();
    await page.waitForSelector('#app-confirm-dialog[open]');
    assert.equal(await page.locator('#app-confirm-title').textContent(), 'Desligar o modo tester?');
    await page.locator('#app-confirm-accept').click();
    await page.waitForFunction(() => !document.querySelector('#diagnostics-enabled').checked);
    assert.equal(await registro(page), null);
    assert.equal(await page.locator('#diagnostics-status').isHidden(), true);
    assert.equal(await opcoesVisiveis(page), true);
    assert.deepEqual(erros, []);
  });
});

test('quem ligou o modo tester na 2.35.0 (sem liberação gravada) continua vendo as opções', { timeout: 120000 }, async () => {
  await comApp(async (page, erros) => {
    await page.evaluate((chave) => localStorage.setItem(chave, JSON.stringify({ enabled: true, since: Date.now(), entries: [] })), CHAVE);
    await recarregar(page);
    await abrirSobre(page);
    assert.equal(await opcoesVisiveis(page), true);
    assert.equal(await page.locator('#diagnostics-enabled').isChecked(), true);
    assert.equal(JSON.parse(await page.evaluate((chave) => localStorage.getItem(chave), LIBERADAS))?.unlocked, true, 'vira liberação gravada');
    assert.deepEqual(erros, []);
  });
});
