// Tópico: registrar doses e acompanhar intervalos (spec 0026).
module.exports = {
  id: 'registrar-dose',
  titulo: 'Registrar doses e intervalos',
  resumo: 'Dois toques, contagem e aviso.',
  cobre: ['#drink-card-template', '#interval-warning-dialog', '#dose-size-dialog', '#drink-menu-dialog', '#log-dialog'],
  seed: 'demo',
  passos: [
    {
      tipo: 'video',
      legenda: 'Dê dois toques na bebida para registrar a dose.',
      alt: 'O cartão da Cerveja recebe o destaque azul e dois toques rápidos o registram; a contagem do intervalo começa e o app avisa que o consumo foi anotado.',
      async preparar(t) { await t.esperar(400); },
      async gravar(t) {
        await t.esperar(1400);
        await t.duploToqueComDedo('.drink-card[data-drink-id="cerveja"] .drink-main');
        await t.esperarAvisoSumir();
        await t.esperar(900);
      },
    },
    {
      tipo: 'imagem',
      legenda: 'O cartão mostra quanto falta para o intervalo terminar.',
      alt: 'Cartão da Água em contagem regressiva, com o tempo restante em destaque.',
      destaque: '.drink-card[data-drink-id="agua"]',
    },
    {
      tipo: 'imagem',
      legenda: 'Registrar outra dose antes de terminar a anterior mostra um aviso; você decide.',
      alt: 'Aviso Intervalo em andamento com os botões Voltar e Já consumi — anotar.',
      async antes(t) {
        await t.duploToque('.drink-card[data-drink-id="agua"] .drink-main');
        await t.page.waitForSelector('#interval-warning-dialog[open]');
        await t.esperar(250);
      },
      destaque: '#interval-warning-dialog .warning-hero',
    },
    {
      tipo: 'imagem',
      legenda: 'Esqueceu de registrar? Use o menu ⋮ e anote a dose em outro horário.',
      alt: 'Menu da bebida com a opção Anotar dose em destaque.',
      async antes(t) {
        await t.tocar('#cancel-interval-warning-dialog');
        await t.page.waitForFunction(() => !document.querySelector('#interval-warning-dialog').open);
        await t.tocar('.drink-card[data-drink-id="agua"] .more-button');
        await t.esperar(250);
      },
      destaque: '#drink-menu-other-time',
    },
  ],
};
