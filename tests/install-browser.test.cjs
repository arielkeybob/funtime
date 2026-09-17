// Browser real, origem efêmera; não acessa a instalação do usuário.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

function server() {
  return http.createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.replace(/^\/funtime\//, '') || 'index.html';
    if (file.includes('..') || file.startsWith('/')) return res.writeHead(404).end();
    try {
      const type = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }).end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
}

test('página de instalação conclui por evento e mantém orientação ao voltar', { timeout: 30000 }, async () => {
  const srv = server();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PWA_BROWSER_CHANNEL || 'msedge' });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => Object.defineProperty(navigator, 'getInstalledRelatedApps', { value: undefined, configurable: true }));
    await page.goto(origin + '/funtime/');
    await page.locator('#browser-gate').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const prompt = new Event('beforeinstallprompt');
      prompt.prompt = async () => ({ outcome: 'accepted' });
      window.dispatchEvent(prompt);
    });
    await page.locator('#browser-install-password').fill('SenhadoFunTime');
    await page.locator('#browser-install-button').click();
    assert.equal(await page.locator('#browser-install-status-title').textContent(), 'Instalação iniciada');
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await page.locator('#browser-install-status-title').textContent(), 'App já instalado');
    assert.equal(await page.locator('#browser-gate-lead').isVisible(), false);
    assert.equal(await page.locator('#browser-install-button').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await ctx.close();
  } finally {
    await browser.close();
    await new Promise(resolve => srv.close(resolve));
  }
});
