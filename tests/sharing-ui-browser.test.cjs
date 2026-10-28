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

    await page.locator('#close-pairing').click();
    assert.equal(await page.locator('#pairing-dialog').evaluate((node) => node.open), false);
    assert.deepEqual(erros, []);
  });
});

// Para mandar por mensagem quando não dá para mostrar a tela. Copia com o traço (como
// aparece), e o campo de quem recebe aceita colar assim. O prazo é de 10 minutos.
test('o código gerado pode ser copiado e vale por 10 minutos', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    // Escritor falso pela ponte da prévia (a mesma dos tutoriais): sem Firebase nem login.
    await page.evaluate(() => __funtimeCaptura.instalar({
      uid: 'eu', usuario: { uid: 'eu', email: 'eu@exemplo.com' }, eventos: null,
      escritor: {
        createPairingCode: async () => ({ code: 'AB7K29', expiresAtMs: Date.now() + 10 * 60 * 1000 }),
        cancelPairingCode: async () => {}, getGlobalAlias: async () => '', setGlobalAlias: async (apelido) => apelido,
      },
    }));
    await page.locator('#home-friends-button').click();
    await page.locator('#friends-add').click();
    assert.equal(await page.locator('#pairing-copy').isVisible(), false, 'sem código, não há o que copiar');

    await page.locator('#pairing-generate').click();
    await page.locator('#pairing-copy').waitFor({ state: 'visible' });
    assert.match(await page.locator('#pairing-code-countdown').textContent(), /^Vale por mais (10:00|9:5\d)$/);

    await page.locator('#pairing-copy').click();
    await page.waitForFunction(() => document.querySelector('#toast-message')?.textContent === 'Código copiado.');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'AB7-K29');

    await page.locator('#close-pairing').click();
    await page.locator('#friends-add').click();
    assert.equal(await page.locator('#pairing-copy').isVisible(), false, 'reabrir começa sem código');
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
    assert.match(textos.vendo, /^Su não está compartilhando nada com você agora./, 'Vendo usa o apelido da pessoa e não depende dos eventos');
    assert.deepEqual(erros, []);
  });
});

test('a aba Vendo explica o estado em vez de mensagens técnicas', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    // Relógio fixo no meio do dia: com o relógio real, perto da meia-noite "1 hora atrás" vira "ontem".
    await page.clock.setFixedTime(new Date(2026, 5, 13, 15, 0));
    const r = await page.evaluate(async () => {
      const { createShareUI } = await import('/funtime/src/sharing/share-ui.js');
      const n = (s) => document.querySelector(s);
      const nodes = {
        friendsGrid: n('#friends-grid'), friendsEmpty: n('#friends-empty'), sharedDetailDialog: n('#shared-detail-dialog'),
        sharedDetailTitle: n('#shared-detail-title'), sharedDetailTabs: n('#shared-detail-tabs'),
        sharedDetailTabVendo: n('#shared-detail-tab-vendo'), sharedDetailTabCompartilhando: n('#shared-detail-tab-compartilhando'),
        sharedDetailBody: n('#shared-detail-body'), homeFriendsDot: n('#home-friends-dot'), pairingError: n('#pairing-error'),
      };
      const t = Date.now();
      const ui = createShareUI({ nodes, getShareWriter: () => null, showToast() {} });
      ui.wire();
      ui.setPairings([{ pairId: 'p', otherUid: 'u', alias: 'Su', myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true, createdAt: t }]);
      const entrada = (fromCache, updatedAtMs) => ({ ownerUid: 'u', fromCache, receivedAtMs: t, view: { ownerAlias: 'Su', occasion: { name: 'Festa', startedAt: t - 3600000, endedAt: null }, totals: [], truncated: false, eventCount: 0, updatedAtMs, events: [] } });
      const texto = () => n('#shared-detail-body').textContent.replace(/\s+/g, ' ').trim();
      ui.setSharedEntries([entrada(true, t)]);
      n('#friends-grid .share-person').click();
      const saida = { cache: texto() };
      ui.setSharedEntries([entrada(false, t)]);
      saida.emDia = texto();
      ui.setSharedEntries([entrada(false, t - 3600000)]);
      saida.antigo = texto();
      return saida;
    });
    assert.match(r.cache, /^Atualizando…\s*Festa\s*Em andamento\s*Começou hoje às \d\d:\d\d\s*Su ainda não registrou nada neste evento\.$/);
    assert.match(r.emDia, /^Atualizado agora\s*Festa\s*Em andamento/);
    assert.match(r.antigo, /^Atualizado agora\s*Festa/, 'envio antigo não vira aviso nem mostra a hora da última atualização');
    assert.doesNotMatch(r.cache + r.emDia + r.antigo, /Sem conexão|desatualizado|última atualização/);
    assert.deepEqual(erros, []);
  });
});

// Depois que o evento da outra pessoa termina o acesso continua (até 24h), mas a pessoa não está mais
// compartilhando "agora": sem selo verde nem bolinha na Home, e o texto diz isso.
test('evento encerrado deixa de aparecer como ao vivo', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    const r = await page.evaluate(async () => {
      const { createShareUI } = await import('/funtime/src/sharing/share-ui.js');
      const n = (s) => document.querySelector(s);
      const nodes = {
        friendsGrid: n('#friends-grid'), friendsEmpty: n('#friends-empty'), sharedDetailDialog: n('#shared-detail-dialog'),
        sharedDetailTitle: n('#shared-detail-title'), sharedDetailTabs: n('#shared-detail-tabs'),
        sharedDetailTabVendo: n('#shared-detail-tab-vendo'), sharedDetailTabCompartilhando: n('#shared-detail-tab-compartilhando'),
        sharedDetailBody: n('#shared-detail-body'), homeFriendsDot: n('#home-friends-dot'), pairingError: n('#pairing-error'),
      };
      const t = Date.now();
      const ui = createShareUI({ nodes, getShareWriter: () => null, showToast() {} });
      ui.wire();
      ui.setPairings([{ pairId: 'p', otherUid: 'u', alias: 'Su', myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true, createdAt: t }]);
      const entrada = (endedAt) => ({ ownerUid: 'u', fromCache: false, receivedAtMs: t, view: { ownerAlias: 'Su', occasion: { name: 'Festa', startedAt: t - 7200000, endedAt }, totals: [], truncated: false, eventCount: 0, updatedAtMs: t, expiresAtMs: t + 86400000, events: [] } });
      const estado = () => ({ pontoHome: !n('#home-friends-dot').hidden, verde: !!n('#friends-grid .share-badge--incoming'), cinza: !!n('#friends-grid .share-badge--ended') });
      ui.setSharedEntries([entrada(null)]);
      const aoVivo = estado();
      ui.setSharedEntries([entrada(t - 1000)]);
      const encerrado = estado();
      n('#friends-grid .share-person').click();
      return { aoVivo, encerrado, texto: n('#shared-detail-body').innerText.replace(/\s+/g, ' ') };
    });
    assert.deepEqual(r.aoVivo, { pontoHome: true, verde: true, cinza: false });
    assert.deepEqual(r.encerrado, { pontoHome: false, verde: false, cinza: true });
    assert.match(r.texto, /Festa Encerrado às \d\d:\d\d/);
    assert.doesNotMatch(r.texto, /você pode ver até|24h/, 'quem recebe não precisa do prazo escrito');
    assert.deepEqual(erros, []);
  });
});

// Encerra um evento e, dentro das 24h, a pessoa abre outro: os dois aparecem — o novo ao
// vivo em cima e o anterior sob "Anteriores" — e o selo é o melhor estado dos dois.
test('evento novo dentro das 24h do anterior: os dois aparecem', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    // Relógio fixo no meio do dia: com o relógio real, perto da meia-noite "1 hora atrás" vira "ontem".
    await page.clock.setFixedTime(new Date(2026, 5, 13, 15, 0));
    const r = await page.evaluate(async () => {
      const { createShareUI } = await import('/funtime/src/sharing/share-ui.js');
      const n = (s) => document.querySelector(s);
      const nodes = {
        friendsGrid: n('#friends-grid'), friendsEmpty: n('#friends-empty'), sharedDetailDialog: n('#shared-detail-dialog'),
        sharedDetailTitle: n('#shared-detail-title'), sharedDetailTabs: n('#shared-detail-tabs'),
        sharedDetailTabVendo: n('#shared-detail-tab-vendo'), sharedDetailTabCompartilhando: n('#shared-detail-tab-compartilhando'),
        sharedDetailBody: n('#shared-detail-body'), homeFriendsDot: n('#home-friends-dot'), pairingError: n('#pairing-error'),
      };
      const t = Date.now();
      const ui = createShareUI({ nodes, getShareWriter: () => null, showToast() {} });
      ui.wire();
      ui.setPairings([{ pairId: 'p', otherUid: 'u', alias: 'Su', myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true, createdAt: t }]);
      const entrada = (nome, startedAt, endedAt, expiresAtMs) => ({ ownerUid: 'u', shareId: nome, fromCache: false, receivedAtMs: t, view: { ownerAlias: 'Su', occasion: { name: nome, startedAt, endedAt }, totals: [], truncated: false, eventCount: 0, updatedAtMs: t, expiresAtMs, events: [] } });
      const velho = entrada('Festa', t - 8 * 3600000, t - 2 * 3600000, t + 22 * 3600000);
      const novo = entrada('Jantar', t - 3600000, null, t + 47 * 3600000);
      const estado = () => ({ verde: !!n('#friends-grid .share-badge--incoming'), cinza: !!n('#friends-grid .share-badge--ended'), dot: !n('#home-friends-dot').hidden });

      ui.setSharedEntries([velho]);
      const soVelho = estado();
      ui.setSharedEntries([velho, novo]);
      const dois = estado();
      n('#friends-grid .share-person').click();
      const corpo = n('#shared-detail-body');
      const titulos = [...corpo.querySelectorAll('.share-vendo-title')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
      const semDropdown = !corpo.querySelector('details');
      const ordem = { titulos, semDropdown, semPrazo: !/disponíveis|24h|você pode ver até/.test(corpo.textContent) };

      // o prazo do antigo passa: some sozinho, o novo continua
      const vencido = { ...velho, view: { ...velho.view, expiresAtMs: t - 1 } };
      ui.setSharedEntries([vencido, novo]);
      const semVelho = { estado: estado(), blocos: n('#shared-detail-body').querySelectorAll('.share-vendo-event').length };
      return { soVelho, dois, ordem, semVelho };
    });
    assert.deepEqual(r.soVelho, { verde: false, cinza: true, dot: false });
    assert.deepEqual(r.dois, { verde: true, cinza: false, dot: true });
    assert.equal(r.ordem.titulos.length, 2);
    assert.match(r.ordem.titulos[0], /^Jantar Em andamento$/);
    assert.match(r.ordem.titulos[1], /^Festa Encerrado às \d\d:\d\d$/);
    assert.equal(r.ordem.semDropdown, true, 'os anteriores aparecem direto, sem dropdown');
    assert.equal(r.ordem.semPrazo, true, 'sem texto de disponível até/24h para quem recebe');
    assert.deepEqual(r.semVelho, { estado: { verde: true, cinza: false, dot: true }, blocos: 1 });
    assert.deepEqual(erros, []);
  });
});

// Tamanho da dose aparece, e o "há X tempo" não é verde (verde no Histórico = intervalo
// já passou, o que aqui não existe). A interface limpa esconde "Começou…" e o resumo.
test('linha do tempo compartilhada mostra meia/inteira, chip neutro e respeita a interface limpa', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    const r = await page.evaluate(async () => {
      const { createShareUI } = await import('/funtime/src/sharing/share-ui.js');
      const n = (s) => document.querySelector(s);
      const nodes = {
        friendsGrid: n('#friends-grid'), friendsEmpty: n('#friends-empty'), sharedDetailDialog: n('#shared-detail-dialog'),
        sharedDetailTitle: n('#shared-detail-title'), sharedDetailTabs: n('#shared-detail-tabs'),
        sharedDetailTabVendo: n('#shared-detail-tab-vendo'), sharedDetailTabCompartilhando: n('#shared-detail-tab-compartilhando'),
        sharedDetailBody: n('#shared-detail-body'), homeFriendsDot: n('#home-friends-dot'), pairingError: n('#pairing-error'),
      };
      const t = Date.now();
      const ui = createShareUI({ nodes, getShareWriter: () => null, showToast() {} });
      ui.wire();
      ui.setPairings([{ pairId: 'p', otherUid: 'u', alias: 'Su', myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true, createdAt: t }]);
      const dose = (id, tamanho) => ({ id, consumedAt: t - 600000, drinkName: 'Cerveja', drinkIcon: '🍺', intervalMinutes: 60, doseSize: tamanho });
      ui.setSharedEntries([{ ownerUid: 'u', shareId: 'a', fromCache: false, receivedAtMs: t, view: { ownerAlias: 'Su', occasion: { name: 'Festa', startedAt: t - 3600000, endedAt: null }, totals: [{ icon: '🍺', name: 'Cerveja', count: 2 }], truncated: false, eventCount: 2, updatedAtMs: t, expiresAtMs: t + 86400000, events: [dose('1', 'half'), dose('2', 'full'), dose('3', null)] } }]);
      n('#friends-grid .share-person').click();
      const corpo = n('#shared-detail-body');
      const visivel = (el) => !!el && getComputedStyle(el).display !== 'none';
      const limpo = {
        comecou: visivel(corpo.querySelector('.share-vendo-start')),
        resumo: visivel(corpo.querySelector('.share-vendo-resumo')),
      };
      document.body.classList.remove('clean-mode');
      const completo = {
        comecou: visivel(corpo.querySelector('.share-vendo-start')),
        resumo: visivel(corpo.querySelector('.share-vendo-resumo')),
      };
      document.body.classList.add('clean-mode');
      const chip = corpo.querySelector('.history-event-elapsed');
      return {
        limpo, completo,
        tamanhos: [...corpo.querySelectorAll('.history-dose-badge')].map((e) => e.textContent),
        chipNeutro: chip.classList.contains('is-neutral') && !chip.classList.contains('is-after-interval'),
        corChip: getComputedStyle(chip).color,
      };
    });
    assert.deepEqual(r.limpo, { comecou: true, resumo: true }, 'início e resumo agora aparecem sempre, compactos');
    assert.deepEqual(r.completo, { comecou: true, resumo: true });
    assert.deepEqual(r.tamanhos.sort(), ['Inteira', 'Meia']);
    assert.equal(r.chipNeutro, true);
    assert.notEqual(r.corChip, 'rgb(141, 242, 187)', 'não é o verde do Histórico');
    assert.deepEqual(erros, []);
  });
});

// Copiar bebidas (spec 0032), com o app real e a nuvem falsa da ponte: a cópia recebida
// aparece no amigo, abre a MESMA prévia de "Importar bebidas", não grava nada antes de
// confirmar e, ao importar, preserva o histórico e sai da nuvem.
test('copiar bebidas: receber pela prévia de importação e enviar para um ou vários amigos', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      const agora = Date.now();
      state.drinks = [{ id: 'cerveja', name: 'Cerveja', icon: '🍺', intervalMinutes: 60, askDoseSize: false }];
      state.events = [{ id: 'e1', drinkId: 'cerveja', drinkName: 'Cerveja', drinkIcon: '🍺', intervalMinutes: 60, doseSize: null, consumedAt: agora - 3600000, occasionId: null }];
      saveData();
      render();
      const enviadaEm = agora - 5 * 60000;
      window.__chamadas = { send: [], markHandled: [] };
      window.__enviadaEm = enviadaEm;
      __funtimeCaptura.instalar({
        uid: 'eu', usuario: { uid: 'eu', email: 'eu@exemplo.com' }, eventos: null,
        // Gravar bebidas avisa o escritor (scheduleSharePush), como no app de verdade.
        escritor: { getGlobalAlias: async () => 'Eu', scheduleSharePush() {} },
        copias: {
          send: async (pedido) => { window.__chamadas.send.push(pedido); return { sentAtMs: Date.now(), state: 'ack', failed: [] }; },
          fetchIncoming: async () => ({ ok: true, expiresAtMs: enviadaEm + 86400000, drinks: [
            { name: 'Água', icon: '💧', intervalMinutes: 30, askDoseSize: false },
            { name: 'Cerveja', icon: '🍺', intervalMinutes: 60, askDoseSize: false },
          ] }),
          markHandled: async (...args) => { window.__chamadas.markHandled.push(args); __funtimeCaptura.definirCopiasRecebidas([]); },
        },
      });
      __funtimeCaptura.definirPareamentos([
        { pairId: 'p-bia', otherUid: 'bia', alias: 'Bia', myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true, createdAt: agora, drinkCopyFromOther: enviadaEm, drinkCopyFromMe: null },
        { pairId: 'p-caio', otherUid: 'caio', alias: 'Caio', myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true, createdAt: agora, drinkCopyFromOther: null, drinkCopyFromMe: null },
      ]);
      __funtimeCaptura.definirCopiasRecebidas([{ fromUid: 'bia', sentAtMs: enviadaEm, expiresAtMs: enviadaEm + 86400000 }]);
    });
    const dados = () => page.evaluate(() => localStorage.getItem(DATA_STORAGE_KEY));
    const antes = await dados();

    assert.equal(await page.locator('#home-friends-dot').isVisible(), true, 'cópia recebida acende o ponto de Amigos na Home');
    await page.locator('#home-friends-button').click();
    const bia = page.locator('#friends-grid .share-person', { hasText: 'Bia' });
    assert.equal(await bia.locator('.share-badge--drinks').count(), 1, 'selo de cópia no avatar de quem enviou');
    assert.match(await bia.getAttribute('aria-label'), /enviou uma cópia de bebidas/);
    assert.equal(await page.locator('#friends-grid .share-person', { hasText: 'Caio' }).locator('.share-badge--drinks').count(), 0);

    await bia.click();
    const cartao = page.locator('#shared-detail-drinks-in');
    assert.equal(await cartao.isVisible(), true);
    assert.match(await cartao.innerText(), /Receber cópia de bebidas de Bia\s+Enviada hoje às \d\d:\d\d · vale até amanhã às \d\d:\d\d/);
    assert.match(await page.locator('#shared-detail-drinks-out').innerText(), /Copiar bebidas para Bia\s+Envia uma cópia da sua lista atual/);

    await cartao.locator('.drink-copy-receive').click();
    await page.locator('#drink-import-dialog[open]').waitFor();
    assert.equal(await page.locator('#drink-import-file-name').textContent(), 'Enviadas por Bia');
    assert.match(await page.locator('#drink-import-file-summary').textContent(), /^2 bebidas na cópia · 1 duplicata exata$/);
    assert.equal(await page.locator('#drink-import-friend-note').isVisible(), true, 'aviso de que o intervalo não é recomendação');
    assert.equal(await dados(), antes, 'abrir a prévia não grava nada');
    assert.deepEqual(await page.evaluate(() => window.__chamadas.markHandled), [], 'nem marca a cópia como recebida');

    await page.locator('#confirm-drink-import').click();
    const depois = JSON.parse(await dados());
    assert.deepEqual(depois.drinks.map((drink) => drink.name), ['Cerveja', 'Água']);
    assert.deepEqual(depois.events, JSON.parse(antes).events, 'o histórico fica intacto');
    assert.deepEqual(await page.evaluate(() => window.__chamadas.markHandled), [['bia', await page.evaluate(() => window.__enviadaEm)]]);
    assert.equal(await cartao.isVisible(), false, 'importada, a cópia some do amigo');
    assert.equal(await page.locator('#home-friends-dot').isVisible(), false);

    // Enviar para a Bia pelo detalhe: a lista ATUAL, já com a Água importada.
    await page.locator('#shared-detail-drinks-out button').click();
    await page.waitForFunction(() => window.__chamadas.send.length === 1);
    const envio = await page.evaluate(() => window.__chamadas.send[0]);
    assert.deepEqual(envio.toUids, ['bia']);
    assert.deepEqual(envio.drinks.map((drink) => drink.name), ['Cerveja', 'Água']);
    await page.locator('#close-shared-detail').click();

    // Vários de uma vez, por Configurações.
    await page.evaluate(() => openSettingsView());
    await page.evaluate(() => document.querySelector('#copy-drinks-friends').click());
    await page.locator('#drink-copy-dialog[open]').waitFor();
    assert.match(await page.locator('#drink-copy-hint').textContent(), /lista atual \(2 bebidas\)/);
    const confirmar = page.locator('#drink-copy-confirm');
    assert.equal(await confirmar.isDisabled(), true);
    await page.locator('#drink-copy-grid .share-person', { hasText: 'Bia' }).click();
    await page.locator('#drink-copy-grid .share-person', { hasText: 'Caio' }).click();
    assert.equal(await confirmar.textContent(), 'Copiar para 2 amigos');
    await confirmar.click();
    await page.waitForFunction(() => !document.querySelector('#drink-copy-dialog').open);
    assert.deepEqual((await page.evaluate(() => window.__chamadas.send[1])).toUids.sort(), ['bia', 'caio']);

    assert.deepEqual(erros, []);
  });
});

test('sem amigos, "Copiar bebidas para amigos" não aparece em Configurações', { timeout: 30000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => openSettingsView());
    assert.equal(await page.locator('#copy-drinks-friends').isVisible(), false);
    assert.deepEqual(erros, []);
  });
});
