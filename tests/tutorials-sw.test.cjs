// Cache da mídia dos tutoriais no Service Worker (spec 0026): baixa uma vez, guarda, responde 206
// a pedidos com Range (Safari exige) e some junto com a versão menor anterior.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { MessageChannel } = require('node:worker_threads');

const SW_SOURCE = fs.readFileSync('sw.js', 'utf8');
const APP_VERSION = SW_SOURCE.match(/const APP_VERSION = "([^"]+)"/)[1];
const CACHE_ATUAL = `funtime-tutorials-v${APP_VERSION.split('.').slice(0, 2).join('-')}`;
const MEDIA = 'https://example.test/funtime/tutorials/media/registrar-dose/01.abcd1234.mp4';

function worker(extra = {}) {
  const handlers = {};
  const self = { registration: { scope: 'https://example.test/funtime/' }, location: { origin: 'https://example.test' }, clients: { claim: async () => {} }, addEventListener: (k, fn) => { handlers[k] = fn; } };
  const ctx = vm.createContext({ URL, Request, Response, File, MessageChannel, setTimeout, clearTimeout, self, ...extra });
  vm.runInContext(SW_SOURCE, ctx);
  return { ctx, handlers };
}

function fakeCaches() {
  const store = new Map();
  const abertos = [];
  return {
    abertos, store,
    open: async (nome) => {
      abertos.push(nome);
      if (!store.has(nome)) store.set(nome, new Map());
      const map = store.get(nome);
      return { match: async (chave) => map.get(chave)?.clone(), put: async (chave, resposta) => { map.set(chave, resposta); } };
    },
  };
}

const arquivo = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
const responder = () => new Response(arquivo, { status: 200, headers: { 'Content-Type': 'video/mp4' } });

async function pedir(handlers, url, headers = {}) {
  let resposta;
  handlers.fetch({ request: new Request(url, { headers }), respondWith: (p) => { resposta = p; } });
  return resposta;
}

test('a mídia é buscada uma vez, guardada no cache dos tutoriais e servida do cache depois', async () => {
  const caches = fakeCaches();
  let idas = 0;
  const { handlers } = worker({ caches, fetch: async () => { idas++; return responder(); } });
  const primeira = await pedir(handlers, MEDIA);
  assert.equal(primeira.status, 200);
  assert.equal(new Uint8Array(await primeira.arrayBuffer()).length, 100);
  const segunda = await pedir(handlers, MEDIA);
  assert.equal(new Uint8Array(await segunda.arrayBuffer()).length, 100);
  assert.equal(idas, 1, 'a segunda leitura deve vir do cache');
  assert.deepEqual([...new Set(caches.abertos)], [CACHE_ATUAL]);
});

test('pedido com Range recebe 206 fatiado, também offline (já em cache)', async () => {
  const caches = fakeCaches();
  let offline = false;
  const { handlers } = worker({ caches, fetch: async () => { if (offline) throw new Error('sem rede'); return responder(); } });
  const primeira = await pedir(handlers, MEDIA, { range: 'bytes=10-19' });
  assert.equal(primeira.status, 206);
  assert.equal(primeira.headers.get('Content-Range'), 'bytes 10-19/100');
  assert.deepEqual([...new Uint8Array(await primeira.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  offline = true;
  const sufixo = await pedir(handlers, MEDIA, { range: 'bytes=-5' });
  assert.equal(sufixo.status, 206);
  assert.equal(sufixo.headers.get('Content-Range'), 'bytes 95-99/100');
  const aberto = await pedir(handlers, MEDIA, { range: 'bytes=90-' });
  assert.equal(aberto.headers.get('Content-Range'), 'bytes 90-99/100');
  const alem = await pedir(handlers, MEDIA, { range: 'bytes=500-600' });
  assert.equal(alem.status, 416);
});

test('resposta de erro do servidor não é guardada no cache', async () => {
  const caches = fakeCaches();
  const { handlers } = worker({ caches, fetch: async () => new Response('não achei', { status: 404 }) });
  const resposta = await pedir(handlers, MEDIA);
  assert.equal(resposta.status, 404);
  assert.equal(caches.store.get(CACHE_ATUAL).size, 0);
});

test('a ativação descarta o cache de tutoriais de outra versão menor e conserva o atual', async () => {
  const removidos = [];
  const { handlers } = worker({
    caches: {
      keys: async () => ['funtime-tutorials-v2-0', CACHE_ATUAL, 'funtime-bg-v1', 'funtime-share-target-v1', 'outro-app'],
      delete: async (chave) => removidos.push(chave),
    },
  });
  let trabalho;
  handlers.activate({ waitUntil: (p) => { trabalho = p; } });
  await trabalho;
  assert.deepEqual(removidos, ['funtime-tutorials-v2-0']);
});

test('pedidos simultâneos da mesma mídia dividem um download só', async () => {
  const caches = fakeCaches();
  let idas = 0;
  const { handlers } = worker({ caches, fetch: async () => { idas++; await new Promise((resolve) => setTimeout(resolve, 20)); return responder(); } });
  const [a, b, c] = await Promise.all([pedir(handlers, MEDIA), pedir(handlers, MEDIA), pedir(handlers, MEDIA, { range: 'bytes=0-9' })]);
  assert.equal(idas, 1, 'só uma ida à rede para três pedidos simultâneos');
  assert.equal((await a.arrayBuffer()).byteLength, 100);
  assert.equal((await b.arrayBuffer()).byteLength, 100);
  assert.equal(c.status, 206);
  assert.equal((await c.arrayBuffer()).byteLength, 10);
  assert.equal(caches.store.get(CACHE_ATUAL).size, 1);
});

test('sem cache e sem rede a mídia falha, nada é guardado e a próxima tentativa com rede funciona', async () => {
  const caches = fakeCaches();
  let offline = true;
  let idas = 0;
  const { handlers } = worker({ caches, fetch: async () => { idas++; if (offline) throw new Error('sem rede'); return responder(); } });
  await assert.rejects(pedir(handlers, MEDIA), /sem rede/);
  assert.equal(caches.store.get(CACHE_ATUAL).size, 0, 'a falha não pode ficar guardada');
  offline = false;
  const depois = await pedir(handlers, MEDIA);
  assert.equal(depois.status, 200);
  assert.equal((await depois.arrayBuffer()).byteLength, 100);
  assert.equal(idas, 2, 'a falha anterior não pode ficar presa como download em andamento');
});
