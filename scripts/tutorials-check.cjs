// npm run tutorials:check [--visual]
// Diz quais tutoriais podem ter ficado desatualizados depois de uma mudança no app (spec 0026).
//  - padrão (rápido): recalcula o hash da marcação de index.html que cada roteiro declara em `cobre`
//    e compara com tutorials/manifest.lock.json. Pega mudança de estrutura/rótulo estático.
//  - --visual: recaptura as imagens (sem gravar nada) e compara com as commitadas. Pega mudança de
//    CSS ou de tela montada por JavaScript. Vídeos não entram na comparação.
// Sai com código 1 se houver algo a revisar. Não altera nenhum arquivo.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const lib = require('./tutorials/lib.cjs');

const visual = process.argv.includes('--visual');
const LIMITE_VISUAL = 0.003; // fração de pixels diferentes tolerada (serrilhado/relógio)

(async () => {
  const manifestoPath = path.join(lib.ROOT, 'tutorials', 'manifest.lock.json');
  if (!fs.existsSync(manifestoPath)) throw new Error('tutorials/manifest.lock.json não existe. Rode npm run tutorials:build.');
  const manifesto = JSON.parse(fs.readFileSync(manifestoPath, 'utf8'));
  const { todos } = lib.carregarRoteiros();
  const problemas = new Map(); // id -> [mensagens]
  const resumo = { identicas: 0, toleradas: 0, alteradas: 0 };
  const avisar = (id, mensagem) => problemas.set(id, [...(problemas.get(id) || []), mensagem]);

  for (const id of Object.keys(manifesto.topicos)) {
    if (!todos.some((r) => r.id === id)) avisar(id, 'existe no manifesto mas o roteiro foi removido; rode tutorials:build para limpar');
  }

  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  const util = await lib.paginaUtil(browser);
  try {
    for (const roteiro of todos) {
      const gravado = manifesto.topicos[roteiro.id];
      if (!gravado) { avisar(roteiro.id, 'roteiro novo, ainda sem mídia; rode tutorials:build ' + roteiro.id); continue; }
      const atual = await lib.hashCobre(util.page, roteiro);
      for (const seletor of new Set([...Object.keys(atual), ...Object.keys(gravado.cobre)])) {
        if (!(seletor in gravado.cobre)) avisar(roteiro.id, `passou a cobrir ${seletor}`);
        else if (!(seletor in atual)) avisar(roteiro.id, `deixou de cobrir ${seletor}`);
        else if (atual[seletor] !== gravado.cobre[seletor]) avisar(roteiro.id, `a marcação de ${seletor} mudou em index.html`);
      }
    }

    if (visual) {
      console.log('Recapturando imagens para comparar (isso leva um minuto)…');
      const capturados = await lib.capturar(todos, { video: false });
      for (const { roteiro, passos } of capturados) {
        const dir = path.join(lib.ROOT, 'tutorials', 'media', roteiro.id);
        for (const [i, { arquivos }] of passos.entries()) {
          if (!arquivos) continue;
          const prefixo = `${String(i + 1).padStart(2, '0')}.`;
          const gravada = fs.existsSync(dir) ? fs.readdirSync(dir).find((nome) => nome.startsWith(prefixo) && nome.endsWith('.webp') && !nome.includes('.poster.')) : null;
          if (!gravada) { avisar(roteiro.id, `passo ${i + 1}: sem imagem commitada`); continue; }
          if (gravada === arquivos.principal.nome) { resumo.identicas++; continue; }
          const razao = await lib.compararImagens(util.page, fs.readFileSync(path.join(dir, gravada)), arquivos.principal.dados);
          if (razao > LIMITE_VISUAL) { resumo.alteradas++; avisar(roteiro.id, `passo ${i + 1}: a imagem mudou (${(razao * 100).toFixed(1)}% dos pixels)`); }
          else resumo.toleradas++;
        }
      }
    }
  } finally {
    await util.context.close();
    await browser.close();
  }

  const versao = lib.appVersion();
  if (visual) console.log(`Imagens: ${resumo.identicas} idênticas byte a byte, ${resumo.toleradas} dentro da tolerância, ${resumo.alteradas} alteradas.`);
  if (problemas.size === 0) {
    console.log(`Tutoriais em dia com a marcação atual (app ${versao}, gerados na ${manifesto.versaoApp}).${visual ? '' : ' Use --visual para comparar também as imagens.'}`);
    return;
  }
  console.log(`Tutoriais a revisar (app ${versao}, mídia gerada na ${manifesto.versaoApp}):`);
  for (const [id, mensagens] of problemas) {
    console.log(`\n  ${id}`);
    for (const mensagem of mensagens) console.log(`    - ${mensagem}`);
  }
  console.log('\nRevise a legenda e o roteiro, rode npm run tutorials:build <id> e confira o diff das imagens.');
  process.exitCode = 1;
})().catch((erro) => {
  console.error(`Falha no check dos tutoriais: ${erro.message}`);
  process.exitCode = 1;
});
