// Tutoriais (spec 0026): funções puras do visualizador e integridade do que o build gera.
// Não abre navegador — é o teste que avisa, dentro do `npm test`, que um roteiro e a mídia
// commitada deixaram de bater. O aviso visual completo é `npm run tutorials:check --visual`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { clampIndex, shouldShowIntro } = require('../src/tutorials/viewer.js');
const { TUTORIALS } = require('../src/tutorials/content.js');
const { carregarRoteiros, alvosDoDestaque, LEGENDA_MAX } = require('../scripts/tutorials/lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sha1 = (buffer) => crypto.createHash('sha1').update(buffer).digest('hex');

const MAX_IMAGEM = 150 * 1024;
const MAX_VIDEO = 700 * 1024;
const MAX_TOTAL = 6 * 1024 * 1024;

test('clampIndex mantém o índice dentro do slide e tolera valores inválidos', () => {
  assert.equal(clampIndex(0, 4), 0);
  assert.equal(clampIndex(3, 4), 3);
  assert.equal(clampIndex(4, 4), 3);
  assert.equal(clampIndex(-2, 4), 0);
  assert.equal(clampIndex(1.9, 4), 1);
  assert.equal(clampIndex(Number.NaN, 4), 0);
  assert.equal(clampIndex(2, 0), 0);
  assert.equal(clampIndex(2, Number.NaN), 0);
});

test('shouldShowIntro só abre a introdução para quem nunca viu e não tem dados', () => {
  assert.equal(shouldShowIntro({ seen: false, hasData: false }), true);
  assert.equal(shouldShowIntro({ seen: true, hasData: false }), false);
  assert.equal(shouldShowIntro({ seen: false, hasData: true }), false);
  assert.equal(shouldShowIntro({ seen: true, hasData: true }), false);
});

test('todos os roteiros são válidos (legenda curta, alt, seed, ids únicos)', () => {
  const { todos } = carregarRoteiros();
  assert.ok(todos.length > 0);
  assert.ok(todos.filter((r) => r.intro).length <= 1, 'no máximo uma introdução');
});

// Seletor simples (#id ou .classe) conferido em index.html; o resto só se confere no build.
function apareceEmIndex(seletor) {
  const id = /^#([\w-]+)$/.exec(seletor);
  if (id) return new RegExp(`\\bid="${id[1]}"`).test(html);
  const classe = /^\.([\w-]+)$/.exec(seletor);
  if (classe) return new RegExp(`class="[^"]*\\b${classe[1]}\\b[^"]*"`).test(html);
  return null;
}

test('os seletores estáticos de cobre e destaque existem em index.html', () => {
  const { todos } = carregarRoteiros();
  const faltando = [];
  for (const roteiro of todos) {
    for (const seletor of roteiro.cobre) {
      if (apareceEmIndex(seletor) === false) faltando.push(`${roteiro.id}: cobre ${seletor}`);
    }
    for (const passo of roteiro.passos) {
      for (const { seletor } of passo.destaque ? alvosDoDestaque(passo.destaque) : []) {
        if (apareceEmIndex(seletor) === false) faltando.push(`${roteiro.id}: destaque ${seletor}`);
      }
    }
  }
  assert.deepEqual(faltando, [], 'seletores que sumiram do index.html — atualize o roteiro e rode npm run tutorials:build');
});

test('content.js e o manifesto batem com os roteiros e com os arquivos de mídia', () => {
  const { todos } = carregarRoteiros();
  const manifesto = JSON.parse(fs.readFileSync(path.join(ROOT, 'tutorials', 'manifest.lock.json'), 'utf8'));
  assert.deepEqual(TUTORIALS.map((t) => t.id), todos.map((r) => r.id), 'ids/ordem diferem — rode npm run tutorials:build');
  let total = 0;
  for (const roteiro of todos) {
    const topico = TUTORIALS.find((t) => t.id === roteiro.id);
    assert.equal(topico.titulo, roteiro.titulo, `${roteiro.id}: título mudou no roteiro sem rebuild`);
    assert.equal(Boolean(topico.intro), Boolean(roteiro.intro), `${roteiro.id}: flag intro`);
    assert.equal(topico.passos.length, roteiro.passos.length, `${roteiro.id}: número de passos difere do roteiro (rode tutorials:build; vídeos pulados?)`);
    assert.ok(manifesto.topicos[roteiro.id], `${roteiro.id}: sem entrada no manifesto`);
    roteiro.passos.forEach((passo, i) => {
      const gerado = topico.passos[i];
      const rotulo = `${roteiro.id} passo ${i + 1}`;
      assert.equal(gerado.legenda, passo.legenda, `${rotulo}: legenda mudou no roteiro sem rebuild`);
      assert.equal(gerado.alt, passo.alt, `${rotulo}: alt mudou no roteiro sem rebuild`);
      assert.equal(gerado.tipo, passo.tipo);
      assert.ok(gerado.alt.trim() && gerado.legenda.length <= LEGENDA_MAX);
      for (const [campo, limite] of [['src', passo.tipo === 'video' ? MAX_VIDEO : MAX_IMAGEM], ['poster', MAX_IMAGEM]]) {
        if (!gerado[campo]) continue;
        const arquivo = path.join(ROOT, gerado[campo].replace(/^\.\//, ''));
        assert.ok(fs.existsSync(arquivo), `${rotulo}: ${gerado[campo]} não existe`);
        const bytes = fs.readFileSync(arquivo);
        total += bytes.length;
        assert.ok(bytes.length <= limite, `${rotulo}: ${gerado[campo]} passa do orçamento (${bytes.length} bytes)`);
        const nome = path.basename(arquivo);
        assert.equal(manifesto.topicos[roteiro.id].midia[nome], sha1(bytes), `${rotulo}: ${nome} não bate com o manifesto`);
        assert.ok(nome.includes(`.${sha1(bytes).slice(0, 8)}.`), `${rotulo}: o nome de ${nome} deveria conter o hash do conteúdo`);
      }
      if (passo.tipo === 'video') assert.ok(gerado.poster, `${rotulo}: vídeo sem pôster`);
    });
  }
  assert.ok(total <= MAX_TOTAL, `mídia total (${total} bytes) passa do orçamento`);
});

test('nenhum arquivo de mídia sobra sem uso em tutorials/media', () => {
  const usados = new Set(TUTORIALS.flatMap((t) => t.passos.flatMap((p) => [p.src, p.poster]).filter(Boolean))
    .map((src) => path.normalize(path.join(ROOT, src.replace(/^\.\//, '')))));
  const sobras = [];
  const varrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varrer(caminho);
      else if (!usados.has(path.normalize(caminho))) sobras.push(path.relative(ROOT, caminho));
    }
  };
  const media = path.join(ROOT, 'tutorials', 'media');
  if (fs.existsSync(media)) varrer(media);
  assert.deepEqual(sobras, []);
});

test('o Service Worker pré-carrega o visualizador e o conteúdo gerado', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /"\.\/src\/tutorials\/viewer\.js"/);
  assert.match(sw, /"\.\/src\/tutorials\/content\.js"/);
});
