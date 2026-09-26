// Harness de captura dos tutoriais (spec 0026). Executa os roteiros de tutorials/roteiros/ no app
// real (dev server local + Edge, contexto efêmero — nunca toca o armazenamento do usuário) e
// devolve imagens WebP/vídeos MP4 já com nome por hash de conteúdo.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const { createDevServer } = require('../dev-server.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const ROTEIROS_DIR = path.join(ROOT, 'tutorials', 'roteiros');
const LEGENDA_MAX = 90;
// Relógio congelado nas imagens (contadores estáveis) e correndo a partir dele nos vídeos.
const HORA_FIXA = new Date('2026-06-13T22:30:00-03:00');
const VIEWPORT = { width: 390, height: 844 };

const sha1 = (buffer) => crypto.createHash('sha1').update(buffer).digest('hex');
const appVersion = () => fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const APP_VERSION = "([^"]+)"/)[1];

// --- Roteiros -------------------------------------------------------------------------------

function validarRoteiro(roteiro, arquivo) {
  const erros = [];
  const ok = (cond, msg) => { if (!cond) erros.push(msg); };
  ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(roteiro.id || ''), 'id deve estar em kebab-case');
  ok(typeof roteiro.titulo === 'string' && roteiro.titulo.trim(), 'falta titulo');
  ok(typeof roteiro.resumo === 'string' && roteiro.resumo.trim(), 'falta resumo');
  ok(Array.isArray(roteiro.cobre) && roteiro.cobre.length > 0, 'cobre precisa listar ao menos um seletor estático');
  ok(SEEDS[roteiro.seed], `seed deve ser um de: ${Object.keys(SEEDS).join(', ')}`);
  ok(Array.isArray(roteiro.passos) && roteiro.passos.length > 0, 'faltam passos');
  (roteiro.passos || []).forEach((passo, i) => {
    const rotulo = `passo ${i + 1}`;
    ok(passo.tipo === 'imagem' || passo.tipo === 'video', `${rotulo}: tipo deve ser imagem ou video`);
    ok(typeof passo.legenda === 'string' && passo.legenda.trim(), `${rotulo}: falta legenda`);
    ok(!passo.legenda || passo.legenda.length <= LEGENDA_MAX, `${rotulo}: legenda passa de ${LEGENDA_MAX} caracteres`);
    ok(typeof passo.alt === 'string' && passo.alt.trim(), `${rotulo}: falta alt`);
    if (passo.tipo === 'video') ok(typeof passo.gravar === 'function', `${rotulo}: video precisa de gravar()`);
    ok(!passo.seed || SEEDS[passo.seed], `${rotulo}: seed desconhecido`);
  });
  if (erros.length) throw new Error(`Roteiro ${arquivo} inválido:\n  - ${erros.join('\n  - ')}`);
  return roteiro;
}

function carregarRoteiros(ids = []) {
  const arquivos = fs.readdirSync(ROTEIROS_DIR).filter((nome) => nome.endsWith('.cjs')).sort();
  const roteiros = arquivos.map((nome) => validarRoteiro(require(path.join(ROTEIROS_DIR, nome)), nome));
  const repetidos = roteiros.map((r) => r.id).filter((id, i, todos) => todos.indexOf(id) !== i);
  if (repetidos.length) throw new Error(`Roteiros com id repetido: ${repetidos.join(', ')}`);
  const desconhecidos = ids.filter((id) => !roteiros.some((r) => r.id === id));
  if (desconhecidos.length) throw new Error(`Roteiro inexistente: ${desconhecidos.join(', ')}`);
  return { todos: roteiros, alvo: ids.length ? roteiros.filter((r) => ids.includes(r.id)) : roteiros };
}

// --- Dados de partida -----------------------------------------------------------------------

// Executados dentro da página (não podem usar variáveis de fora).
const SEEDS = {
  vazio: () => {},
  demo: () => {
    const min = 60000;
    const agora = Date.now();
    state.drinks = [
      { id: 'cerveja', name: 'Cerveja', icon: '🍺', intervalMinutes: 60, askDoseSize: false },
      { id: 'caipirinha', name: 'Caipirinha', icon: '🍹', intervalMinutes: 90, askDoseSize: true },
      { id: 'agua', name: 'Água', icon: '💧', intervalMinutes: 30, askDoseSize: false },
    ];
    const registro = (id, drink, minutosAtras) => ({
      id, drinkId: drink.id, drinkName: drink.name, drinkIcon: drink.icon,
      intervalMinutes: drink.intervalMinutes, doseSize: null, consumedAt: agora - minutosAtras * min, occasionId: null,
    });
    const [cerveja, caipirinha, agua] = state.drinks;
    state.events = [
      registro('e1', cerveja, 190), registro('e2', caipirinha, 130), registro('e3', cerveja, 75),
      registro('e4', agua, 20),
    ];
    saveData();
    render();
  },
  // Uma só bebida, sem registros: o estado logo depois do primeiro cadastro.
  umaBebida: () => {
    state.drinks = [{ id: 'cerveja', name: 'Cerveja', icon: '🍺', intervalMinutes: 60, askDoseSize: false }];
    state.events = [];
    saveData();
    render();
  },
  // As mesmas bebidas, ainda sem nenhum registro (bebida "não consumida" é a que pode ser reordenada).
  demoLimpo: () => {
    state.drinks = [
      { id: 'cerveja', name: 'Cerveja', icon: '🍺', intervalMinutes: 60, askDoseSize: false },
      { id: 'caipirinha', name: 'Caipirinha', icon: '🍹', intervalMinutes: 90, askDoseSize: true },
      { id: 'agua', name: 'Água', icon: '💧', intervalMinutes: 30, askDoseSize: false },
    ];
    state.events = [];
    saveData();
    render();
  },
};

// --- Página e ferramentas de captura --------------------------------------------------------

async function abrirApp(browser, port, { video, seed }) {
  const context = await browser.newContext({
    // Vídeo em escala 1×: o screencast do Chromium às vezes entrega um quadro isolado em 2× (ampliado) quando
    // a página tem densidade 2 e o vídeo tem o tamanho da janela. Imagens seguem em 2× para ficar nítidas.
    viewport: VIEWPORT, deviceScaleFactor: video ? 1 : 2, isMobile: true, hasTouch: true,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'dark',
    ...(video ? { recordVideo: { dir: video.dir, size: VIEWPORT } } : {}),
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
    // A introdução já foi "vista": as capturas mostram o app, não o visualizador.
    try { localStorage.setItem('funtime-tutorial-v1', JSON.stringify({ seen: true, at: 0 })); } catch { /* sem armazenamento */ }
  });
  if (video) await context.clock.install({ time: HORA_FIXA });
  else await context.clock.setFixedTime(HORA_FIXA);
  const page = await context.newPage();
  const erros = [];
  page.on('pageerror', (error) => erros.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/funtime/`);
  for (const caixa of await page.locator('#terms-form input[type=checkbox]').all()) await caixa.check();
  await page.locator('#terms-continue').click();
  await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
  // Faixa "Prévia local" injetada pelo dev server: não faz parte do app.
  await page.evaluate(() => document.querySelectorAll('body > div[style*="99999"]').forEach((n) => n.remove()));
  // O rodapé traz a versão do app: escondida só nas capturas para o número não mudar as imagens a cada release.
  await page.addStyleTag({ content: '.app-footer-meta { visibility: hidden !important; }' });
  await page.evaluate(SEEDS[seed]);
  return { context, page, erros };
}

// Overlays (anel de destaque, ponto de toque) vão para a top layer via popover, senão ficariam
// por baixo de qualquer <dialog> aberto. Existem só durante a captura; não são CSS do app.
// `alvos`: [{ seletor, rotulo? }]. O rótulo é uma etiqueta curta acima do anel (abaixo se não couber).
function desenharDestaque({ alvos, folga, ponto }) {
  document.querySelectorAll('.__tut').forEach((n) => n.remove());
  const popover = (estilo) => {
    const el = document.createElement('div');
    el.className = '__tut';
    el.setAttribute('popover', 'manual');
    Object.assign(el.style, { position: 'fixed', inset: 'auto', margin: '0', padding: '0', overflow: 'visible', background: 'transparent', pointerEvents: 'none', color: 'transparent', ...estilo });
    document.body.append(el);
    el.showPopover();
    return el;
  };
  for (const { seletor, rotulo } of alvos) {
    const alvo = document.querySelector(seletor);
    if (!alvo) throw new Error(`Destaque não encontrado na tela: ${seletor}`);
    alvo.scrollIntoView({ block: 'nearest' });
    const r = alvo.getBoundingClientRect();
    popover({
      left: `${r.left - folga}px`, top: `${r.top - folga}px`, width: `${r.width + 2 * folga}px`, height: `${r.height + 2 * folga}px`,
      border: '3px solid #5eb4e9', borderRadius: '16px',
      boxShadow: '0 0 0 4px rgba(94,180,233,.28), 0 0 24px rgba(94,180,233,.55)',
    });
    if (ponto) {
      const dedo = popover({
        left: `${r.left + r.width / 2 - 23}px`, top: `${r.top + r.height / 2 - 23}px`, width: '46px', height: '46px',
        border: '2px solid #fff', borderRadius: '50%', background: 'rgba(255,255,255,.35)', boxShadow: '0 2px 10px rgba(0,0,0,.45)',
      });
      dedo.dataset.tut = 'dedo';
    }
    if (rotulo) {
      const etiqueta = popover({
        padding: '5px 11px', background: '#5eb4e9', color: '#04121c', borderRadius: '999px', whiteSpace: 'nowrap',
        font: '800 13px/1.2 system-ui, sans-serif', boxShadow: '0 2px 10px rgba(0,0,0,.5)', left: '0px', top: '0px',
      });
      etiqueta.textContent = rotulo;
      const { width, height } = etiqueta.getBoundingClientRect();
      const esquerda = Math.min(Math.max(r.left + r.width / 2 - width / 2, 8), window.innerWidth - width - 8);
      const acima = r.top - folga - height - 8;
      etiqueta.style.left = `${esquerda}px`;
      etiqueta.style.top = `${acima >= 8 ? acima : r.bottom + folga + 8}px`;
    }
  }
}

// `destaque` num passo: um seletor, ou uma lista de seletores / { seletor, rotulo }.
function alvosDoDestaque(destaque) {
  return [].concat(destaque).map((item) => (typeof item === 'string' ? { seletor: item } : item));
}

function criarT(page, context) {
  let cdp = null;
  const toque = async (tipo, ponto) => {
    cdp ||= await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: ponto ? [ponto] : [] });
  };
  const centro = async (seletor) => {
    const caixa = await page.locator(seletor).first().boundingBox();
    if (!caixa) throw new Error(`Elemento sem caixa na tela: ${seletor}`);
    return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
  };
  const t = {
    page,
    esperar: (ms) => page.waitForTimeout(ms),
    tocar: (seletor) => page.locator(seletor).first().click(),
    escrever: (seletor, texto) => page.locator(seletor).first().fill(texto),
    // O app registra uma dose com dois toques seguidos; um toque isolado não faz nada.
    async duploToque(seletor) {
      const ponto = await centro(seletor);
      for (let i = 0; i < 2; i++) {
        await toque('touchStart', ponto);
        await page.waitForTimeout(35);
        await toque('touchEnd');
        await page.waitForTimeout(55);
      }
    },
    // Pressão longa (~750 ms) e arraste até o alvo, como o dedo faria.
    // `dy` desloca o ponto final (ex.: negativo para soltar acima do centro do alvo).
    async arrastar(deSeletor, paraSeletor, { dy = 0 } = {}) {
      const inicio = await centro(deSeletor);
      const fim = await centro(paraSeletor);
      fim.y += dy;
      await toque('touchStart', inicio);
      await page.waitForTimeout(900);
      const passos = 14;
      for (let i = 1; i <= passos; i++) {
        await toque('touchMove', { x: inicio.x + ((fim.x - inicio.x) * i) / passos, y: inicio.y + ((fim.y - inicio.y) * i) / passos });
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(250);
      await toque('touchEnd');
      await page.waitForTimeout(350);
    },
    // Para vídeo: anel + dedo sobre o elemento, o dedo "aperta" e o clique acontece de verdade.
    async tocarComDedo(seletor, { espera = 800 } = {}) {
      await t.destacar(seletor, { ponto: true });
      await page.waitForTimeout(espera);
      await page.evaluate(() => {
        const dedo = document.querySelector('.__tut[data-tut="dedo"]');
        if (dedo) { dedo.style.transition = 'transform 130ms ease-out'; dedo.style.transform = 'scale(.72)'; }
      });
      await page.waitForTimeout(170);
      // Some no instante do toque, para o anel/dedo não ficarem sobre a tela que o toque abre.
      await t.limparDestaque();
      await page.locator(seletor).first().click();
    },
    destacar: (destaque, { folga = 6, ponto = false } = {}) => page.evaluate(desenharDestaque, { alvos: alvosDoDestaque(destaque), folga, ponto }),
    limparDestaque: () => page.evaluate(() => document.querySelectorAll('.__tut').forEach((n) => n.remove())),
  };
  return t;
}

// --- Conversão de mídia ---------------------------------------------------------------------

// O próprio Edge converte PNG → WebP e compara imagens: sem dependência nativa extra.
async function paginaUtil(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('about:blank');
  return { context, page };
}

async function pngParaWebp(util, png) {
  const base64 = await util.evaluate(async (dados) => {
    const bytes = Uint8Array.from(atob(dados), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
    const saida = new Uint8Array(await blob.arrayBuffer());
    let texto = '';
    for (let i = 0; i < saida.length; i += 0x8000) texto += String.fromCharCode(...saida.subarray(i, i + 0x8000));
    return btoa(texto);
  }, png.toString('base64'));
  return Buffer.from(base64, 'base64');
}

// Fração de pixels que diferem além de um limiar por canal (tolerância a serrilhado).
async function compararImagens(util, a, b) {
  return util.evaluate(async ({ a, b }) => {
    const ler = async (dados) => {
      const bytes = Uint8Array.from(atob(dados), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return { w: bitmap.width, h: bitmap.height, px: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
    };
    const [x, y] = [await ler(a), await ler(b)];
    if (x.w !== y.w || x.h !== y.h) return 1;
    let diferentes = 0;
    for (let i = 0; i < x.px.length; i += 4) {
      if (Math.abs(x.px[i] - y.px[i]) > 24 || Math.abs(x.px[i + 1] - y.px[i + 1]) > 24 || Math.abs(x.px[i + 2] - y.px[i + 2]) > 24) diferentes++;
    }
    return diferentes / (x.px.length / 4);
  }, { a: a.toString('base64'), b: b.toString('base64') });
}

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return require('ffmpeg-static'); } catch { /* cai para o PATH */ }
  return 'ffmpeg';
}

function webmParaMp4(entrada, saida, cortarSegundos) {
  const args = ['-y', '-ss', cortarSegundos.toFixed(2), '-i', entrada, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-r', '24', '-movflags', '+faststart', saida];
  const resultado = spawnSync(ffmpegPath(), args, { encoding: 'utf8' });
  if (resultado.error || resultado.status !== 0) {
    throw new Error(`ffmpeg falhou (${resultado.error?.message || resultado.stderr?.split('\n').slice(-4).join(' | ')}). ` +
      'Instale o ffmpeg (devDependency ffmpeg-static ou a variável FFMPEG) ou rode com --sem-video.');
  }
  return fs.readFileSync(saida);
}

// --- Cobertura (hash da marcação estática que cada tópico mostra) ---------------------------

async function partesCobertas(util, html, seletores) {
  return util.evaluate(({ html, seletores }) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return seletores.map((seletor) => {
      const no = doc.querySelector(seletor);
      return [seletor, no ? no.outerHTML.replace(/\s+/g, ' ').trim() : null];
    });
  }, { html, seletores });
}

async function hashCobre(util, roteiro) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const partes = await partesCobertas(util, html, roteiro.cobre);
  const ausentes = partes.filter(([, marcacao]) => marcacao === null).map(([seletor]) => seletor);
  if (ausentes.length) throw new Error(`Roteiro ${roteiro.id}: "cobre" aponta para seletores que não existem em index.html: ${ausentes.join(', ')}`);
  return Object.fromEntries(partes.map(([seletor, marcacao]) => [seletor, sha1(Buffer.from(marcacao)).slice(0, 12)]));
}

// --- Build ----------------------------------------------------------------------------------

async function capturar(roteiros, { video = true, log = () => {} } = {}) {
  const servidor = createDevServer();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const port = servidor.address().port;
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'funtime-tutoriais-'));
  const util = await paginaUtil(browser);
  const saida = [];
  try {
    for (const roteiro of roteiros) {
      log(`▸ ${roteiro.id}`);
      const cobre = await hashCobre(util.page, roteiro);
      const { context, page, erros } = await abrirApp(browser, port, { seed: roteiro.seed });
      const t = criarT(page, context);
      const passos = [];
      for (const [i, passo] of roteiro.passos.entries()) {
        const numero = String(i + 1).padStart(2, '0');
        let arquivos;
        if (passo.tipo === 'imagem') {
          if (passo.seed) await page.evaluate(SEEDS[passo.seed]);
          await passo.antes?.(t);
          if (passo.destaque) await t.destacar(passo.destaque, { ponto: passo.ponto });
          await t.esperar(150);
          const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
          // Conferência visual: TUTORIAIS_PNG=<pasta> guarda também o PNG bruto de cada passo.
          if (process.env.TUTORIAIS_PNG) {
            fs.mkdirSync(process.env.TUTORIAIS_PNG, { recursive: true });
            fs.writeFileSync(path.join(process.env.TUTORIAIS_PNG, `${roteiro.id}-${numero}.png`), png);
          }
          const webp = await pngParaWebp(util.page, png);
          await t.limparDestaque();
          arquivos = { principal: { nome: `${numero}.${sha1(webp).slice(0, 8)}.webp`, dados: webp } };
        } else if (!video) {
          log(`  passo ${numero}: vídeo ignorado (--sem-video)`);
          arquivos = null;
        } else {
          arquivos = await gravarVideo({ browser, port, roteiro, passo, numero, tmp, util: util.page });
        }
        log(`  passo ${numero} (${passo.tipo})${arquivos ? '' : ' — pulado'}`);
        passos.push({ passo, arquivos });
      }
      if (erros.length) throw new Error(`Roteiro ${roteiro.id}: o app lançou erro durante a captura: ${erros.join(' | ')}`);
      await context.close();
      saida.push({ roteiro, cobre, passos });
    }
  } finally {
    await util.context.close();
    await browser.close();
    servidor.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return saida;
}

function posterDoMp4(entrada, saida) {
  const args = ['-y', '-sseof', '-0.25', '-i', entrada, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', saida];
  const resultado = spawnSync(ffmpegPath(), args, { encoding: 'utf8' });
  if (resultado.error || resultado.status !== 0) {
    throw new Error(`ffmpeg falhou ao extrair o pôster: ${resultado.error?.message || resultado.stderr?.split('\n').slice(-3).join(' | ')}`);
  }
  return fs.readFileSync(saida);
}

async function gravarVideo({ browser, port, roteiro, passo, numero, tmp, util }) {
  const dir = fs.mkdtempSync(path.join(tmp, 'video-'));
  const inicio = Date.now();
  const { context, page, erros } = await abrirApp(browser, port, { seed: passo.seed || roteiro.seed, video: { dir } });
  const t = criarT(page, context);
  await passo.preparar?.(t);
  const cortar = (Date.now() - inicio) / 1000 + 0.15;
  await passo.gravar(t);
  await t.esperar(300);
  const gravacao = page.video();
  await context.close();
  if (erros.length) throw new Error(`Roteiro ${roteiro.id}, passo ${numero}: o app lançou erro durante a gravação: ${erros.join(' | ')}`);
  const mp4 = webmParaMp4(await gravacao.path(), path.join(dir, 'saida.mp4'), cortar);
  // O pôster sai do último quadro do próprio vídeo: um screenshot dentro da página em gravação demora
  // um tempo variável e alonga (de forma imprevisível) a cauda parada do vídeo.
  const poster = posterDoMp4(path.join(dir, 'saida.mp4'), path.join(dir, 'poster.webp'));
  return {
    principal: { nome: `${numero}.${sha1(mp4).slice(0, 8)}.mp4`, dados: mp4 },
    poster: { nome: `${numero}.poster.${sha1(poster).slice(0, 8)}.webp`, dados: poster },
  };
}

// --- Saída ----------------------------------------------------------------------------------

function montarConteudo(capturados) {
  return capturados.map(({ roteiro, passos }) => ({
    id: roteiro.id,
    titulo: roteiro.titulo,
    resumo: roteiro.resumo,
    ...(roteiro.intro ? { intro: true } : {}),
    passos: passos.filter((p) => p.arquivos).map(({ passo, arquivos }) => ({
      tipo: passo.tipo,
      src: `./tutorials/media/${roteiro.id}/${arquivos.principal.nome}`,
      ...(arquivos.poster ? { poster: `./tutorials/media/${roteiro.id}/${arquivos.poster.nome}` } : {}),
      alt: passo.alt,
      legenda: passo.legenda,
    })),
  }));
}

function montarManifesto(capturados) {
  return {
    versaoApp: appVersion(),
    topicos: Object.fromEntries(capturados.map(({ roteiro, cobre, passos }) => [roteiro.id, {
      cobre,
      midia: Object.fromEntries(passos.filter((p) => p.arquivos).flatMap(({ arquivos }) =>
        Object.values(arquivos).map((arq) => [arq.nome, sha1(arq.dados)]))),
    }])),
  };
}

function textoConteudo(conteudo) {
  return '// GERADO por scripts/tutorials-build.cjs a partir de tutorials/roteiros/ — não edite à mão (spec 0026).\n' +
    `export const TUTORIALS = ${JSON.stringify(conteudo, null, 2)};\n`;
}

module.exports = {
  ROOT, LEGENDA_MAX, alvosDoDestaque, carregarRoteiros, capturar, montarConteudo, montarManifesto, textoConteudo,
  paginaUtil, hashCobre, compararImagens, sha1, appVersion,
};
