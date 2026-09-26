// Introdução do primeiro acesso (spec 0026): 4 slides, uma ideia cada, legenda curta.
// O aviso "o contador não indica que é seguro consumir" não ganha slide próprio: já está no card
// da Home, nos termos aceitos antes e no rodapé do app.
module.exports = {
  id: 'introducao',
  intro: true,
  titulo: 'Bem-vindo ao FunTime',
  resumo: 'Uma volta rápida pelo app.',
  cobre: ['#empty-state', '#drink-dialog', '#drink-card-template', '.bottom-nav', '#settings-row-tutorials'],
  seed: 'vazio',
  passos: [
    {
      tipo: 'imagem',
      legenda: 'Cadastre suas bebidas e escolha o intervalo entre as doses.',
      alt: 'Tela de cadastro de bebida com nome, ícones e as rodas de horas e minutos do intervalo.',
      async antes(t) {
        await t.tocar('#empty-add-button');
        await t.escrever('#drink-name', 'Cerveja');
        await t.tocar('.icon-option[data-catalog-icon="🍺"] label');
      },
      destaque: '.interval-fieldset',
    },
    {
      tipo: 'video',
      seed: 'demo',
      legenda: 'Dê dois toques na bebida para registrar. O intervalo começa a contar.',
      alt: 'Dois toques no cartão da Cerveja registram a dose e o cartão passa a mostrar a contagem do intervalo.',
      async preparar(t) { await t.esperar(400); },
      async gravar(t) {
        await t.esperar(700);
        await t.duploToque('.drink-card[data-drink-id="cerveja"] .drink-main');
        await t.esperar(2600);
      },
    },
    {
      tipo: 'imagem',
      seed: 'demo',
      legenda: 'Veja o histórico geral ou só o de uma bebida.',
      alt: 'Tela inicial com dois botões Histórico em destaque: o do menu inferior, rotulado Geral, e o do cartão da Água, rotulado Só desta bebida.',
      async antes(t) {
        await t.page.evaluate(() => { document.querySelector('#drink-dialog[open]')?.close(); });
        await t.tocar('#nav-home');
        // A etiqueta "Geral" cairia sobre o texto do rodapé; nas capturas seguintes ele também fica de fora.
        await t.page.addStyleTag({ content: '.app-footer { visibility: hidden !important; }' });
      },
      destaque: [
        { seletor: '#open-history', rotulo: 'Geral' },
        { seletor: '.drink-card[data-drink-id="agua"] .drink-history-button', rotulo: 'Só desta bebida' },
      ],
    },
    {
      tipo: 'imagem',
      seed: 'demo',
      legenda: 'Mais detalhes em Configurações → Como usar.',
      alt: 'Menu de Configurações com a linha Como usar em destaque.',
      async antes(t) { await t.tocar('#open-settings'); },
      destaque: '#settings-row-tutorials',
    },
  ],
};
