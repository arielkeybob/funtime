// Tópico: Amigos e compartilhar doses (spec 0026, marco 3). Usa a interface REAL sobre uma "nuvem"
// falsa (seeds demoAmigos/demoConvite, ponte do dev server): não há login nem Firebase na captura.
// Ser amigo não mostra nada; compartilhar é uma ação separada, por evento e por pessoa.
module.exports = {
  id: 'amigos',
  titulo: 'Amigos e compartilhar doses',
  resumo: 'Conectar, mostrar as doses e trocar bebidas.',
  cobre: ['#sync-sign-in', '#home-friends-button', '#shared-view', '#pairing-dialog', '#shared-detail-dialog'],
  seed: 'demo',
  passos: [
    {
      tipo: 'imagem',
      legenda: 'A função Amigos precisa da Conta Google: entre em Backup e conta.',
      alt: 'Tela Backup e conta com o botão Entrar com Google, no cartão Sincronizar entre aparelhos, em destaque.',
      async antes(t) {
        await t.tocar('#open-settings');
        await t.tocar('[data-settings-open=backup]');
        await t.esperar(300);
      },
      destaque: '#sync-sign-in',
    },
    {
      tipo: 'video',
      seed: 'demoAmigos',
      legenda: 'Com a conta conectada, toque no ícone Amigos da tela inicial.',
      alt: 'Na tela inicial, o ícone Amigos, no canto superior direito, é tocado e abre a tela Amigos com Bia, Caio e Duda.',
      async preparar(t) { await t.esperar(300); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#home-friends-button');
        await t.page.waitForSelector('#shared-view:not([hidden])');
        await t.esperar(3000);
      },
    },
    {
      tipo: 'video',
      seed: 'demoAmigos',
      legenda: 'Toque em + e mostre ou copie o código para a outra pessoa, ou digite o dela.',
      alt: 'Na tela Amigos, o botão + é tocado e abre Adicionar amigo; o botão Gerar código é tocado e aparecem o código com QR, o botão Copiar código e o tempo de validade.',
      async preparar(t) { await t.tocar('#home-friends-button'); await t.esperar(400); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#friends-add');
        await t.page.waitForSelector('#pairing-dialog[open]');
        await t.esperar(900);
        await t.tocarComDedo('#pairing-generate', { antes: 400, descida: 700 });
        await t.page.waitForFunction(() => document.querySelector('#pairing-code-display').textContent.includes('K7M'));
        await t.esperar(3200);
      },
    },
    {
      // Slide só de texto (sem tela do app): apresenta a ideia antes de mostrar a tela.
      tipo: 'texto',
      icone: '🤝',
      legenda: 'Você pode compartilhar seu consumo com um amigo se quiser.',
      linhas: [
        'Só compartilha se você quiser: a escolha é sua.',
        'Você decide com quem e em qual evento.',
        'Seu amigo vê só as doses daquele evento.',
        'Você pode parar quando quiser.',
      ],
    },
    {
      tipo: 'imagem',
      seed: 'demoAmigos',
      legenda: 'O fato de ser amigo não mostra nada. É preciso compartilhar.',
      alt: 'Detalhe de um amigo, na aba Compartilhando, com o evento Churrasco do João, em andamento e ainda não compartilhado, em destaque.',
      async antes(t) {
        await t.tocar('#nav-home');
        await t.tocar('#home-friends-button');
        await t.tocar('#friends-grid button');
        await t.page.waitForSelector('#shared-detail-dialog[open]');
        await t.tocar('#shared-detail-tab-compartilhando');
        await t.esperar(400);
      },
      destaque: '#shared-detail-body .share-active-row',
    },
    {
      // Explica em palavras simples que compartilhar acontece dentro de um evento.
      tipo: 'texto',
      icone: '🎉',
      legenda: 'Compartilhar funciona dentro de um evento.',
      linhas: [
        'Primeiro, precisa estar rolando um evento.',
        'Tudo que for consumido nele pode ser compartilhado, ou não.',
        'Você escolhe com quais amigos: um ou mais.',
      ],
    },
    {
      tipo: 'video',
      seed: 'demoAmigos',
      legenda: 'Toque no amigo, em Compartilhando e em Compartilhar.',
      alt: 'Um amigo é tocado, depois a aba Compartilhando e o botão Compartilhar; o evento passa a aparecer com o selo Ao vivo e o botão Parar.',
      async preparar(t) { await t.tocar('#home-friends-button'); await t.esperar(400); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#friends-grid button');
        await t.page.waitForSelector('#shared-detail-dialog[open]');
        await t.esperar(1000);
        await t.tocarComDedo('#shared-detail-tab-compartilhando', { antes: 400, descida: 700 });
        await t.esperar(900);
        await t.tocarComDedo('#shared-detail-body .share-start-button', { antes: 400, descida: 700 });
        await t.page.waitForSelector('#shared-detail-body .share-stop-button');
        await t.esperarAvisoSumir();
        await t.esperar(1000);
      },
    },
    {
      tipo: 'imagem',
      legenda: 'Para encerrar antes do fim do evento, toque em Parar.',
      alt: 'Aba Compartilhando com o evento Churrasco do João, o selo Ao vivo e o botão Parar em destaque.',
      async antes(t) {
        await t.tocar('#shared-detail-body .share-start-button');
        await t.page.waitForSelector('#shared-detail-body .share-stop-button');
        await t.esperarAvisoSumir();
        await t.esperar(300);
      },
      destaque: '#shared-detail-body .share-stop-button',
    },
    {
      // Cópia da lista de bebidas (spec 0032): a recebida em cima, a de enviar embaixo.
      tipo: 'imagem',
      seed: 'demoCopiaBebidas',
      legenda: 'Amigos também trocam listas de bebidas. Cada cópia vale por 24 horas.',
      alt: 'Detalhe da amiga Bia com dois destaques: no topo, Receber cópia de bebidas de Bia, com o horário do envio e a validade; embaixo, Copiar bebidas para Bia.',
      async antes(t) {
        await t.tocar('#close-shared-detail');
        await t.tocar('#nav-home');
        await t.tocar('#home-friends-button');
        await t.tocar('#friends-grid button');
        await t.page.waitForSelector('#shared-detail-dialog[open]');
        await t.esperar(400);
      },
      destaque: [
        { seletor: '#shared-detail-drinks-in', rotulo: 'Recebida' },
        // Dentro do anel: acima dele, a etiqueta cobriria o texto da aba Vendo.
        { seletor: '#shared-detail-drinks-out', rotulo: 'Enviar a sua', posicao: 'dentro' },
      ],
    },
    {
      tipo: 'video',
      seed: 'demoCopiaBebidas',
      legenda: 'Toque em Receber: confira a prévia e escolha adicionar ou substituir.',
      alt: 'Receber cópia de bebidas de Bia é tocado e abre a prévia Importar bebidas, com as bebidas enviadas por Bia, o aviso de que os intervalos não são recomendação de consumo e as opções Adicionar às bebidas atuais e Substituir minha lista de bebidas em destaque.',
      async preparar(t) {
        await t.tocar('#home-friends-button');
        await t.tocar('#friends-grid button');
        await t.page.waitForSelector('#shared-detail-dialog[open]');
        await t.esperar(400);
      },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#shared-detail-drinks-in .drink-copy-receive');
        await t.page.waitForSelector('#drink-import-dialog[open]');
        await t.esperar(700);
        await t.destacar('.data-choice-group');
        await t.esperar(2800);
      },
    },
  ],
};
