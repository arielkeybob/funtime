// Tópico: Eventos e agenda (spec 0026, marco 2).
module.exports = {
  id: 'eventos',
  titulo: 'Eventos e agenda',
  resumo: 'Ligar, criar, agendar e encerrar.',
  cobre: ['#occasion-view', '#occasion-dialog', '#occasion-detail-dialog', '#app-confirm-dialog', '#nav-occasion'],
  seed: 'demoEventos',
  passos: [
    {
      // Slide só de texto: o conceito de evento não aparece em nenhuma tela do app antes de ligar o recurso.
      tipo: 'texto',
      icone: '🎉',
      legenda: 'Um evento reúne os consumos de uma ocasião.',
      linhas: [
        'Pode ser uma festa, churrasco ou viagem.',
        'No Histórico, você filtra por evento.',
        'Dá para agendar para começar depois.',
        'É opcional: o app funciona sem eventos.',
      ],
    },
    {
      tipo: 'video',
      seed: 'demo',
      legenda: 'Em Configurações → Aparência, ative Usar eventos.',
      alt: 'A opção Usar eventos, em Configurações → Aparência, é tocada e liga; o app avisa que os eventos foram ativados.',
      async preparar(t) {
        await t.tocar('#open-settings');
        await t.tocar('[data-settings-open=appearance]');
        await t.esperar(300);
      },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('label[for=events-enabled]');
        await t.esperarAvisoSumir();
        await t.esperar(1200);
      },
    },
    {
      tipo: 'imagem',
      legenda: 'A aba Evento aparece no menu de baixo.',
      alt: 'Tela inicial com a aba Evento, recém-criada, em destaque no menu de baixo.',
      async antes(t) { await t.tocar('#nav-home'); await t.esperar(300); },
      destaque: '#nav-occasion',
    },
    {
      tipo: 'video',
      legenda: 'Na aba Evento, toque em + Novo.',
      alt: 'A aba Evento é tocada e, na lista de eventos, o botão + Novo é tocado e abre o formulário Novo evento.',
      async preparar(t) { await t.esperar(300); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#nav-occasion');
        await t.page.waitForSelector('#occasion-view:not([hidden])');
        await t.esperar(700);
        await t.tocarComDedo('#occasion-new', { antes: 400, descida: 700 });
        await t.page.waitForSelector('#occasion-dialog[open]');
        await t.esperar(1800);
      },
    },
    {
      tipo: 'video',
      legenda: 'Dê um nome e toque em Iniciar evento.',
      alt: 'O nome Churrasco do João é digitado no formulário Novo evento e o botão Iniciar evento é tocado.',
      async preparar(t) {
        await t.tocar('#nav-occasion');
        await t.tocar('#occasion-new');
        await t.page.waitForSelector('#occasion-dialog[open]');
        await t.esperar(300);
      },
      async gravar(t) {
        await t.esperar(1200);
        await t.digitar('#occasion-name', 'Churrasco do João');
        await t.esperar(600);
        await t.tocarComDedo('#occasion-submit', { antes: 400, descida: 700 });
        await t.page.waitForFunction(() => !document.querySelector('#occasion-dialog').open);
        await t.esperarAvisoSumir();
        await t.esperar(1000);
      },
    },
    {
      tipo: 'imagem',
      seed: 'demoEventoAtivo',
      legenda: 'As doses que você registrar entram no evento em andamento.',
      alt: 'Tela inicial com o evento Churrasco do João em andamento, em destaque no topo, e os cartões das bebidas.',
      async antes(t) { await t.tocar('#nav-home'); await t.esperar(300); },
      destaque: '#home-occasion',
    },
    {
      tipo: 'imagem',
      seed: 'demoEventos',
      legenda: 'Para agendar, troque para Escolher data.',
      alt: 'Formulário Novo evento com a opção Escolher data selecionada em Quando começar?, em destaque.',
      async antes(t) {
        await t.tocar('#nav-occasion');
        await t.tocar('#occasion-new');
        await t.page.waitForSelector('#occasion-dialog[open]');
        await t.page.locator('#occasion-mode').selectOption('scheduled');
        await t.esperar(400);
      },
      destaque: '#occasion-mode',
    },
    {
      tipo: 'video',
      seed: 'demoEventoAtivo',
      legenda: 'No evento, toque em Encerrar evento e confirme.',
      alt: 'No detalhe do evento em andamento, o botão Encerrar evento é tocado e, na confirmação, o botão Encerrar também.',
      async preparar(t) {
        await t.tocar('#nav-occasion');
        await t.tocar('#occasion-current button');
        await t.page.waitForSelector('#occasion-detail-dialog[open]');
        await t.esperar(300);
      },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#occasion-detail-content .occasion-actions .primary-button');
        await t.page.waitForSelector('#app-confirm-dialog[open]');
        await t.esperar(1200);
        await t.tocarComDedo('#app-confirm-accept', { antes: 400, descida: 700 });
        await t.page.waitForFunction(() => !document.querySelector('#app-confirm-dialog').open);
        await t.esperarAvisoSumir();
        await t.esperar(1000);
      },
    },
  ],
};
