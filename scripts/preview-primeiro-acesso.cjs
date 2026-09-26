// npm run preview:primeiro-acesso
// Abre o FunTime numa janela do Edge do tamanho de um celular, com perfil NOVO e vazio (nada do
// armazenamento real), como se fosse a primeira vez: termos, introdução e depois o app. Ao fechar a
// janela (ou Ctrl+C), o servidor local encerra. Não faz parte do app nem da publicação.
//
// Porta: FUNTIME_PREVIEW_PORT (padrão 4180); se estiver ocupada, usa uma livre.
// Navegador: PWA_BROWSER_CHANNEL (padrão msedge).
'use strict';
const { chromium } = require('playwright');
const { createDevServer } = require('./dev-server.cjs');

const PORTA = Number(process.env.FUNTIME_PREVIEW_PORT || 4180);

async function abrirServidor() {
  const servidor = createDevServer();
  const ouvir = (porta) => new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(porta, '127.0.0.1', () => { servidor.off('error', reject); resolve(); });
  });
  try {
    await ouvir(PORTA);
  } catch (erro) {
    if (erro.code !== 'EADDRINUSE') throw erro;
    console.log(`A porta ${PORTA} está ocupada; usando uma livre.`);
    await ouvir(0);
  }
  return servidor;
}

(async () => {
  const servidor = await abrirServidor();
  const porta = servidor.address().port;
  const navegador = await chromium.launch({
    channel: process.env.PWA_BROWSER_CHANNEL || 'msedge',
    headless: false,
    args: ['--window-size=460,980', '--window-position=80,20'],
  });
  // Contexto novo = armazenamento vazio e isolado; o celular emulado deixa cliques do mouse valerem como toque.
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', colorScheme: 'dark',
  });
  const pagina = await contexto.newPage();
  // ?tutorial-intro: o servidor de prévia marca a introdução como vista, salvo com este parâmetro.
  await pagina.goto(`http://127.0.0.1:${porta}/funtime/?tutorial-intro=1`);
  console.log(`Janela aberta em http://127.0.0.1:${porta}/funtime/?tutorial-intro=1`);
  console.log('Perfil vazio: termos → introdução → app. Feche a janela (ou Ctrl+C) para encerrar o servidor.');

  const encerrar = () => { servidor.close(); process.exit(0); };
  navegador.on('disconnected', encerrar);
  process.on('SIGINT', () => { navegador.close().catch(() => {}).finally(encerrar); });
})().catch((erro) => {
  console.error(`Não foi possível abrir a prévia: ${erro.message}`);
  process.exit(1);
});
