// Navegador real. Interface do evento compartilhado (spec 0025): convites recebidos, tela de
// convidados com as marcas ✉/✔, compartilhar doses em evento futuro e as linhas clicáveis do
// formulário e do detalhe. Sem conta e sem nuvem: monta as UIs sobre o DOM real com
// dependências falsas, no mesmo padrão de tests/sharing-ui-browser.test.cjs.
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
    await page.evaluate(SETUP_SCRIPT);

    await run(page, erros);
  } finally {
    await browser.close();
    server.close();
  }
}

// Os nós que as UIs esperam, pelos mesmos ids que app.js usa em sharingNodes.
const SETUP_SCRIPT = `(() => {
  const n = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  const nodes = {
    friendsInvites: n('#friends-invites'), friendsInvitesList: n('#friends-invites-list'),
    occasionInvites: n('#occasion-invites'), occasionInvitesList: n('#occasion-invites-list'), navOccasionDot: n('#nav-occasion-dot'),
    inviteSheetDialog: n('#invite-sheet-dialog'), inviteSheetTitle: n('#invite-sheet-title'), inviteSheetBody: n('#invite-sheet-body'),
    inviteSheetError: n('#invite-sheet-error'), inviteSheetAccept: n('#invite-sheet-accept'), inviteSheetDecline: n('#invite-sheet-decline'),
    closeInviteSheet: n('#close-invite-sheet'),
    eventInviteDialog: n('#event-invite-dialog'), eventInviteTitle: n('#event-invite-title'), eventInviteHint: n('#event-invite-hint'),
    eventInviteInfo: n('#event-invite-info'), eventInviteGrid: n('#event-invite-grid'), eventInviteEmpty: n('#event-invite-empty'),
    eventInviteCancel: n('#event-invite-cancel'), eventInviteConfirm: n('#event-invite-confirm'), closeEventInvite: n('#close-event-invite'),
    shareOccasionDialog: n('#share-occasion-dialog'), shareOccasionTitle: n('#share-occasion-title'), shareOccasionHint: n('#share-occasion-hint'),
    shareOccasionGrid: n('#share-occasion-grid'), shareOccasionEmpty: n('#share-occasion-empty'), shareOccasionConfirm: n('#share-occasion-confirm'),
    shareOccasionStopAll: n('#share-occasion-stop-all'), closeShareOccasion: n('#close-share-occasion'),
    friendsGrid: n('#friends-grid'), friendsEmpty: n('#friends-empty'), homeFriendsDot: n('#home-friends-dot'),
  };
  const par = (uid, alias) => ({ pairId: 'p-' + uid, otherUid: uid, alias, myAlias: 'Eu', acceptedByMe: true, acceptedByOther: true });
  window.__t = { n, all, nodes, par };
})()`;

test('sem conta, nada de convite aparece e o formulário do evento não ganha linhas', { timeout: 40000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      openOccasionEditor();
    });

    assert.equal(await page.locator('#occasion-dialog').evaluate((node) => node.open), true);
    assert.equal(await page.locator('#occasion-people-field').isVisible(), false, 'sem amigos, o formulário continua como era');
    assert.equal(await page.locator('#friends-invites').isVisible(), false);
    assert.equal(await page.locator('#invite-sheet-dialog').evaluate((node) => node.open), false);
    assert.equal(await page.locator('#event-invite-dialog').evaluate((node) => node.open), false);
    assert.deepEqual(erros, []);
  });
});

test('convite recebido: cartão, folha com Vou / Não vou e motivo quando não dá para aceitar', { timeout: 40000 }, async () => {
  await withPage(async (page, erros) => {
    const saida = await page.evaluate(async () => {
      const { createInviteUI } = await import('/funtime/src/sharing/invite-ui.js');
      const { n, all, nodes, par } = window.__t;
      const chamadas = []; let resposta = { ok: true }; const atencao = [];
      const ui = createInviteUI({
        nodes, showToast: (mensagem) => chamadas.push(['toast', mensagem]), getMyUid: () => 'eu',
        acceptInvite: async (convite) => { chamadas.push(['aceitar', convite.eventId]); return resposta; },
        declineInvite: async (convite) => { chamadas.push(['recusar', convite.eventId]); },
        onAttentionChange: (quantidade) => atencao.push(quantidade),
      });
      ui.wire();
      ui.setPairings([par('bia', 'Bia'), par('caio', 'Caio')]);
      const convite = { eventId: 'ev-1', hostUid: 'bia', name: 'Festa Junina', startAt: Date.now() + 86400000, endAt: null, going: ['caio'], invited: ['eu', 'caio'], status: 'active', expiresAtMs: Date.now() + 9e9 };

      const saida = { antes: n('#friends-invites').hidden };
      ui.setInvites([convite]);
      saida.cartao = { oculto: n('#friends-invites').hidden, texto: n('#friends-invites-list').innerText.replace(/\\s+/g, ' ') };
      saida.atencao = [...atencao];

      n('#friends-invites-list .agenda-row').click();
      saida.folha = { aberta: n('#invite-sheet-dialog').open, titulo: n('#invite-sheet-title').textContent, corpo: n('#invite-sheet-body').innerText.replace(/\\s+/g, ' ') };

      resposta = { ok: false, reason: 'cancelled' };
      n('#invite-sheet-accept').click(); await new Promise((r) => setTimeout(r, 30));
      saida.cancelado = { aberta: n('#invite-sheet-dialog').open, erro: n('#invite-sheet-error').textContent, erroVisivel: !n('#invite-sheet-error').hidden };

      resposta = { ok: true };
      n('#invite-sheet-accept').click(); await new Promise((r) => setTimeout(r, 30));
      saida.aceito = { aberta: n('#invite-sheet-dialog').open };

      n('#friends-invites-list .agenda-row').click();
      n('#invite-sheet-decline').click(); await new Promise((r) => setTimeout(r, 30));
      saida.recusado = { aberta: n('#invite-sheet-dialog').open };

      ui.setInvites([]);
      saida.vazio = { oculto: n('#friends-invites').hidden, atencao: [...atencao] };
      saida.chamadas = chamadas;
      return saida;
    });

    assert.equal(saida.antes, true);
    assert.equal(saida.cartao.oculto, false);
    assert.match(saida.cartao.texto, /Festa Junina.*Bia convidou você/);
    assert.deepEqual(saida.atencao, [1], 'convite pendente acende o ponto do ícone de Amigos');
    assert.equal(saida.folha.aberta, true);
    assert.equal(saida.folha.titulo, 'Festa Junina');
    assert.match(saida.folha.corpo, /Bia convidou você/);
    assert.match(saida.folha.corpo, /Amigos seus que vão: Caio/);
    assert.match(saida.folha.corpo, /não mostra suas doses/, 'o consentimento fica claro: ir ao evento não mostra doses');
    assert.deepEqual([saida.cancelado.aberta, saida.cancelado.erro, saida.cancelado.erroVisivel], [true, 'O organizador cancelou este evento.', true],
      'quando não dá para aceitar, a folha continua aberta e diz o motivo');
    assert.equal(saida.aceito.aberta, false);
    assert.equal(saida.recusado.aberta, false);
    assert.deepEqual(saida.chamadas.filter(([tipo]) => tipo !== 'toast'), [['aceitar', 'ev-1'], ['aceitar', 'ev-1'], ['recusar', 'ev-1']]);
    assert.deepEqual(saida.vazio, { oculto: true, atencao: [1, 0] });
    assert.deepEqual(erros, []);
  });
});

test('convidados: marcas ✉/✔ abaixo do avatar, afastadas dele, e só enquanto o evento não começou', { timeout: 40000 }, async () => {
  await withPage(async (page, erros) => {
    const saida = await page.evaluate(async () => {
      const { createInviteUI } = await import('/funtime/src/sharing/invite-ui.js');
      const { n, all, nodes, par } = window.__t;
      const ui = createInviteUI({ nodes, getMyUid: () => 'eu' });
      ui.wire();
      ui.setPairings([par('bia', 'Bia'), par('caio', 'Caio'), par('dino', 'Dino')]);
      ui.setEvents([{ eventId: 'ev', hostUid: 'eu', isHost: true, name: 'Festa', startAt: 1, endAt: null, status: 'active', invited: ['bia', 'caio'], going: ['bia'], expiresAtMs: Date.now() + 9e9 }]);

      const resultados = [];
      let escolha = null;
      const abrir = (ocasiao) => ui.openInviteDialog({ occasion: ocasiao, selected: new Set(['bia', 'caio']), onConfirm: (conjunto) => { escolha = [...conjunto].sort(); } });
      const pessoa = (nome) => [...all('#event-invite-grid .share-person')].find((el) => el.textContent.includes(nome));
      const marca = (nome) => pessoa(nome).querySelector('.share-mark')?.className.replace('share-mark ', '') ?? null;

      abrir({ id: 'o1', name: 'Festa', startedAt: null, sharedEventId: 'ev', sharedHostUid: 'eu' });
      const bia = pessoa('Bia'); const avatar = bia.querySelector('.share-avatar'); const faixa = bia.querySelector('.share-marks');
      const a = avatar.getBoundingClientRect(); const m = bia.querySelector('.share-mark').getBoundingClientRect();
      resultados.push({
        titulo: n('#event-invite-title').textContent,
        marcas: { bia: marca('Bia'), caio: marca('Caio'), dino: marca('Dino') },
        ordem: [...bia.children].map((el) => el.className.split(' ')[0]),
        abaixoDoAvatar: m.top - a.bottom,
        dentroDoAvatar: m.left >= a.left && m.right <= a.right && m.top < a.bottom,
        rotulo: bia.getAttribute('aria-label'),
        confirmarVisivel: !n('#event-invite-confirm').hidden,
        pressionados: [...all('#event-invite-grid .share-person')].map((el) => el.getAttribute('aria-pressed')),
      });

      pessoa('Dino').click();                                   // marca Dino
      n('#event-invite-confirm').click();
      resultados.push({ escolha, aberto: n('#event-invite-dialog').open });

      escolha = null;
      abrir({ id: 'o1', name: 'Festa', startedAt: null, sharedEventId: 'ev', sharedHostUid: 'eu' });
      pessoa('Caio').click();                                   // desmarca Caio, mas cancela
      n('#event-invite-cancel').click();
      resultados.push({ escolhaAoCancelar: escolha, aberto: n('#event-invite-dialog').open });

      abrir({ id: 'o1', name: 'Festa', startedAt: Date.now() - 1000, sharedEventId: 'ev', sharedHostUid: 'eu' });
      resultados.push({ marcasEmAndamento: n('#event-invite-grid').querySelectorAll('.share-mark').length, faixas: n('#event-invite-grid').querySelectorAll('.share-marks').length });
      ui.closeInviteDialog();
      return resultados;
    });

    const [inicial, aoConfirmar, aoCancelar, emAndamento] = saida;
    assert.equal(inicial.titulo, 'Convidados');
    assert.deepEqual(inicial.marcas, { bia: 'share-mark--going', caio: 'share-mark--invited', dino: null },
      'check = confirmou, envelope = convidado sem resposta, nada para quem não foi convidado');
    assert.deepEqual(inicial.ordem, ['share-avatar', 'share-marks', 'share-person-name'], 'a marca fica entre o avatar e o nome, fora do círculo');
    assert.ok(inicial.abaixoDoAvatar >= 2, `a marca precisa estar afastada do avatar (folga de ${inicial.abaixoDoAvatar}px)`);
    assert.equal(inicial.dentroDoAvatar, false, 'diferente das setas de vendo/compartilhando, não fica colada no círculo');
    assert.match(inicial.rotulo, /Bia · confirmou presença/, 'a informação nunca é só um ícone');
    assert.equal(inicial.confirmarVisivel, true);
    assert.deepEqual(inicial.pressionados, ['true', 'true', 'false']);
    assert.deepEqual(aoConfirmar, { escolha: ['bia', 'caio', 'dino'], aberto: false });
    assert.deepEqual(aoCancelar, { escolhaAoCancelar: null, aberto: false }, 'cancelar não devolve nada');
    assert.deepEqual(emAndamento, { marcasEmAndamento: 0, faixas: 0 }, 'com o evento em andamento as marcas somem');
    assert.deepEqual(erros, []);
  });
});

test('quem foi convidado só olha: vê os próprios amigos e uma contagem dos demais', { timeout: 40000 }, async () => {
  await withPage(async (page, erros) => {
    const saida = await page.evaluate(async () => {
      const { createInviteUI } = await import('/funtime/src/sharing/invite-ui.js');
      const { n, all, nodes, par } = window.__t;
      const ui = createInviteUI({ nodes, getMyUid: () => 'eu' });
      ui.wire();
      ui.setPairings([par('bia', 'Bia'), par('caio', 'Caio')]);
      const evento = (extra) => ({ eventId: 'ev', hostUid: 'org', isHost: false, name: 'Festa', startAt: 1, endAt: null, status: 'active', invited: ['eu', 'bia', 'x1', 'x2'], going: ['bia'], expiresAtMs: Date.now() + 9e9, ...extra });
      const ocasiao = { id: 'o1', name: 'Festa', startedAt: null, sharedEventId: 'ev', sharedHostUid: 'org' };

      ui.setEvents([evento({})]);
      ui.openInviteDialog({ occasion: ocasiao, selected: new Set() });
      const visao = {
        titulo: n('#event-invite-title').textContent,
        nomes: [...all('#event-invite-grid .share-person-name')].map((el) => el.textContent),
        tocavel: n('#event-invite-grid').querySelector('button') !== null,
        confirmarOculto: n('#event-invite-confirm').hidden,
        botao: n('#event-invite-cancel').textContent,
        info: n('#event-invite-info').textContent,
        marca: n('#event-invite-grid .share-mark')?.className ?? null,
      };

      ui.setEvents([evento({ status: 'cancelled' })]);
      const cancelado = n('#event-invite-info').textContent;
      ui.setEvents([{ eventId: 'ev', hostUid: 'org', isHost: false, gone: true }]);
      const retirado = n('#event-invite-info').textContent;
      return { visao, cancelado, retirado };
    });

    assert.equal(saida.visao.titulo, 'Quem vai');
    assert.deepEqual(saida.visao.nomes, ['Bia'], 'só amigos dele que estão na lista; Caio não foi convidado');
    assert.equal(saida.visao.tocavel, false, 'convidado não convida nem tira ninguém');
    assert.equal(saida.visao.confirmarOculto, true);
    assert.equal(saida.visao.botao, 'Fechar');
    assert.match(saida.visao.info, /Mais 3 pessoas que não são suas amigas estão na lista/, 'os demais (dois convidados e o organizador) viram só uma contagem');
    assert.equal(saida.visao.marca, 'share-mark share-mark--going');
    assert.match(saida.cancelado, /organizador cancelou/);
    assert.match(saida.retirado, /não está mais na lista/);
    assert.deepEqual(erros, []);
  });
});

test('compartilhar doses de um evento futuro guarda uma intenção e mostra o que já foi decidido ao convidar', { timeout: 40000 }, async () => {
  await withPage(async (page, erros) => {
    const saida = await page.evaluate(async () => {
      const { createShareUI } = await import('/funtime/src/sharing/share-ui.js');
      const { n, all, nodes, par } = window.__t;
      const chamadas = [];
      const ui = createShareUI({
        nodes, getShareWriter: () => null, showToast: (mensagem) => chamadas.push(['toast', mensagem]),
        setShareIntent: async (id, uids) => chamadas.push(['intencao', id, [...uids].sort()]),
        getEventRoster: (item) => (item.sharedEventId ? { invited: new Set(['bia', 'caio']), going: new Set(['bia']) } : null),
      });
      ui.wire();
      ui.setPairings([par('bia', 'Bia'), par('caio', 'Caio'), par('dino', 'Dino')]);

      const planejado = { id: 'o1', name: 'Festa', startedAt: null, sharedEventId: 'ev', shareWith: ['dino'] };
      const pessoa = (nome) => [...all('#share-occasion-grid .share-person')].find((el) => el.textContent.includes(nome));
      const estado = () => ({
        titulo: n('#share-occasion-title').textContent, dica: n('#share-occasion-hint').textContent, botao: n('#share-occasion-confirm').textContent,
        marcas: [...all('#share-occasion-grid .share-person')].map((el) => (el.querySelector('.share-mark')?.className.replace('share-mark share-mark--', '') ?? '-')),
        pressionados: [...all('#share-occasion-grid .share-person')].map((el) => el.getAttribute('aria-pressed')),
        pararTodos: !n('#share-occasion-stop-all').hidden,
      });

      ui.openShareOccasionDialog(planejado, []);
      const futuro = estado();
      pessoa('Bia').click();
      n('#share-occasion-confirm').click(); await new Promise((r) => setTimeout(r, 30));
      const aposConfirmar = { aberto: n('#share-occasion-dialog').open, chamadas: chamadas.filter(([t]) => t !== 'toast'), toast: chamadas.find(([t]) => t === 'toast')?.[1] };

      chamadas.length = 0;
      let escolhido = null;
      ui.openShareOccasionDialog(null, [], { planned: true, stage: { selected: new Set(['caio']), onConfirm: (c) => { escolhido = [...c]; } } });
      const escolha = { ...estado(), marcasNovo: n('#share-occasion-grid').querySelectorAll('.share-mark').length };
      n('#share-occasion-confirm').click();
      const aposEscolher = { escolhido, aberto: n('#share-occasion-dialog').open, chamadas: [...chamadas] };

      ui.openShareOccasionDialog({ id: 'o2', name: 'Agora', startedAt: Date.now() - 1000, sharedEventId: 'ev' }, []);
      const emAndamento = { ...estado(), marcas: [...all('#share-occasion-grid .share-mark')].length };
      ui.closeShareOccasionDialog();
      return { futuro, aposConfirmar, escolha, aposEscolher, emAndamento };
    });

    assert.equal(saida.futuro.titulo, 'Compartilhar doses · Festa');
    assert.match(saida.futuro.dica, /quando ele começar.*Nada é compartilhado antes disso/);
    assert.equal(saida.futuro.botao, 'Confirmar');
    assert.deepEqual(saida.futuro.marcas, ['going', 'invited', '-'], 'as marcas do convite aparecem na tela de compartilhar doses');
    assert.deepEqual(saida.futuro.pressionados, ['false', 'false', 'true'], 'parte da intenção já guardada (Dino)');
    assert.equal(saida.futuro.pararTodos, false, 'nada está sendo compartilhado ainda: não há o que parar');
    assert.equal(saida.aposConfirmar.aberto, false);
    assert.deepEqual(saida.aposConfirmar.chamadas, [['intencao', 'o1', ['bia', 'dino']]]);
    assert.match(saida.aposConfirmar.toast, /quando o evento começar/);
    assert.equal(saida.escolha.titulo, 'Compartilhar doses');
    assert.equal(saida.escolha.marcasNovo, 0, 'evento novo ainda não foi convidado a ninguém');
    assert.deepEqual(saida.aposEscolher, { escolhido: ['caio'], aberto: false, chamadas: [] }, 'no formulário só devolve a escolha; nada é aplicado agora');
    assert.equal(saida.emAndamento.marcas, 0, 'com o evento em andamento as marcas de convite somem');
    assert.equal(saida.emAndamento.botao, 'Compartilhar');
    assert.deepEqual(erros, []);
  });
});

test('formulário do evento: duas linhas clicáveis, escolha guardada até salvar', { timeout: 60000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      window.__chamadas = [];
      window.hasSharingFriends = () => true;
      window.openInviteDialog = (opcoes) => { window.__convidar = opcoes; };
      window.openShareOccasionDialog = (item, eventos, opcoes) => { window.__compartilhar = { item, opcoes }; };
      window.applyOccasionInvites = async (id, uids) => { window.__chamadas.push(['convidar', id, [...uids].sort()]); };
      openOccasionEditor();
    });

    assert.equal(await page.locator('#occasion-people-field').isVisible(), true);
    assert.equal(await page.locator('#occasion-invite-row').innerText().then((t) => t.replace(/\s+/g, ' ')), 'Convidados Ninguém ›');
    assert.equal(await page.locator('#occasion-share-row').innerText().then((t) => t.replace(/\s+/g, ' ')), 'Compartilhar doses Ninguém ›');
    assert.equal(await page.locator('#occasion-share-grid').count(), 0, 'o seletor de amigos em linha deixou de existir');

    await page.locator('#occasion-mode').selectOption('scheduled');
    await page.locator('#occasion-invite-row').click();
    await page.evaluate(() => window.__convidar.onConfirm(new Set(['bia', 'caio'])));
    await page.locator('#occasion-share-row').click();
    const abertura = await page.evaluate(() => ({ planejado: window.__compartilhar.opcoes.planned, semItem: window.__compartilhar.item === null }));
    await page.evaluate(() => window.__compartilhar.opcoes.stage.onConfirm(new Set(['dino'])));

    assert.deepEqual(abertura, { planejado: true, semItem: true });
    assert.equal(await page.locator('#occasion-invite-summary').textContent(), '2 pessoas ›');
    assert.equal(await page.locator('#occasion-share-summary').textContent(), '1 pessoa ›');

    await page.locator('#occasion-name').fill('Festa Junina');
    await page.evaluate(() => {
      const inicio = Date.now() + 3 * 86400000;
      document.getElementById('occasion-start').value = occasionInput(inicio);
      document.getElementById('occasion-start').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#occasion-submit').click();
    await page.waitForFunction(() => !document.getElementById('occasion-dialog').open);

    const salvo = await page.evaluate(() => ({ ocasiao: state.occasions[0], chamadas: window.__chamadas }));
    assert.equal(salvo.ocasiao.name, 'Festa Junina');
    assert.deepEqual(salvo.ocasiao.shareWith, ['dino'], 'evento futuro guarda a INTENÇÃO de compartilhar na própria ocasião');
    assert.deepEqual(salvo.chamadas, [['convidar', salvo.ocasiao.id, ['bia', 'caio']]], 'os convidados são aplicados ao salvar, uma vez');
    assert.deepEqual(erros, []);
  });
});

test('formulário: sem mexer nos convidados nada é enviado; evento em andamento não oferece compartilhar doses ao editar', { timeout: 60000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      commitOccasions([{ id: 'ativo', name: 'Em andamento', startedAt: Date.now() - 3600000, endedAt: null }], []);
      window.__chamadas = [];
      window.hasSharingFriends = () => true;
      window.applyOccasionInvites = async (id, uids) => { window.__chamadas.push([id, [...uids]]); };
      openOccasionEditor('ativo');
    });

    assert.equal(await page.locator('#occasion-invite-row').isVisible(), true);
    assert.equal(await page.locator('#occasion-share-row').isVisible(), false, 'compartilhar doses ao vivo mora no detalhe do evento');
    // "Salvar" só aparece depois de uma alteração (contrato dos formulários do app).
    await page.locator('#occasion-name').fill('Em andamento 2');
    await page.locator('#occasion-submit').click();
    await page.waitForFunction(() => !document.getElementById('occasion-dialog').open);

    assert.deepEqual(await page.evaluate(() => window.__chamadas), [], 'lista de convidados igual à de antes: nenhuma escrita');
    assert.deepEqual(erros, []);
  });
});

test('aceitar um convite cria a ocasião do convidado, só dele, com o vínculo', { timeout: 40000 }, async () => {
  await withPage(async (page, erros) => {
    const criada = await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      const inicio = Date.now() + 2 * 86400000;
      const item = createOccasionFromInvite({ eventId: 'ev-1', hostUid: 'org', name: '  Festa Junina  ', startAt: inicio, endAt: inicio + 6 * 3600000, timeZone: 'Fuso/Inexistente' });
      return { item, salvas: state.occasions.length, guardada: JSON.parse(localStorage.getItem(DATA_STORAGE_KEY)).occasions[0] };
    });

    assert.equal(criada.item.name, 'Festa Junina');
    assert.equal(criada.item.startedAt, null, 'nasce agendada: quem aceita decide quando iniciar');
    assert.equal(criada.item.autoStart, false, 'início manual, o padrão de qualquer agendamento');
    assert.equal(criada.item.sharedEventId, 'ev-1');
    assert.equal(criada.item.sharedHostUid, 'org');
    assert.ok(criada.item.sharedFichaKey, 'guarda o que já viu para só avisar de mudança nova');
    assert.notEqual(criada.item.timeZone, 'Fuso/Inexistente', 'fuso inválido cai para o do aparelho em vez de quebrar o app');
    assert.equal(criada.guardada.sharedEventId, 'ev-1', 'o vínculo é gravado no armazenamento local');
    assert.equal(criada.salvas, 1);
    assert.deepEqual(erros, []);
  });
});

test('detalhe do evento: linhas, aviso de mudança do organizador e sair do evento', { timeout: 60000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      const inicio = Date.now() + 2 * 86400000;
      commitOccasions([{ id: 'o1', name: 'Festa', startedAt: null, endedAt: null, scheduledStartAt: inicio, scheduledEndAt: null, autoStart: false, sharedEventId: 'ev', sharedHostUid: 'org', sharedFichaKey: 'antiga' }], []);
      window.hasSharingFriends = () => true;
      window.__estado = { atualizar: [], sair: [] };
      window.__info = { isHost: false, roster: { invited: new Set(['eu']), going: new Set(['bia']) }, view: { name: 'Festa no sítio', startAt: inicio + 3600000, endAt: null }, updateAvailable: true, cancelled: false, gone: false, invitedCount: 3, goingCount: 2 };
      window.getSharedEventInfo = () => window.__info;
      window.applySharedEventUpdate = (id, opcoes) => { window.__estado.atualizar.push([id, opcoes ?? null]); return true; };
      window.leaveSharedEvent = async (id) => { window.__estado.sair.push(id); };
      openOccasionDetails('o1');
    });

    const texto = () => page.locator('#occasion-detail-content').innerText().then((t) => t.replace(/\s+/g, ' '));
    let conteudo = await texto();
    assert.match(conteudo, /O organizador mudou o evento: Festa no sítio/);
    assert.match(conteudo, /Quem vai 2 vão ›/, 'convidado vê a contagem de quem vai, com o rótulo de quem só olha');
    assert.match(conteudo, /Compartilhar doses Ninguém ›/);
    assert.equal(await page.locator('#occasion-detail-content .occasion-people-row').count(), 2);

    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await page.getByRole('button', { name: 'Manter o meu' }).click();
    assert.deepEqual(await page.evaluate(() => window.__estado.atualizar), [['o1', null], ['o1', { keep: true }]]);

    await page.evaluate(() => { window.__info = { ...window.__info, updateAvailable: false, cancelled: true }; openOccasionDetails('o1'); });
    assert.match(await texto(), /O organizador cancelou este evento/);
    assert.equal(await page.locator('#occasion-detail-content').getByRole('button', { name: 'Sair do evento' }).count(), 1);

    await page.evaluate(() => { window.__info = null; openOccasionDetails('o1'); });
    conteudo = await texto();
    assert.match(conteudo, /Convidados Ninguém ›/, 'evento sem vínculo: quem organiza convida');
    assert.equal(await page.locator('#occasion-detail-content').getByRole('button', { name: 'Sair do evento' }).count(), 0, 'sem vínculo não há o que sair');

    await page.evaluate(() => { window.hasSharingFriends = () => false; openOccasionDetails('o1'); });
    assert.equal(await page.locator('#occasion-detail-content .occasion-people-row').count(), 0, 'sem amigos, o detalhe fica como era');
    assert.deepEqual(erros, []);
  });
});

// Estes três usam as PONTES REAIS do app (nenhum stub em openShareOccasionDialog nem em
// openInviteDialog): um teste anterior trocava essas funções por stubs e por isso não viu que a
// ponte de app.js descartava o terceiro argumento — em aparelho real, tocar em "Compartilhar
// doses" num evento novo não fazia nada.
test('formulário do evento: as duas linhas abrem as telas de verdade, pelas pontes do app', { timeout: 60000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      window.hasSharingFriends = () => true; // única função trocada: só liga as linhas
      openOccasionEditor();
    });

    await page.locator('#occasion-share-row').click();
    assert.equal(await page.locator('#share-occasion-dialog').evaluate((node) => node.open), true,
      'tocar em Compartilhar doses num evento NOVO precisa abrir a tela');
    assert.equal(await page.locator('#share-occasion-title').textContent(), 'Compartilhar doses');
    await page.locator('#close-share-occasion').click();
    assert.equal(await page.locator('#share-occasion-dialog').evaluate((node) => node.open), false);

    await page.locator('#occasion-invite-row').click();
    assert.equal(await page.locator('#event-invite-dialog').evaluate((node) => node.open), true);
    assert.equal(await page.locator('#event-invite-title').textContent(), 'Convidados');
    await page.locator('#close-event-invite').click();

    assert.equal(await page.locator('#occasion-dialog').evaluate((node) => node.open), true, 'o formulário continua aberto por baixo');
    assert.deepEqual(erros, [], 'nenhum erro engolido no caminho');
  });
});

test('detalhe do evento: as linhas abrem as telas de verdade, com evento agendado e em andamento', { timeout: 60000 }, async () => {
  await withPage(async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      commitOccasions([
        { id: 'futuro', name: 'Festa futura', startedAt: null, endedAt: null, scheduledStartAt: Date.now() + 86400000, scheduledEndAt: null, autoStart: false },
        { id: 'agora', name: 'Em andamento', startedAt: Date.now() - 3600000, endedAt: null },
      ], []);
      window.hasSharingFriends = () => true;
    });

    for (const [id, titulo] of [['futuro', 'Compartilhar doses · Festa futura'], ['agora', 'Compartilhar doses · Em andamento']]) {
      await page.evaluate((alvo) => openOccasionDetails(alvo), id);
      await page.locator('#occasion-detail-content .occasion-people-row', { hasText: 'Compartilhar doses' }).click();
      assert.equal(await page.locator('#share-occasion-dialog').evaluate((node) => node.open), true, id);
      assert.equal(await page.locator('#share-occasion-title').textContent(), titulo);
      await page.locator('#close-share-occasion').click();

      await page.locator('#occasion-detail-content .occasion-people-row', { hasText: 'Convidados' }).click();
      assert.equal(await page.locator('#event-invite-dialog').evaluate((node) => node.open), true, id);
      await page.locator('#close-event-invite').click();
    }
    assert.deepEqual(erros, []);
  });
});

test('convite pendente também aparece na aba Eventos, com um ponto no menu', { timeout: 40000 }, async () => {
  await withPage(async (page, erros) => {
    const saida = await page.evaluate(async () => {
      const { createInviteUI } = await import('/funtime/src/sharing/invite-ui.js');
      const { n, nodes, par } = window.__t;
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      const ui = createInviteUI({ nodes, getMyUid: () => 'eu' });
      ui.wire();
      ui.setPairings([par('su', 'Su')]);
      openOccasionView();

      const convite = { eventId: 'ev-1', hostUid: 'su', name: 'Morrin', startAt: Date.now() - 780000, endAt: null, going: [], invited: ['eu'], status: 'active', expiresAtMs: Date.now() + 9e9 };
      const vazio = { secao: n('#occasion-invites').hidden, ponto: n('#nav-occasion-dot').hidden };
      ui.setInvites([convite]);
      const comConvite = {
        secao: n('#occasion-invites').hidden, ponto: n('#nav-occasion-dot').hidden,
        eventos: n('#occasion-invites-list').innerText.replace(/\s+/g, ' '), amigos: n('#friends-invites-list').innerText.replace(/\s+/g, ' '),
        pontoVisivel: n('#nav-occasion-dot').getBoundingClientRect().width > 0,
      };
      n('#occasion-invites-list .agenda-row').click();
      const folha = { aberta: n('#invite-sheet-dialog').open, titulo: n('#invite-sheet-title').textContent };
      ui.setInvites([]);
      return { vazio, comConvite, folha, depois: { secao: n('#occasion-invites').hidden, ponto: n('#nav-occasion-dot').hidden } };
    });

    assert.deepEqual(saida.vazio, { secao: true, ponto: true }, 'sem convite, nada aparece');
    assert.equal(saida.comConvite.secao, false);
    assert.equal(saida.comConvite.ponto, false);
    assert.equal(saida.comConvite.pontoVisivel, true);
    assert.match(saida.comConvite.eventos, /Morrin.*Su convidou você/);
    assert.match(saida.comConvite.amigos, /Morrin.*Su convidou você/, 'continua também na tela Amigos');
    assert.deepEqual(saida.folha, { aberta: true, titulo: 'Morrin' });
    assert.deepEqual(saida.depois, { secao: true, ponto: true });
    assert.deepEqual(erros, []);
  });
});
