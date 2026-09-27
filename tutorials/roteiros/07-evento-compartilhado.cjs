// Tópico: Evento compartilhado (spec 0026, marco 3; funcionalidade da spec 0025). Interface REAL sobre a
// "nuvem" falsa (ponte do dev server). A ideia central: convidar mostra só o evento, nunca as doses.
module.exports = {
  id: 'evento-compartilhado',
  titulo: 'Evento compartilhado',
  resumo: 'Convidar amigos e aceitar.',
  cobre: ['#occasion-dialog', '#event-invite-dialog', '#invite-sheet-dialog', '#occasion-detail-dialog', '#friends-invites', '#occasion-view'],
  seed: 'demoConvite',
  passos: [
    {
      tipo: 'video',
      legenda: 'No evento, toque em Convidados e escolha os amigos.',
      alt: 'No formulário Novo evento, a linha Convidados é tocada; Bia e Caio são escolhidos e confirmados, e a linha passa a mostrar 2 pessoas.',
      async preparar(t) {
        await t.tocar('#nav-occasion');
        await t.tocar('#occasion-new');
        await t.page.waitForSelector('#occasion-dialog[open]');
        await t.esperar(300);
      },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#occasion-invite-row');
        await t.page.waitForSelector('#event-invite-dialog[open]');
        await t.esperar(900);
        await t.tocarComDedo('#event-invite-grid .share-person:nth-child(1)', { antes: 350, descida: 650, pausa: 200 });
        await t.tocarComDedo('#event-invite-grid .share-person:nth-child(2)', { antes: 300, descida: 600, pausa: 200 });
        await t.esperar(700);
        await t.tocarComDedo('#event-invite-confirm', { antes: 350, descida: 650, pausa: 200 });
        await t.page.waitForFunction(() => !document.querySelector('#event-invite-dialog').open);
        await t.esperar(500);
        await t.destacar('#occasion-invite-row');
        await t.esperar(1800);
      },
    },
    {
      tipo: 'imagem',
      legenda: 'Convidar mostra só o evento; as doses são outra escolha.',
      alt: 'Formulário Novo evento com as duas linhas em destaque: Convidados, que mostra só o evento, e Compartilhar doses, que é uma escolha separada.',
      async antes(t) {
        await t.tocar('#nav-occasion');
        await t.tocar('#occasion-new');
        await t.page.waitForSelector('#occasion-dialog[open]');
        await t.esperar(400);
      },
      destaque: ['#occasion-invite-row', '#occasion-share-row'],
    },
    {
      tipo: 'video',
      legenda: 'Quem é convidado responde Vou ou Não vou na aba Evento.',
      alt: 'A aba Evento é tocada e mostra, no topo de Próximos, o convite Festa Junina, da Bia, aguardando resposta; o botão Vou é tocado e o app avisa que o evento foi para a agenda.',
      async preparar(t) { await t.esperar(300); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#nav-occasion');
        await t.page.waitForSelector('#occasion-view:not([hidden])');
        await t.page.waitForSelector('#occasion-invites .invite-row');
        await t.esperar(1600);
        await t.tocarComDedo('#occasion-invites .invite-row .primary-button', { antes: 400, descida: 700 });
        await t.page.waitForFunction(() => !document.querySelector('#occasion-invites .invite-row'));
        await t.esperarAvisoSumir();
        await t.esperar(1000);
      },
    },
    {
      tipo: 'imagem',
      seed: 'demoConviteEnviado',
      legenda: '✉ foi convidado; ✔ já confirmou que vai.',
      alt: 'Lista de convidados de uma festa agendada: a Bia tem o símbolo de envelope, convidada sem resposta; o Caio tem o símbolo de confirmado; a Duda não foi convidada.',
      async antes(t) {
        // O formulário do passo anterior ainda está aberto nesta página: fecha antes de navegar.
        await t.tocar('#occasion-cancel');
        await t.page.waitForFunction(() => !document.querySelector('#occasion-dialog').open);
        await t.tocar('#nav-occasion');
        await t.tocar('#agenda-upcoming');
        await t.tocar('#occasion-list .agenda-row, #occasion-list button');
        await t.page.waitForSelector('#occasion-detail-dialog[open]');
        await t.tocar('#occasion-detail-dialog button:has-text("Convidados")');
        await t.page.waitForSelector('#event-invite-dialog[open]');
        await t.esperar(400);
      },
      destaque: '#event-invite-grid',
    },
  ],
};
