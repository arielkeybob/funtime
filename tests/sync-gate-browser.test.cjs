// Regressão da trava mais perigosa da sincronização (docs/specs/0022): fora do app
// instalado, `initialData` é propositalmente vazio. Se a sincronização ligasse ali,
// enviaria um retrato vazio à nuvem e voltaria apagando o histórico real. Servidor
// próprio, sem a injeção de `navigator.standalone` que a prévia de dev faz.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const STORED_DATA = {
  version: 11,
  drinks: [{ id: 'd1', name: 'Café', icon: '☕', intervalMinutes: 60, askDoseSize: false }],
  events: [{ id: 'e1', drinkId: 'd1', drinkName: 'Café', drinkIcon: '☕', consumedAt: 1750000000000, occasionId: null, intervalMinutes: 60, doseSize: null }],
  occasions: [],
  preferences: { cleanInterface: true, countingMode: 'countdown', iconCatalog: ['☕'] },
};

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

test('fora do app instalado, a sincronização não liga nem toca nos dados reais', { timeout: 30000 }, async () => {
  const srv = server();
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PWA_BROWSER_CHANNEL || 'msedge' });

  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    const externalRequests = [];
    page.on('request', (request) => {
      if (/gstatic\.com|firebaseapp\.com|googleapis\.com|firebaseio\.com/.test(request.url())) externalRequests.push(request.url());
    });

    // Conta já conectada em uma sessão anterior: é este estado que tornava o bug possível.
    await page.addInitScript((data) => {
      localStorage.setItem('funtime-v1-data', JSON.stringify(data));
      localStorage.setItem('funtime-sync-v1', JSON.stringify({ connected: true }));
    }, STORED_DATA);

    await page.goto(origin + '/funtime/');
    await page.locator('#browser-gate').waitFor({ state: 'visible' });

    assert.deepEqual(externalRequests, [], 'nenhuma conexão com o Firebase fora do app instalado');
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('funtime-v1-data'))),
      STORED_DATA,
      'os dados reais continuam intactos no armazenamento'
    );
  } finally {
    await browser.close();
    srv.close();
  }
});
