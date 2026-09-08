// Browser real, origem e perfil efêmeros; não acessa a instalação do usuário.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

test('Voltar percorre telas, diálogos, subetapas e não acumula entradas vazias', { timeout: 90000 }, async () => {
  const server = http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.replace(/^\/funtime\//, '') || 'index.html';
    if (file.includes('..') || file.startsWith('/')) return res.writeHead(404).end();
    try {
      const type = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }).end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
    await page.getByRole('button', { name: 'Começar sem dados', exact: true }).click();
    for (const checkbox of await page.locator('#terms-form input[type=checkbox]').all()) await checkbox.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => history.state?.funtimeNavigation && !document.body.classList.contains('boot-pending'));
    await page.evaluate(() => {
      state.drinks = [{ id: 'd', name: 'Teste', icon: '💧', intervalMinutes: 30, askDoseSize: false }];
      state.events = [{ id: 'e', drinkId: 'd', drinkName: 'Teste', drinkIcon: '💧', consumedAt: Date.now(), intervalMinutes: 30, doseSize: null }];
      saveData(); render();
    });
    const depth = n => page.waitForFunction(n => history.state?.funtimeNavigation?.depth === n, n);
    const back = async n => { await page.evaluate(() => history.back()); await depth(n); };
    await page.locator('#open-history').click(); await depth(1);
    await page.evaluate(() => openEventDialog('e')); await depth(2);
    await back(1); assert.equal(await page.locator('#event-dialog').evaluate(d => d.open), false);
    await back(0); assert.equal(await page.evaluate(() => state.currentView), 'home');

    await page.evaluate(() => openDrinkMenuDialog('d')); await depth(1);
    await page.evaluate(() => editDrinkFromDrinkMenu()); await depth(2);
    await page.locator('#drink-name').fill('Rascunho preservado');
    await page.locator('.icon-add').click(); await depth(3);
    await back(2); assert.equal(await page.locator('#drink-dialog').evaluate(d => d.open), true);
    await page.evaluate(() => openDeleteDrinkDialog('d', { returnToEditorOnCancel: true })); await depth(3);
    await back(2); assert.equal(await page.locator('#drink-name').inputValue(), 'Rascunho preservado');
    await page.keyboard.press('Escape'); await depth(1);
    await back(0);

    await page.evaluate(() => openIntervalWarningDialog('d')); await depth(1);
    await page.evaluate(() => continueFromIntervalWarning()); await depth(2);
    await back(1); assert.equal(await page.locator('#interval-warning-dialog').evaluate(d => d.open), true);
    await back(0);
    await page.evaluate(() => openDoseSizeDialog('e')); await depth(1);
    await back(0); assert.equal(await page.evaluate(() => state.pendingDoseEventId), null);
    await page.evaluate(() => openDrinkDialog()); await depth(1);
    await page.locator('.icon-edit').click(); await depth(2);
    assert.equal(await page.locator('#icon-edit-menu').isVisible(), true);
    await page.locator('#choose-icon-reorder').click(); await depth(2);
    assert.equal(await page.evaluate(() => iconCatalogMode), 'reorder');
    await back(1); assert.equal(await page.evaluate(() => editingIconCatalog), false);
    await page.locator('.icon-edit').click(); await depth(2);
    await back(1); assert.equal(await page.locator('#icon-edit-menu').isVisible(), false);
    await back(0);

    await page.evaluate(() => { openSettingsView(); openDrinkImportPreview({ fileName: 'teste.txt', drinks: [], source: 'manual' }); }); await depth(2);
    await back(1); assert.equal(await page.evaluate(() => state.pendingDrinkImport), null);
    await page.evaluate(() => { state.pendingBackupRestore = {}; backupRestoreDialog.showModal(); }); await depth(2);
    await back(1); assert.equal(await page.evaluate(() => state.pendingBackupRestore), null);
    await back(0);

    await page.evaluate(() => openSettingsView()); await depth(1);
    await page.evaluate(() => openSecurityMethodDialog()); await depth(2);
    await page.evaluate(() => choosePinSecurity()); await depth(3);
    await back(2); assert.equal(await page.locator('#security-method-dialog').evaluate(d => d.open), true);
    await back(1);
    await page.evaluate(() => {
      globalThis.originalPinHash = derivePinHash;
      derivePinHash = () => new Promise(resolve => { globalThis.finishPinHash = resolve; });
      openSecurityMethodDialog(); choosePinSecurity();
    }); await depth(3);
    await page.locator('#pin-setup-value').fill('1234');
    await page.locator('#pin-setup-confirm').fill('1234');
    await page.locator('#pin-setup-dialog button[type=submit]').click();
    assert.equal(await page.evaluate(() => typeof finishPinHash), 'function', await page.locator('#pin-setup-error').textContent());
    await page.waitForFunction(() => typeof finishPinHash === 'function');
    await back(2);
    await page.evaluate(() => { finishPinHash(new Uint8Array(32)); derivePinHash = originalPinHash; });
    assert.equal(await page.evaluate(() => state.securityConfig.enabled), false);
    assert.equal(await page.locator('#pin-setup-value').inputValue(), '');
    await back(1);
    await page.locator('#settings-view details summary').click(); await depth(2);
    await page.evaluate(() => { state.securityConfig.enabled = true; state.securityConfig.method = 'pin'; openDataReset('icons'); }); await depth(3);
    await page.locator('#reset-submit').click(); await depth(4);
    await page.evaluate(() => { globalThis.oldResetAuthorization = resetPending; });
    await back(3); assert.equal(await page.evaluate(() => resetPending.confirmed), false);
    assert.equal(await page.evaluate(() => resetAuthorizationIsCurrent(oldResetAuthorization)), false);
    await back(2); assert.equal(await page.evaluate(() => resetPending), null);
    await back(1); await back(0);
    await page.evaluate(() => { state.securityConfig.enabled = false; });

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => openDrinkDialog()); await depth(1);
      await page.locator('#cancel-dialog').click(); await depth(0);
    }
    await page.evaluate(() => { openDrinkDialog(); closeDrinkDialog(); openSettingsView(); }); await depth(1);
    await page.reload(); await page.waitForFunction(() => typeof state !== 'undefined' && state.currentView === 'settings'); await depth(1);
    await page.locator('#app-shell .policies-link').click();
    await page.locator('.information-back').click(); await page.waitForFunction(() => typeof state !== 'undefined' && state.currentView === 'settings'); await depth(1);
    await back(0);
    await page.evaluate(() => history.forward()); await depth(0);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.evaluate(() => openHistoryView('d')); await depth(1);
    await page.locator('#app-shell .policies-link').click();
    await page.goBack();
    await page.waitForFunction(() => typeof state !== 'undefined' && state.currentView === 'history' && state.historyDrinkId === 'd');
    await depth(1); await back(0);
    await page.evaluate(() => { openSettingsView(); openDrinkDialog(); }); await depth(2);
    await page.evaluate(() => { state.securityLocked = true; closeSensitiveDialogs(); showLockScreen(); }); await depth(0);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('#lock-screen').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
