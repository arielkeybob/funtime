// Fundo do app (specs 0031 e 0034): de fábrica, a imagem padrão; a pessoa pode trocar por uma imagem
// dela ou por uma cor sólida (cor clara é escurecida até o texto continuar legível). Vale no Início,
// no Histórico e nas Configurações, some em Eventos e Amigos e fica fora do backup.
// Desenhos de fundo (spec 0033): Eventos e Amigos levam cada um o seu ladrilho; as outras telas, nenhum.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

const CHAVE = 'funtime-background-v1';

test('fundo do app: imagem padrão de fábrica, minha imagem, cor sólida e volta ao padrão', { timeout: 120000 }, async () => {
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
      const fundo = () => page.evaluate(() => {
        const camada = document.querySelector('#app-background');
        const css = getComputedStyle(camada);
        return {
          modo: document.documentElement.dataset.appBackground,
          display: css.display,
          imagem: css.backgroundImage,
          cor: css.backgroundColor,
          veu: getComputedStyle(camada, '::after').content !== 'none',
          barra: document.querySelector('meta[name="theme-color"]').content,
          body: getComputedStyle(document.body).backgroundColor,
        };
      });
      const guardado = () => page.evaluate((chave) => JSON.parse(localStorage.getItem(chave) || 'null'), CHAVE);
      const marcado = () => page.evaluate(() => document.querySelector('input[name="app-background-mode"]:checked').value);
      const opcao = (modo) => page.locator(`input[name="app-background-mode"][value="${modo}"]`);
      // Depois de recarregar, espera o app terminar de iniciar (o início volta para a tela inicial).
      const iniciado = () => page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending')
        && !document.body.classList.contains('security-booting') && document.documentElement.dataset.appBackground === 'image');
      const abrirAparencia = () => page.evaluate(() => { openSettingsView(); showSettingsPage('appearance'); });

      // De fábrica (e para quem nunca escolheu): imagem padrão com véu, nada guardado.
      let f = await fundo();
      assert.equal(f.modo, 'image');
      assert.equal(f.display, 'block', 'Início mostra o fundo');
      assert.match(f.imagem, /images\/fundo-padrao\.webp/);
      assert.equal(f.veu, true);
      assert.equal(f.barra, '#09090b');
      assert.equal(f.body, 'rgba(0, 0, 0, 0)');
      assert.equal(await guardado(), null);
      const tamanho = await page.evaluate(async () => {
        const img = new Image(); img.src = './images/fundo-padrao.webp'; await img.decode();
        return [img.naturalWidth, img.naturalHeight];
      });
      assert.deepEqual(tamanho, [720, 1280], 'a imagem padrão está no shell e abre');
      await page.locator('#open-history').click();
      assert.equal((await fundo()).display, 'block', 'Histórico mostra o fundo');
      await page.locator('#nav-occasion').click();
      assert.equal((await fundo()).display, 'none', 'Eventos mantém o lilás');
      await page.evaluate(() => openSharedView());
      assert.equal((await fundo()).display, 'none', 'Amigos mantém a própria cor');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(22, 19, 11)', 'Amigos em ouro (#16130b)');
      assert.equal((await fundo()).barra, '#16130b');
      await page.evaluate(() => closeSharedView());

      await abrirAparencia();
      assert.equal((await fundo()).display, 'block', 'Configurações mostra o fundo');
      assert.equal(await marcado(), 'default');
      assert.equal(await page.locator('#app-background-image-actions').isHidden(), true);
      assert.equal(await page.locator('#app-background-colors').isHidden(), true);

      // Minha imagem, ainda sem foto: abre o seletor e não troca nada até a imagem ser salva.
      const seletor = page.waitForEvent('filechooser');
      await opcao('image').click();
      await seletor;
      assert.equal(await marcado(), 'default', 'cancelar o seletor deixa o fundo como estava');
      assert.match((await fundo()).imagem, /fundo-padrao/);
      await page.setInputFiles('#app-background-file', { name: 'fundo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction((chave) => JSON.parse(localStorage.getItem(chave) || 'null')?.mode === 'image', CHAVE);
      f = await fundo();
      assert.match(f.imagem, /data:image\/jpeg/);
      assert.equal(f.veu, true);
      assert.equal(await marcado(), 'image');
      assert.equal(await page.locator('#app-background-image-actions').isVisible(), true);
      assert.equal(await page.locator('#app-background-choose').textContent(), 'Trocar imagem');

      // Cor sólida: começa no preto, sem véu; trocar de modo não apaga a foto.
      await opcao('color').click();
      f = await fundo();
      assert.deepEqual([f.modo, f.cor, f.veu, f.barra], ['color', 'rgb(9, 9, 11)', false, '#09090b']);
      assert.equal(f.imagem, 'none');
      assert.equal(await page.locator('#app-background-colors').isVisible(), true);
      assert.equal(await page.locator('#app-background-color-status').textContent(), 'Preto (padrão)');
      assert.match((await guardado()).image, /^data:image\/jpeg/, 'a foto continua guardada');
      await page.locator('.background-swatch[data-color="#2a0f17"]').click();
      f = await fundo();
      assert.deepEqual([f.cor, f.barra], ['rgb(42, 15, 23)', '#2a0f17'], 'a barra do sistema acompanha a cor');
      assert.equal(await page.locator('.background-swatch[data-color="#2a0f17"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#app-background-color-status').textContent(), 'Vinho');

      // Outra cor, clara: o fundo fica escurecido no mesmo tom e o aviso explica.
      await page.evaluate(() => {
        const entrada = document.querySelector('#app-background-custom-color');
        entrada.value = '#ffd1dc';
        entrada.dispatchEvent(new Event('input', { bubbles: true }));
        entrada.dispatchEvent(new Event('change', { bubbles: true }));
      });
      f = await fundo();
      assert.deepEqual([f.cor, f.barra], ['rgb(65, 53, 56)', '#413538']);
      assert.equal(await page.locator('#app-background-color-status').textContent(), 'Outra cor (#413538) · Ajustada para o texto continuar legível.');
      assert.equal((await guardado()).color, '#ffd1dc', 'guarda a cor escolhida; o ajuste é na hora de mostrar');

      // A foto guardada volta com um toque, sem abrir o seletor.
      await opcao('image').click();
      assert.match((await fundo()).imagem, /data:image\/jpeg/);

      // Backup leva preferências, mas não o fundo: é do aparelho.
      assert.doesNotMatch(await page.evaluate(() => JSON.stringify(buildCurrentAppData())), /data:image|fundo-padrao|ffd1dc/);

      // Recarregar mantém a escolha.
      await page.reload();
      await iniciado();
      assert.match((await fundo()).imagem, /data:image\/jpeg/);

      // Remover a foto em uso volta à imagem padrão; a cor escolhida continua lembrada.
      await abrirAparencia();
      await page.locator('#app-background-remove').click();
      f = await fundo();
      assert.match(f.imagem, /fundo-padrao/);
      assert.equal(await marcado(), 'default');
      assert.deepEqual(await guardado().then(({ mode, image, color }) => ({ mode, image, color })), { mode: 'default', image: null, color: '#ffd1dc' });
      assert.equal(await page.locator('#app-background-image-actions').isHidden(), true);
      await opcao('color').click();
      assert.equal((await fundo()).cor, 'rgb(65, 53, 56)');

      // Quem escolheu uma foto na versão anterior (formato v1) continua com ela.
      await page.evaluate((chave) => localStorage.setItem(chave, JSON.stringify({ version: 1, image: 'data:image/png;base64,iVBORw0KGgo=', updatedAt: 1 })), CHAVE);
      await page.reload();
      await iniciado();
      await abrirAparencia();
      assert.equal(await marcado(), 'image');
      assert.match((await fundo()).imagem, /data:image\/png/);
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
