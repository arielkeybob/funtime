// Navegador real. A tela Eventos redesenhada (v2.21.0): convites no topo de Próximos com Vou / Não vou,
// reserva na tela Amigos, busca só com muitos eventos, linhas enxutas, agendamento vencido com
// "Aguardando início" (sem grupo próprio) e cartão do evento em andamento.
//
// Usa o app REAL com a "nuvem" falsa do harness dos tutoriais (scripts/tutorials/lib.cjs → abrirApp),
// não uma segunda instância montada à mão: assim as pontes de app.js (pendingInviteCount,
// refreshInviteViews, getSharedEventInfo...) são exercitadas de verdade. Uma ponte trocada por stub foi o
// que escondeu o defeito da v2.17.1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');
const { abrirApp } = require('../scripts/tutorials/lib.cjs');

async function comApp(seed, executar) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });

  try {
    const { context, page, erros } = await abrirApp(browser, server.address().port, { seed });
    try { await executar(page, erros); } finally { await context.close(); }
  } finally {
    await browser.close();
    server.close();
  }
}

const texto = (page, seletor) => page.locator(seletor).innerText().then((valor) => valor.replace(/\s+/g, ' ').trim());
const aviso = (page) => page.locator('#toast-message').textContent();

// Ocasiões agendadas (futuras) para encher a lista, relativas ao relógio fixo do harness.
const AGENDADOS = (quantidade, prefixo = 'Agenda') => `Array.from({ length: ${quantidade} }, (_, i) => ({
  id: '${prefixo}' + i, name: '${prefixo} ' + String(i).padStart(3, '0'), startedAt: null, endedAt: null,
  scheduledStartAt: Date.now() + (i + 1) * 86400000, autoStart: false,
}))`;

test('convite recebido: grupo no topo de Próximos, com Vou / Não vou, e um ponto quando a aba é outra', { timeout: 90000 }, async () => {
  await comApp('demoConvite', async (page, erros) => {
    // A barra de baixo aparece no primeiro ciclo do relógio do app: espera em vez de perguntar na hora.
    await page.locator('#nav-occasion-dot').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await page.locator('#home-friends-dot').isVisible(), false,
      'com Eventos ligado o ponto de Amigos não sinaliza convite (só compartilhamento ao vivo)');

    await page.locator('#nav-occasion').click();
    assert.equal(await page.locator('#agenda-upcoming').getAttribute('aria-pressed'), 'true', 'com convite, a tela abre em Próximos');

    const grupo = page.locator('#occasion-invites');
    assert.equal(await grupo.isVisible(), true);
    assert.match(await texto(page, '#occasion-invites'), /^Aguardando sua resposta/);
    assert.match(await texto(page, '#occasion-invites'), /Ir a um evento não mostra suas doses a ninguém/, 'o consentimento fica visível no grupo');
    const linha = page.locator('#occasion-invites .invite-row');
    assert.equal(await linha.count(), 1);
    assert.match(await linha.innerText(), /Festa Junina[\s\S]*de Bia · (seg|ter|qua|qui|sex|sáb|dom) \d{2}\/\d{2} · \d{2}:\d{2}/);
    assert.deepEqual(await linha.locator('.invite-row-actions button').allTextContents(), ['Vou', 'Não vou']);
    assert.equal(await linha.evaluate((no) => no.tagName), 'DIV', 'linha não é um botão: botões aninhados são inválidos');

    // Em Anteriores o grupo some e a aba Próximos ganha um ponto.
    await page.locator('#agenda-past').click();
    assert.equal(await grupo.isVisible(), false);
    assert.equal(await page.locator('#agenda-upcoming-dot').isVisible(), true);
    assert.deepEqual(await page.locator('.agenda-tabs button').allTextContents(), ['Anteriores', 'Próximos'], 'o ponto não muda o texto das abas');
    await page.locator('#agenda-upcoming').click();
    assert.equal(await grupo.isVisible(), true);
    assert.equal(await page.locator('#agenda-upcoming-dot').isVisible(), false);

    // A tela Amigos não repete o convite quando Eventos está ligado.
    await page.evaluate(() => openSharedView());
    assert.equal(await page.locator('#friends-invites').isVisible(), false, 'Amigos só mostra o convite como reserva');
    assert.deepEqual(erros, []);
  });
});

test('Vou em um toque: cria o evento na agenda do convidado, com o vínculo, e o convite sai do grupo', { timeout: 90000 }, async () => {
  await comApp('demoConvite', async (page, erros) => {
    await page.locator('#nav-occasion').click();

    await page.locator('#occasion-invites .invite-row .primary-button').click();
    await page.waitForFunction(() => /Você vai/.test(document.querySelector('#toast-message')?.textContent || ''));

    const criada = await page.evaluate(() => state.occasions.find((item) => item.sharedEventId === 'ev-bia'));
    assert.equal(criada.name, 'Festa Junina');
    assert.equal(criada.sharedHostUid, 'bia');
    assert.equal(criada.startedAt, null, 'nasce agendada, de início manual');

    // O módulo real devolveria a lista sem o convite aceito; a nuvem falsa não emite, então o teste emite.
    await page.evaluate(() => globalThis.__funtimeCaptura.definirConvites([]));
    assert.equal(await page.locator('#occasion-invites').isVisible(), false);
    assert.equal(await page.locator('#nav-occasion-dot').isVisible(), false);
    const linha = page.locator('#occasion-list .agenda-row', { hasText: 'Festa Junina' });
    assert.match(await linha.innerText(), /de Bia/, 'a linha do evento aceito diz de quem é');
    assert.deepEqual(erros, []);
  });
});

test('Não vou em um toque: descarta o convite com aviso claro, sem abrir a folha', { timeout: 90000 }, async () => {
  await comApp('demoConvite', async (page, erros) => {
    await page.locator('#nav-occasion').click();

    await page.locator('#occasion-invites .invite-row .secondary-button').click();
    await page.waitForFunction(() => /Convite descartado/.test(document.querySelector('#toast-message')?.textContent || ''));

    assert.match(await aviso(page), /Quem convidou não é avisado/);
    assert.equal(await page.locator('#invite-sheet-dialog').evaluate((no) => no.open), false);
    assert.deepEqual(erros, []);
  });
});

test('tocar no cabeçalho do convite abre os detalhes (quem mais vai), sem responder', { timeout: 90000 }, async () => {
  await comApp('demoConvite', async (page, erros) => {
    await page.locator('#nav-occasion').click();

    await page.locator('#occasion-invites .invite-row-head').click();

    assert.equal(await page.locator('#invite-sheet-dialog').evaluate((no) => no.open), true);
    assert.equal(await page.locator('#invite-sheet-title').textContent(), 'Festa Junina');
    assert.match(await texto(page, '#invite-sheet-body'), /Amigos seus que vão: Caio/);
    assert.deepEqual(erros, []);
  });
});

// Ligar/desligar Eventos muda o lugar do convite. Só a ponte REAL refreshInviteViews faz a tela reagir.
test('Eventos desligado: o convite continua em Amigos, com o ponto de Amigos; ligar de novo o leva para Eventos', { timeout: 90000 }, async () => {
  await comApp('demoConvite', async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), false);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      refreshOccasionContext();
    });

    assert.equal(await page.locator('#nav-occasion').isVisible(), false, 'sem Eventos não existe a aba');
    assert.equal(await page.locator('#home-friends-dot').isVisible(), true, 'o ponto de Amigos avisa do convite');
    await page.evaluate(() => openSharedView());
    assert.equal(await page.locator('#friends-invites').isVisible(), true);
    assert.match(await texto(page, '#friends-invites'), /Convites[\s\S]*Festa Junina[\s\S]*de Bia/);

    // Vou sem Eventos ligado oferece ligar; aceitar leva o convite para a aba Eventos.
    await page.locator('#friends-invites .invite-row .primary-button').click();
    await page.locator('#app-confirm-accept').click();
    await page.waitForFunction(() => /Você vai/.test(document.querySelector('#toast-message')?.textContent || ''));
    assert.equal(await page.evaluate(() => state.preferences.eventsEnabled), true);
    assert.equal(await page.locator('#friends-invites').isVisible(), false, 'com Eventos ligado o cartão de Amigos sai');
    assert.equal(await page.locator('#home-friends-dot').isVisible(), false);
    assert.deepEqual(erros, []);
  });
});

test('busca: só aparece com muitos eventos, limpa com ✕ e cada abertura da tela começa sem filtro', { timeout: 90000 }, async () => {
  await comApp('vazio', async (page, erros) => {
    const abrir = async () => { await page.locator('#nav-home').click(); await page.locator('#nav-occasion').click(); };
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
    });

    await page.evaluate(`commitOccasions(${AGENDADOS(7)}, [])`);
    await page.locator('#nav-occasion').click();
    assert.equal(await page.locator('#agenda-search-field').isVisible(), false, 'com 7 eventos a lista inteira cabe: sem busca');
    assert.equal(await page.locator('.agenda-filters').count(), 0, 'o painel recolhido "Buscar e filtrar" não existe mais');
    assert.equal(await page.locator('#agenda-month').count(), 0, 'nem o filtro de mês');

    await page.evaluate(`commitOccasions(${AGENDADOS(12)}, [])`);
    await abrir();
    assert.equal(await page.locator('#agenda-search-field').isVisible(), true, 'com 12 eventos a busca aparece, sem abrir nada');
    assert.equal(await page.locator('#agenda-search-clear').isVisible(), false, 'nada digitado: sem ✕');

    await page.locator('#agenda-search').fill('Agenda 005');
    assert.equal(await page.locator('#occasion-list .agenda-row').count(), 1);
    assert.equal(await page.locator('#agenda-search-clear').isVisible(), true);
    await page.locator('#agenda-search-clear').click();
    assert.equal(await page.locator('#agenda-search').inputValue(), '');
    assert.equal(await page.locator('#occasion-list .agenda-row').count(), 12);

    await page.locator('#agenda-search').fill('zzz');
    assert.equal(await texto(page, '#occasion-list'), 'Nenhum evento encontrado.');
    await abrir();
    assert.equal(await page.locator('#agenda-search').inputValue(), '', 'reabrir a tela zera a busca: nada de filtro escondido');
    assert.equal(await page.locator('#occasion-list .agenda-row').count(), 12);
    assert.deepEqual(erros, []);
  });
});

test('linhas da agenda: mês em minúscula no "de", data legível, sem "0 registros" e marca de compartilhado', { timeout: 90000 }, async () => {
  await comApp('demoConviteEnviado', async (page, erros) => {
    // Além da festa que EU organizo (2 convidados, 1 vai), um evento de convite aceito e um comum com registro.
    await page.evaluate(() => {
      const agora = Date.now();
      commitOccasions([
        ...state.occasions,
        { id: 'aceito', name: 'Churrasco da Bia', startedAt: null, endedAt: null, scheduledStartAt: agora + 9 * 86400000, autoStart: false, sharedEventId: 'ev-x', sharedHostUid: 'bia' },
        { id: 'auto', name: 'Balada', startedAt: null, endedAt: null, scheduledStartAt: agora + 40 * 86400000, autoStart: true },
      ], state.events);
    });
    await page.locator('#nav-occasion').click();

    const cabecalhos = await page.locator('#occasion-list .agenda-month-heading').evaluateAll((nos) => nos.map((no) => ({
      cru: no.textContent, aparenteNoElemento: getComputedStyle(no).textTransform, primeiraLetra: getComputedStyle(no, '::first-letter').textTransform,
    })));
    assert.ok(cabecalhos.length >= 2);
    for (const cabecalho of cabecalhos) {
      assert.match(cabecalho.cru, /^[a-zç]+ de \d{4}$/, 'o texto guarda o "de" em minúscula');
      assert.equal(cabecalho.aparenteNoElemento, 'none', 'nada de capitalize: ele produzia "Setembro De 2026"');
      assert.equal(cabecalho.primeiraLetra, 'uppercase', 'só a primeira letra em maiúscula');
    }

    const festa = page.locator('#occasion-list .agenda-row', { hasText: 'Festa Junina' });
    const dados = (await festa.innerText()).replace(/\s+/g, ' ');
    assert.match(dados, /(seg|ter|qua|qui|sex|sáb|dom) \d{2}\/\d{2} · \d{2}:\d{2}/, 'data legível, sem ponto na abreviação');
    assert.doesNotMatch(dados, /registro/, 'evento futuro sem registro não diz "0 registros"');
    assert.doesNotMatch(dados, /Início manual/, 'o padrão não precisa ser dito');
    assert.match(dados, /2 convidados · 1 vai/, 'meu evento com convidados mostra quantos foram e quantos vão');

    assert.match(await texto(page, '#occasion-list .agenda-row:has-text("Churrasco da Bia")'), /de Bia/);
    assert.match(await texto(page, '#occasion-list .agenda-row:has-text("Balada")'), /Inicia sozinho/);
    assert.deepEqual(erros, []);
  });
});

test('agendamento que já passou do horário fica em Próximos, no seu mês, com "Aguardando início"', { timeout: 90000 }, async () => {
  await comApp('vazio', async (page, erros) => {
    await page.evaluate(() => {
      const proximo = FunTimeOccasions.configure(buildCurrentAppData(), true);
      commitOccasions(proximo.occasions, proximo.events, proximo.preferences);
      const agora = Date.now();
      commitOccasions([
        { id: 'atrasado', name: 'Amanhã', startedAt: null, endedAt: null, scheduledStartAt: agora - 7 * 86400000, autoStart: false },
        { id: 'futuro', name: 'Ruwpulse', startedAt: null, endedAt: null, scheduledStartAt: agora + 5 * 86400000, autoStart: false },
      ], []);
    });
    await page.locator('#nav-occasion').click();

    const cabecalhos = await page.locator('#occasion-list .agenda-month-heading').allTextContents();
    assert.ok(cabecalhos.length >= 1);
    for (const cabecalho of cabecalhos) assert.match(cabecalho, /^[a-zç]+ de \d{4}$/, 'só grupos de mês: não existe grupo "Passou do horário"');
    assert.equal(await page.locator('#occasion-list .is-overdue').count(), 0);
    const linhas = await page.locator('#occasion-list .agenda-row').allInnerTexts();
    assert.match(linhas[0], /Amanhã/, 'o atrasado continua antes do futuro, por data');
    assert.match(linhas[1], /Ruwpulse/);
    assert.match(await texto(page, '#occasion-list .agenda-row:has-text("Amanhã")'), /Aguardando início/, 'a linha avisa que o horário já passou');
    assert.doesNotMatch(await texto(page, '#occasion-list .agenda-row:has-text("Ruwpulse")'), /Aguardando início/);
    assert.deepEqual(erros, []);
  });
});

test('evento em andamento: cartão em destaque no topo, e não mais uma linha comum', { timeout: 90000 }, async () => {
  await comApp('demo', async (page, erros) => {
    await page.evaluate(() => globalThis.__semear({ eventoAtivo: true }));
    await page.locator('#nav-occasion').click();

    const cartao = page.locator('#occasion-current .occasion-current-card');
    assert.equal(await cartao.count(), 1);
    assert.equal(await cartao.evaluate((no) => no.classList.contains('agenda-row')), true, 'continua sendo uma linha clicável');
    const dados = (await cartao.innerText()).replace(/\s+/g, ' ');
    assert.match(dados, /Em andamento/i);
    assert.match(dados, /Churrasco do João/);
    assert.match(dados, /desde (seg|ter|qua|qui|sex|sáb|dom) \d{2}\/\d{2} · \d{2}:\d{2}/);
    assert.match(dados, /2 registros/);
    assert.notEqual(await cartao.evaluate((no) => getComputedStyle(no).boxShadow), 'none', 'tem o brilho de "em andamento"');

    await cartao.click();
    assert.equal(await page.locator('#occasion-detail-dialog').evaluate((no) => no.open), true);
    assert.deepEqual(erros, []);
  });
});
