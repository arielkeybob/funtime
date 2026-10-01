// Tópico: Histórico dos registros (spec 0026, marco 2). Legendas curtas; vídeos com tempo parado
// antes do gesto (dá para ler a tela), anel azul no alvo, dedo descendo até ele e tempo no resultado.
module.exports = {
  id: 'historico',
  titulo: 'Histórico e correções',
  resumo: 'Geral, por bebida, correções e reações.',
  cobre: ['#history-view', '#event-dialog', '#reaction-picker-dialog', '#app-confirm-dialog', '.bottom-nav', '#drink-card-template'],
  seed: 'demo',
  passos: [
    {
      tipo: 'video',
      legenda: 'Toque em Histórico no menu para ver todos os registros.',
      alt: 'Na tela inicial, o botão Histórico do menu de baixo recebe o destaque azul e é tocado; abre a lista com todos os registros, do mais recente ao mais antigo.',
      async preparar(t) { await t.esperar(300); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#open-history');
        await t.page.waitForSelector('#history-view:not([hidden])');
        await t.esperar(3000);
      },
    },
    {
      tipo: 'video',
      legenda: 'No card, o botão Histórico mostra só aquela bebida.',
      alt: 'O botão Histórico do cartão da Cerveja é tocado e abre a lista só com os registros dessa bebida.',
      async preparar(t) { await t.esperar(300); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('.drink-card[data-drink-id="cerveja"] .drink-history-button');
        await t.page.waitForFunction(() => document.querySelector('#history-header-title')?.textContent === 'Cerveja');
        await t.esperar(2800);
      },
    },
    {
      tipo: 'video',
      legenda: 'Toque num registro para corrigir o horário.',
      alt: 'Um registro do Histórico é tocado e abre o editor, com a data e as rodas de hora e minuto em destaque.',
      async preparar(t) { await t.tocar('#open-history'); await t.esperar(400); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#history-list button');
        await t.page.waitForSelector('#event-dialog[open]');
        await t.esperar(600);
        await t.destacar('.event-datetime-grid');
        await t.esperar(2600);
      },
    },
    {
      tipo: 'video',
      legenda: 'Segure um registro para reagir à dose.',
      alt: 'Um registro do Histórico recebe um toque e segurar; abre um seletor com até quatro reações, de "Péssimo" a "Ótimo"; a reação "Ótimo" é tocada, o seletor fecha e o selo da reação aparece ao lado do registro.',
      async preparar(t) { await t.tocar('#open-history'); await t.esperar(400); },
      async gravar(t) {
        await t.esperar(1400);
        await t.segurarComDedo('#history-list button');
        await t.page.waitForSelector('#reaction-picker-dialog[open]');
        await t.esperar(700);
        await t.tocarComDedo('.reaction-picker-button[data-reaction="great"]');
        await t.page.waitForFunction(() => !document.querySelector('#reaction-picker-dialog').open);
        await t.esperar(1800);
      },
    },
    {
      tipo: 'video',
      legenda: 'Para excluir um registro, toque nele, em Excluir e confirme.',
      alt: 'Da tela inicial, o botão Histórico é tocado e depois um registro; no editor, o botão Excluir este registro é tocado e a exclusão é confirmada; o registro some da lista e o app avisa que foi excluído, com a opção Desfazer.',
      async preparar(t) { await t.esperar(300); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#open-history');
        await t.page.waitForSelector('#history-view:not([hidden])');
        await t.esperar(900);
        await t.tocarComDedo('#history-list button', { antes: 400, descida: 650, pausa: 250 });
        await t.page.waitForSelector('#event-dialog[open]');
        await t.esperar(800);
        await t.tocarComDedo('#delete-event', { antes: 500, descida: 650, pausa: 250 });
        await t.page.waitForSelector('#app-confirm-dialog[open]');
        await t.esperar(1300);
        await t.tocarComDedo('#app-confirm-accept', { antes: 400, descida: 650, pausa: 250 });
        await t.page.waitForFunction(() => !document.querySelector('#app-confirm-dialog').open && !document.querySelector('#event-dialog').open);
        await t.esperarAvisoSumir();
        await t.esperar(900);
      },
    },
  ],
};
