// npm run tutorials:build [id ...] [--sem-video]
// Executa os roteiros de tutorials/roteiros/ no app real e regenera a mídia, src/tutorials/content.js
// e tutorials/manifest.lock.json (spec 0026). Nunca edite essas saídas à mão.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./tutorials/lib.cjs');

const args = process.argv.slice(2);
const semVideo = args.includes('--sem-video');
const ids = args.filter((arg) => !arg.startsWith('--'));

(async () => {
  const { todos, alvo } = lib.carregarRoteiros(ids);
  const capturados = await lib.capturar(alvo, { video: !semVideo, log: (linha) => console.log(linha) });

  // Um build parcial (ids ou --sem-video) preserva o que não foi regenerado: o conteúdo e o
  // manifesto são remontados a partir dos tópicos existentes + os recém-capturados.
  const conteudoPath = path.join(lib.ROOT, 'src', 'tutorials', 'content.js');
  const manifestoPath = path.join(lib.ROOT, 'tutorials', 'manifest.lock.json');
  const anteriores = fs.existsSync(manifestoPath) ? JSON.parse(fs.readFileSync(manifestoPath, 'utf8')) : { topicos: {} };
  const conteudoAnterior = fs.existsSync(conteudoPath)
    ? Function(`${fs.readFileSync(conteudoPath, 'utf8').replace('export const TUTORIALS =', 'return')}`)()
    : [];

  const novoConteudo = lib.montarConteudo(capturados);
  const novoManifesto = lib.montarManifesto(capturados);
  const conteudo = todos.map((roteiro) => novoConteudo.find((t) => t.id === roteiro.id) || conteudoAnterior.find((t) => t.id === roteiro.id))
    .filter(Boolean);
  const topicos = Object.fromEntries(todos.map((roteiro) => [roteiro.id, novoManifesto.topicos[roteiro.id] || anteriores.topicos?.[roteiro.id]]).filter(([, v]) => v));

  for (const { roteiro, passos } of capturados) {
    if (passos.some((p) => !p.arquivos)) {
      console.log(`  ! ${roteiro.id}: passos de vídeo foram pulados; o tópico ficou incompleto no content.js`);
    }
    const dir = path.join(lib.ROOT, 'tutorials', 'media', roteiro.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const { arquivos } of passos) {
      if (!arquivos) continue;
      for (const arquivo of Object.values(arquivos)) fs.writeFileSync(path.join(dir, arquivo.nome), arquivo.dados);
    }
  }
  fs.writeFileSync(conteudoPath, lib.textoConteudo(conteudo));
  fs.writeFileSync(manifestoPath, `${JSON.stringify({ versaoApp: lib.appVersion(), topicos }, null, 2)}\n`);

  const bytes = capturados.flatMap(({ passos }) => passos.flatMap(({ arquivos }) => Object.values(arquivos || {}))).reduce((soma, a) => soma + a.dados.length, 0);
  console.log(`\nPronto: ${capturados.length} tópico(s), ${(bytes / 1024).toFixed(0)} KB de mídia. Revise o diff das imagens antes de commitar.`);
})().catch((erro) => {
  console.error(`\nFalha no build dos tutoriais: ${erro.message}`);
  process.exitCode = 1;
});
