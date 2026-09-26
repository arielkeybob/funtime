// Tópico: cadastrar e organizar bebidas (spec 0026).
module.exports = {
  id: 'cadastrar-bebida',
  titulo: 'Cadastrar e organizar bebidas',
  resumo: 'Nome, ícone, intervalo e ordem.',
  cobre: ['#empty-state', '#drink-dialog', '#drink-card-template', '#drink-menu-dialog'],
  seed: 'vazio',
  passos: [
    {
      tipo: 'imagem',
      legenda: 'Na tela inicial, toque em Adicionar bebida para começar.',
      alt: 'Tela inicial vazia com o botão Adicionar bebida em destaque.',
      destaque: '#empty-add-button',
      ponto: true,
    },
    {
      tipo: 'imagem',
      legenda: 'Dê um nome e escolha um ícone.',
      alt: 'Formulário de cadastro com o nome Cerveja e a lista de ícones em destaque.',
      async antes(t) {
        await t.tocar('#empty-add-button');
        await t.escrever('#drink-name', 'Cerveja');
        await t.tocar('.icon-option[data-catalog-icon="🍺"] label');
      },
      destaque: '#drink-icon-field',
    },
    {
      tipo: 'imagem',
      legenda: 'Defina o intervalo entre as doses girando horas e minutos.',
      alt: 'Formulário de cadastro com as rodas de horas e minutos do intervalo em destaque.',
      destaque: '.interval-fieldset',
    },
    {
      tipo: 'imagem',
      legenda: 'Ative para escolher dose inteira ou meia a cada registro.',
      alt: 'Formulário de cadastro com a opção Perguntar se é dose inteira ou meia ligada e em destaque.',
      async antes(t) { await t.tocar('label[for="ask-dose-size"]'); },
      destaque: 'label[for="ask-dose-size"]',
    },
    {
      tipo: 'video',
      legenda: 'Toque em Salvar: a bebida aparece na tela inicial.',
      alt: 'O botão Salvar é tocado e o cadastro fecha, mostrando o cartão da Cerveja na tela inicial.',
      async preparar(t) {
        await t.tocar('#empty-add-button');
        await t.escrever('#drink-name', 'Cerveja');
        await t.tocar('.icon-option[data-catalog-icon="🍺"] label');
        await t.esperar(300);
      },
      async gravar(t) {
        await t.esperar(500);
        await t.tocarComDedo('#drink-form button[type=submit]');
        await t.page.waitForSelector('.drink-card');
        await t.esperar(1200);
      },
    },
    {
      tipo: 'video',
      seed: 'umaBebida',
      legenda: 'Toque em ⋮ no cartão para anotar uma dose ou editar a bebida.',
      alt: 'O botão ⋮ do cartão da Cerveja é tocado e abre o menu com as opções Anotar dose e Editar bebida.',
      async preparar(t) { await t.esperar(400); },
      async gravar(t) {
        await t.esperar(500);
        await t.tocarComDedo('.drink-card .more-button');
        await t.page.waitForSelector('#drink-menu-dialog[open]');
        await t.esperar(400);
        await t.destacar('.drink-menu-actions');
        await t.esperar(1000);
      },
    },
    {
      tipo: 'video',
      seed: 'demoLimpo',
      legenda: 'Segure uma bebida e arraste para mudar a ordem.',
      alt: 'A Água é segurada e arrastada para o topo da lista de bebidas.',
      async preparar(t) { await t.esperar(400); },
      async gravar(t) {
        await t.esperar(600);
        await t.arrastar('.drink-card[data-drink-id="agua"] .drink-main', '.drink-card[data-drink-id="cerveja"] .drink-main', { dy: -60 });
        await t.esperar(400);
      },
    },
  ],
};
