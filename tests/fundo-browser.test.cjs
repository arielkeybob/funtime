// Imagem de fundo (spec 0031) e cor de Amigos: o fundo aparece no Início, no Histórico e nas
// Configurações, some em Eventos e Amigos, fica fora do backup e sai com "Remover".
// Desenhos de fundo (spec 0033): Eventos e Amigos levam cada um o seu ladrilho; as outras telas, nenhum.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

test('imagem de fundo: aparece fora de Eventos e Amigos, fica fora do backup e pode ser removida', { timeout: 90000 }, async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demoAmigos' });
    try {
      const png = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 700;
        const g = c.getContext('2d'); g.fillStyle = '#ff7a59'; g.fillRect(0, 0, 400, 700);
        return c.toDataURL('image/png').split(',')[1];
      });
      const camada = () => page.evaluate(() => getComputedStyle(document.querySelector('#app-background')).display);
      const corDoFundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      await page.evaluate(() => { openSettingsView(); showSettingsPage('appearance'); });
      assert.equal(await page.locator('#app-background-remove').isHidden(), true);
      await page.setInputFiles('#app-background-file', { name: 'fundo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-app-background'));
      assert.equal(await page.locator('#app-background-status').textContent(), 'Imagem escolhida');
      assert.equal(await page.locator('#app-background-choose').textContent(), 'Trocar imagem');
      assert.match(await page.evaluate(() => localStorage.getItem('funtime-background-v1')), /data:image\/jpeg/);
      assert.equal(await camada(), 'block', 'Configurações mostra a imagem');
      assert.equal(await corDoFundo(), 'rgba(0, 0, 0, 0)');

      await page.locator('#nav-home').click();
      assert.equal(await camada(), 'block', 'Início mostra a imagem');
      await page.locator('#nav-occasion').click();
      assert.equal(await camada(), 'none', 'Eventos mantém o lilás');
      await page.evaluate(() => openSharedView());
      assert.equal(await camada(), 'none', 'Amigos mantém a própria cor');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(22, 19, 11)', 'Amigos em ouro (#16130b)');
      assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#16130b');

      // Backup leva preferências, mas não a imagem: é do aparelho.
      assert.doesNotMatch(await page.evaluate(() => JSON.stringify(buildCurrentAppData())), /data:image/);

      await page.reload();
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-app-background'));
      await page.evaluate(() => { openSettingsView(); showSettingsPage('appearance'); });
      await page.locator('#app-background-remove').click();
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-app-background')), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('funtime-background-v1')), null);
      assert.equal(await camada(), 'none');
      assert.equal(await page.locator('#app-background-status').textContent(), 'Nenhuma imagem');
      assert.deepEqual(erros, []);
    } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
});

test('desenhos de fundo: Eventos e Amigos com o próprio ladrilho, o resto do app sem', { timeout: 90000 }, async () => {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed: 'demoAmigos' });
    try {
      const desenho = () => page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
      const corDoBody = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const corDaPagina = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

      assert.equal(await desenho(), 'none', 'Início sem desenhos');
      await page.locator('#open-history').click();
      assert.equal(await desenho(), 'none', 'Histórico sem desenhos');
      await page.evaluate(() => { openSettingsView(); });
      assert.equal(await desenho(), 'none', 'Configurações sem desenhos');

      await page.locator('#nav-occasion').click();
      assert.match(await desenho(), /patterns\/eventos\.svg/);
      assert.equal(await corDoBody(), 'rgba(0, 0, 0, 0)', 'o body some para a camada aparecer');
      assert.equal(await corDaPagina(), 'rgb(19, 14, 28)', 'e a cor lilás (#130e1c) fica no html');
      const camada = await page.evaluate(() => {
        const css = getComputedStyle(document.body, '::before');
        return { position: css.position, zIndex: css.zIndex, repeat: css.backgroundRepeat, pointer: css.pointerEvents };
      });
      assert.deepEqual(camada, { position: 'fixed', zIndex: '-1', repeat: 'repeat', pointer: 'none' });

      await page.evaluate(() => openSharedView());
      assert.match(await desenho(), /patterns\/amigos\.svg/);
      assert.equal(await corDaPagina(), 'rgb(22, 19, 11)');
      // Os diálogos de cada módulo levam o ladrilho dele, inclusive os de Eventos abertos fora da aba;
      // diálogos neutros, não.
      const desenhoDoDialogo = (id) => page.evaluate((id) => getComputedStyle(document.getElementById(id)).backgroundImage, id);
      assert.match(await desenhoDoDialogo('friend-info-dialog'), /patterns\/amigos\.svg/);
      assert.match(await desenhoDoDialogo('pairing-dialog'), /patterns\/amigos\.svg/);
      assert.match(await desenhoDoDialogo('occasion-dialog'), /patterns\/eventos\.svg/);
      assert.match(await desenhoDoDialogo('share-occasion-dialog'), /patterns\/eventos\.svg/);
      assert.equal(await desenhoDoDialogo('drink-dialog'), 'none');
      await page.evaluate(() => document.querySelector('#friend-info-dialog').showModal());
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#friend-info-dialog')).backgroundColor), 'rgb(22, 19, 11)', 'por baixo dos desenhos, a cor do módulo');
      await page.evaluate(() => document.querySelector('#friend-info-dialog').close());

      // Os ladrilhos estão no shell offline e abrem como imagem (servidos como SVG, não como binário).
      const tamanhos = await page.evaluate(async () => Promise.all(['eventos', 'amigos'].map(async (nome) => {
        const img = new Image(); img.src = `./patterns/${nome}.svg`; await img.decode();
        return [nome, img.naturalWidth, img.naturalHeight];
      })));
      assert.deepEqual(tamanhos, [['eventos', 374, 374], ['amigos', 352, 352]]);

      await page.evaluate(() => closeSharedView());
      assert.equal(await desenho(), 'none', 'saindo de Amigos, os desenhos vão embora');
      assert.deepEqual(erros, []);
    } finally { await context.close(); }
  } finally { await browser.close(); server.close(); }
});
