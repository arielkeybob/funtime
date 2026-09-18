// Navegador real. Garante que a interface de compartilhamento existe, está ligada, e
// que sem conta conectada ela não aparece nem faz nada — a invariante "sem login,
// nada muda" da spec 0023.
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

test('sem conta conectada, o compartilhamento não aparece', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => openSettingsView());

    assert.equal(await page.locator('#settings-sharing-card').count(), 0,
      'o card de compartilhar em Configurações foi removido — a ação mora na tela Amigos');
    assert.equal(await page.locator('#pairing-dialog').evaluate((node) => node.open), false);
    assert.equal(await page.locator('#home-friends-button').isVisible(), false,
      'sem conta, o ícone de amigos no cabeçalho da Home não aparece');
    assert.equal(await page.locator('#shared-view').isVisible(), false);
    assert.deepEqual(erros, [], 'a interface nova não pode gerar erro no console');
  });
});

// A tela do convidado é acessível mesmo sem login (não tem dado nenhum pra mostrar
// ainda, mas a navegação em si não pode quebrar) — cobre setCurrentView("shared").
// A lista de amigos é compacta e única: sem pareamento nenhum, mostra só o estado
// vazio — o histórico de verdade só existe dentro do diálogo de detalhe, aberto ao
// tocar em alguém.
test('a tela de "compartilhado com você" abre e fecha sem erro', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => openSharedView());
    assert.equal(await page.locator('#shared-view').isVisible(), true);
    assert.equal(await page.locator('#friends-empty').isVisible(), true,
      'sem amigo nenhum, mostra o estado vazio da lista');
    assert.equal(await page.locator('#shared-detail-dialog').evaluate((node) => node.open), false,
      'o detalhe (onde fica o aviso de segurança) só abre ao tocar em alguém');
    assert.match(
      await page.locator('#shared-detail-dialog .shared-view-disclaimer').textContent(),
      /não indicam se essa pessoa está segura/,
      'o aviso de segurança precisa existir no diálogo, mesmo fechado'
    );
    assert.equal(
      await page.locator('#shared-detail-tabs').evaluate((node) => node.hidden),
      false,
      'as abas Vendo/Compartilhando ficam sempre visíveis, não só quando os dois lados estão ativos'
    );
    assert.equal(await page.locator('#friend-info-dialog').evaluate((node) => node.open), false,
      '"Sobre o amigo" (onde mora Desfazer amizade) só abre pelo ícone de informação');

    await page.locator('#close-shared').click();
    assert.equal(await page.locator('#shared-view').isVisible(), false);
    assert.equal(await page.evaluate(() => state.currentView), 'home');
    assert.deepEqual(erros, []);
  });
});

// Um código de pareamento nunca pode sair sem conta: a interface é montada no boot,
// antes de existir escritor, e não pode chamar nada nesse estado.
test('a interface montada sem conta não conversa com a nuvem', { timeout: 30000 }, async () => {
  await withPage(async (page) => {
    const pedidos = [];
    page.on('request', (request) => {
      if (/gstatic\.com|firebaseapp\.com|googleapis\.com|firebaseio\.com/.test(request.url())) pedidos.push(request.url());
    });

    await page.evaluate(() => openSettingsView());
    await page.waitForTimeout(500);

    assert.deepEqual(pedidos, [], 'nada de rede sem conta conectada');
  });
});

test('o diálogo de pareamento abre e fecha pelos próprios controles', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    // A tela Amigos fica escondida sem conta, então o teste aciona o fluxo direto — o
    // que interessa aqui é o diálogo estar ligado aos botões.
    await page.evaluate(() => document.querySelector('#friends-add').click());
    assert.equal(await page.locator('#pairing-dialog').evaluate((node) => node.open), true);

    assert.equal(await page.locator('#pairing-code-display').textContent(), '— — —',
      'não mostra código antes de gerar');

    await page.locator('#pairing-done').click();
    assert.equal(await page.locator('#pairing-dialog').evaluate((node) => node.open), false);
    assert.deepEqual(erros, []);
  });
});

// Prova as duas bibliotecas embutidas e o payload ponta a ponta: o QR gerado pelo app
// tem que ser lido de volta pelo leitor do app, com o mesmo código.
test('o QR gerado é lido de volta pelo leitor embutido', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    const lido = await page.evaluate(async () => {
      const qr = await import('/funtime/src/sharing/qr.js');
      const codes = await import('/funtime/src/data/share-codes.js');
      const url = await qr.renderQrDataUrl(codes.buildPairingQrPayload('AB7K29'));
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      return codes.parsePairingQrPayload(await qr.decodeImageData(data.data, data.width, data.height));
    });
    assert.equal(lido, 'AB7K29');
    assert.deepEqual(erros, []);
  });
});

test('digitar os 6 caracteres conecta sozinho, sem botão', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    assert.equal(await page.locator('#pairing-redeem').count(), 0, 'o botão redundante foi removido');
    await page.evaluate(() => document.querySelector('#friends-add').click());
    await page.locator('#pairing-code-input').fill('AB7K29');
    // Sem conta não há escritor: a tentativa automática falha, e a mensagem prova
    // que o envio aconteceu sozinho.
    await page.waitForFunction(() => !document.querySelector('#pairing-error').hidden);
    assert.match(await page.locator('#pairing-error').textContent(), /Não foi possível conectar/);
    assert.equal(await page.locator('#pairing-code-input').inputValue(), 'AB7-K29');
    assert.ok(erros.every((erro) => /pareamento|conta conectada/i.test(String(erro))), `erros inesperados: ${erros}`);
  });
});

// Aba "Compartilhando": compartilhar é sempre de um evento. Sem "Usar eventos" avisa e
// leva à configuração; com evento em andamento oferece compartilhar; sem evento oferece
// iniciar um já com a pessoa marcada. A aba "Vendo" não depende disso.
test('a aba Compartilhando oferece o que dá para fazer conforme os eventos', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    const textos = await page.evaluate(async () => {
      const { createShareUI } = await import('/funtime/src/sharing/share-ui.js');
      const n = (s) => document.querySelector(s);
      let contexto = { eventsEnabled: false, active: [] };
      const chamadas = [];
      const nodes = {
        friendsGrid: n('#friends-grid'), friendsEmpty: n('#friends-empty'), sharedDetailDialog: n('#shared-detail-dialog'),
        sharedDetailTitle: n('#shared-detail-title'), sharedDetailTabs: n('#shared-detail-tabs'),
        sharedDetailTabVendo: n('#shared-detail-tab-vendo'), sharedDetailTabCompartilhando: n('#shared-detail-tab-compartilhando'),
        sharedDetailBody: n('#shared-detail-body'), homeFriendsDot: n('#home-friends-dot'), pairingError: n('#pairing-error'),
      };
      const ui = createShareUI({
        nodes, getShareWriter: () => null, showToast() {},
        getEventsContext: () => contexto,
        startEventWith: (uid) => chamadas.push(['novo', uid]),
        openEventsSetting: () => chamadas.push(['config']),
      });
      ui.wire();
      ui.setPairings([{ pairId: 'p', otherUid: 'u', alias: 'Su', myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true, createdAt: Date.now() }]);
      const corpo = () => n('#shared-detail-body').innerText.replace(/\s+/g, ' ').trim();
      const abrir = () => { if (!n('#shared-detail-dialog').open) n('#friends-grid .share-person').click(); n('#shared-detail-tab-compartilhando').click(); };
      const saida = {};
      abrir(); saida.desligado = corpo();
      [...n('#shared-detail-body').querySelectorAll('button')].find((b) => /Ativar/.test(b.textContent)).click();
      saida.aposConfig = { chamadas: [...chamadas], aberto: n('#shared-detail-dialog').open };
      chamadas.length = 0;
      contexto = { eventsEnabled: true, active: [] };
      abrir(); saida.semEvento = corpo();
      [...n('#shared-detail-body').querySelectorAll('button')].find((b) => /Iniciar evento/.test(b.textContent)).click();
      saida.aposNovo = [...chamadas];
      contexto = { eventsEnabled: true, active: [{ item: { id: 'o1', name: 'Festa' }, events: [] }] };
      abrir(); saida.comEvento = corpo();
      n('#shared-detail-tab-vendo').click(); saida.vendo = corpo();
      return saida;
    });
    assert.match(textos.desligado, /Eventos precisa estar ativo/);
    assert.deepEqual(textos.aposConfig, { chamadas: [['config']], aberto: false });
    assert.match(textos.semEvento, /Nenhum evento em andamento.*Iniciar evento e compartilhar/);
    assert.deepEqual(textos.aposNovo, [['novo', 'u']]);
    assert.match(textos.comEvento, /Festa.*Compartilhar/);
    assert.match(textos.vendo, /não está compartilhando nada com você/, 'Vendo não depende dos eventos');
    assert.deepEqual(erros, []);
  });
});
