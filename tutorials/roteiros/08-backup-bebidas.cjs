// Tópico: Backup e bebidas (spec 0026, marco 2). "Exportar bebidas" e "Fazer backup" são recursos
// separados (lista de bebidas × dados do aplicativo) e o tutorial os mostra separados.

// Arquivos entregues no lugar do seletor de arquivos do sistema (formatos reais: `funtime-drinks` v1
// e `funtime-backup` v2). Se o formato mudar no app, a prévia falha e o build acusa.
const ARQUIVO_BEBIDAS = {
  nome: 'FunTime-Bebidas-2026-06-13.txt',
  tipo: 'text/plain',
  conteudo: JSON.stringify({
    type: 'funtime-drinks', formatVersion: 1, appVersion: '2.18', exportedAt: '2026-06-13T20:00:00.000Z',
    drinks: [
      { id: 'vinho', name: 'Vinho', icon: '🍷', intervalMinutes: 90, askDoseSize: false },
      { id: 'suco', name: 'Suco', icon: '🧃', intervalMinutes: 20, askDoseSize: false },
    ],
  }),
};

async function arquivoDeBackup(t) {
  const dados = await t.page.evaluate(() => ({
    version: 11, drinks: state.drinks, events: state.events, occasions: state.occasions || [], preferences: state.preferences,
  }));
  return {
    nome: 'FunTime-Backup-2026-06-13-2230.json',
    tipo: 'application/json',
    conteudo: JSON.stringify({ type: 'funtime-backup', formatVersion: 2, appVersion: '2.18', createdAt: '2026-06-14T01:30:00.000Z', data: dados }),
  };
}

const irParaBackup = async (t) => {
  await t.tocar('#open-settings');
  await t.tocar('[data-settings-open=backup]');
  await t.esperar(300);
};

module.exports = {
  id: 'backup-e-bebidas',
  titulo: 'Backup e bebidas',
  resumo: 'Exportar, importar e restaurar.',
  cobre: ['.settings-drinks-data-card', '.settings-backup-data-card', '#drink-import-dialog', '#backup-restore-dialog'],
  seed: 'demo',
  passos: [
    {
      // Slide só de texto: diz para que serve cada um (as telas seguintes mostram como). Não repete o que os
      // slides de importar e restaurar já dizem.
      tipo: 'texto',
      icone: '💾',
      legenda: 'Bebidas e backup são coisas diferentes.',
      linhas: [
        'Exportar bebidas: só a lista, para passar a alguém.',
        'Backup: bebidas, histórico e preferências.',
        'Guarde seus dados ou troque de celular.',
        'O PIN e o bloqueio nunca vão no arquivo.',
      ],
    },
    {
      tipo: 'imagem',
      legenda: 'Em Backup e conta, os dois ficam em cartões separados.',
      alt: 'Tela Backup e conta com dois cartões em destaque: Exportar e importar, rotulado Só as bebidas, e Dados do aplicativo, rotulado Bebidas + histórico.',
      antes: irParaBackup,
      destaque: [
        { seletor: '.settings-drinks-data-card', rotulo: 'Só as bebidas', posicao: 'dentro' },
        { seletor: '.settings-backup-data-card', rotulo: 'Bebidas + histórico', posicao: 'dentro' },
      ],
    },
    {
      tipo: 'video',
      legenda: 'Exportar bebidas gera um arquivo para compartilhar ou guardar.',
      alt: 'O botão Exportar bebidas é tocado e o app avisa que o arquivo de bebidas foi exportado.',
      preparar: irParaBackup,
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#export-drinks');
        await t.esperarAvisoSumir();
        await t.esperar(1400);
      },
    },
    {
      tipo: 'video',
      legenda: 'Importar mostra uma prévia: adicionar ou substituir a lista.',
      alt: 'O botão Importar bebidas é tocado e abre a prévia do arquivo, com as opções Adicionar às bebidas atuais e Substituir minha lista de bebidas em destaque.',
      async preparar(t) { await irParaBackup(t); t.aoEscolherArquivo(ARQUIVO_BEBIDAS); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#import-drinks');
        await t.page.waitForSelector('#drink-import-dialog[open]');
        await t.esperar(700);
        await t.destacar('.data-choice-group');
        await t.esperar(2800);
      },
    },
    {
      tipo: 'video',
      legenda: 'Fazer backup salva bebidas, histórico e preferências.',
      alt: 'O botão Fazer backup é tocado e o app avisa que o backup foi criado e que o arquivo deve ser guardado em local privado.',
      preparar: irParaBackup,
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#create-backup');
        await t.esperarAvisoSumir();
        await t.esperar(1400);
      },
    },
    {
      tipo: 'imagem',
      legenda: 'Restaurar troca os dados atuais; o PIN não muda.',
      alt: 'Prévia de Restaurar backup, com o aviso O que será substituído em destaque: bebidas, histórico e preferências; bloqueio e PIN do aparelho não mudam.',
      async antes(t) {
        t.aoEscolherArquivo(await arquivoDeBackup(t));
        await t.tocar('#restore-backup');
        await t.page.waitForSelector('#backup-restore-dialog[open]');
        await t.esperar(400);
      },
      destaque: '.restore-warning',
    },
  ],
};
