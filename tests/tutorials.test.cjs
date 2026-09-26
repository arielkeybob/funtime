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
const { carregarRoteiros, alvosDoDestaque, validarRoteiro, LEGENDA_MAX, LINHAS_MAX, LINHA_MAX } = require('../scripts/tutorials/lib.cjs');

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
      assert.equal(gerado.tipo, passo.tipo);
      assert.ok(gerado.legenda.length <= LEGENDA_MAX);
      if (passo.tipo === 'texto') {
        // Slide só de texto: sem arquivo de mídia e sem alt; o conteúdo é o próprio texto.
        assert.deepEqual(gerado.linhas ?? [], passo.linhas ?? [], `${rotulo}: linhas mudaram no roteiro sem rebuild`);
        assert.equal(gerado.icone, passo.icone, `${rotulo}: ícone mudou no roteiro sem rebuild`);
        assert.equal(gerado.src, undefined, `${rotulo}: slide de texto não tem mídia`);
        return;
      }
      assert.equal(gerado.alt, passo.alt, `${rotulo}: alt mudou no roteiro sem rebuild`);
      assert.ok(gerado.alt.trim());
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

// A captura de Amigos/convites (marco 3) usa uma ponte que o dev server acrescenta ao app.js e que
// troca variáveis do módulo por objetos falsos. Se um refactor renomear ou transformar em `const`
// alguma delas, o build dos tutoriais quebra; este teste acusa antes, dentro do `npm test`.
test('a ponte de captura do dev server ainda encontra as variáveis do app.js e não vaza para produção', async () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  for (const nome of ['firebaseAuth', 'shareWriter', 'sharedEvents', 'sharedEventsUid', 'latestPairings', 'latestShares', 'shareUI', 'inviteUI']) {
    assert.match(app, new RegExp(`^let ${nome}\\b`, 'm'), `app.js precisa continuar declarando "let ${nome}" (a ponte de captura a atribui)`);
  }
  assert.match(app, /function updateSyncSettingsUI\b/);
  assert.equal(app.includes('__funtimeCaptura'), false, 'a ponte só existe no dev server, nunca no app.js de produção');
  const { createDevServer } = require('../scripts/dev-server.cjs');
  const servidor = createDevServer();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  try {
    const servido = await (await fetch(`http://127.0.0.1:${servidor.address().port}/funtime/app.js`)).text();
    assert.ok(servido.includes('__funtimeCaptura'), 'o dev server deveria acrescentar a ponte');
  } finally { servidor.close(); }
});

// Slide só de texto (sem tela do app): dispensa alt, mas limita as linhas de apoio para o cartão caber.
test('slide de texto: valida legenda e linhas, dispensa alt; mídia continua exigindo alt', () => {
  const base = { id: 'x', titulo: 'X', resumo: 'r', cobre: ['#a'], seed: 'demo' };
  const passo = (extra) => ({ ...base, passos: [{ tipo: 'texto', legenda: 'Uma frase.', ...extra }] });
  assert.doesNotThrow(() => validarRoteiro(passo({ icone: '🤝', linhas: ['a', 'b'] }), 't'));
  assert.doesNotThrow(() => validarRoteiro(passo({}), 't'), 'linhas são opcionais');
  assert.throws(() => validarRoteiro(passo({ linhas: Array.from({ length: LINHAS_MAX + 1 }, () => 'a') }), 't'), /linhas/);
  assert.throws(() => validarRoteiro(passo({ linhas: ['x'.repeat(LINHA_MAX + 1)] }), 't'), /linhas/);
  assert.throws(() => validarRoteiro(passo({ legenda: '' }), 't'), /falta legenda/);
  assert.throws(() => validarRoteiro({ ...base, passos: [{ tipo: 'imagem', legenda: 'Oi' }] }, 'i'), /falta alt/);
});
