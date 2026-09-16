const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {MessageChannel}=require('node:worker_threads');
const SW_SOURCE=fs.readFileSync('sw.js','utf8');
const CACHE_NAME=SW_SOURCE.match(/const CACHE_NAME = "([^"]+)"/)[1];
const APP_VERSION=SW_SOURCE.match(/const APP_VERSION = "([^"]+)"/)[1];
function worker(extra={}){
  const handlers={};
  const self={registration:{scope:'https://example.test/funtime/'},location:{origin:'https://example.test'},clients:{claim:async()=>{}},addEventListener:(k,fn)=>handlers[k]=fn};
  const ctx=vm.createContext({URL,Request,Response,File,MessageChannel,setTimeout,clearTimeout,self,...extra});
  vm.runInContext(SW_SOURCE,ctx);return {ctx,self,handlers};
}
test('ativação limpa apenas shells antigos da própria v2 e conserva caches de outros apps',async()=>{
  const removed=[];
  const {handlers}=worker({caches:{keys:async()=>['funtime-v2-0-0-dev-2','funtime-v1-14-9','funtime-v1-16-0',CACHE_NAME,'funtime-share-target-v1','other-app-cache'],delete:async key=>removed.push(key)}});
  let work;handlers.activate({waitUntil:p=>work=p});await work;
  assert.deepEqual(removed,['funtime-v2-0-0-dev-2']);
});
test('exclusividade entre janelas atualiza somente as que ainda rodam o boot antigo',async()=>{
  let navigated=0;
  const ready={id:'new',url:'https://example.test/funtime/',postMessage:(data,ports)=>ports[0].postMessage({protocol:2})};
  const old={id:'old',url:'https://example.test/funtime/index.html?x=1',postMessage:(data,ports)=>ports[0].postMessage({protocol:1}),navigate:async()=>{navigated++;return ready;}};
  const {ctx,self}=worker();self.clients.matchAll=async()=>[ready,old,{url:'https://example.test/other-app/'}];
  await ctx.prepareBootClients();assert.equal(navigated,1);
});
test('janela que não atualiza impede autorizar a preparação',async()=>{
  const stale={id:'old',url:'https://example.test/funtime/',postMessage:(data,ports)=>ports[0].postMessage({protocol:1})};stale.navigate=async()=>stale;
  const {ctx,self}=worker();self.clients.matchAll=async()=>[stale];
  await assert.rejects(ctx.prepareBootClients(),/ainda não atualizada/);
});
test('fetch usa somente cache da versão ativa, nunca cache global de outra geração',async()=>{
  const seen=[];
  const cache={match:async request=>{seen.push(typeof request==='string'?request:request.url);return new Response('FunTime');}};
  const {handlers}=worker({caches:{open:async key=>{assert.equal(key,CACHE_NAME);return cache;},match:()=>{throw Error('cache global proibido');}}});
  let response;handlers.fetch({request:new Request('https://example.test/funtime/app.js'),respondWith:p=>response=p});
  assert.equal(await (await response).text(),'FunTime');assert.equal(seen.length,1);
});
test('worker anuncia a versão e libera a preparação depois de garantir as janelas atualizadas',async()=>{
  const {handlers,self}=worker();let version,ready,work;self.clients.matchAll=async()=>[];
  handlers.message({data:{type:'GET_VERSION'},ports:[{postMessage:value=>version=value}]});
  assert.equal(version.version,APP_VERSION);
  assert.equal(Object.hasOwn(version,'migrationProtocol'),false);
  assert.equal(Object.hasOwn(version,'transitionProtocol'),false);
  handlers.message({data:{type:'FUNTIME_PREPARE'},ports:[{postMessage:value=>ready=value}],waitUntil:value=>work=value});await work;
  assert.equal(ready.ready,true);assert.equal(ready.protocol,2);
});
test('compartilhamento recebido grava X-FunTime-Shared-At para permitir expirar depois',async()=>{
  const entries=new Map();
  const cache={put:async(url,response)=>entries.set(String(url),response),match:async url=>entries.get(String(url))};
  const {handlers}=worker({caches:{open:async()=>cache}});
  const formData=new FormData();
  formData.append('drinksFile',new File(['{"drinks":[]}'],'FunTime-Bebidas.json',{type:'application/json'}));
  const request=new Request('https://example.test/funtime/share-target',{method:'POST',body:formData});
  const before=Date.now();
  let response;handlers.fetch({request,respondWith:p=>response=p});
  assert.equal((await response).status,303);
  const stored=[...entries.values()][0];
  const sharedAt=Number(stored.headers.get('X-FunTime-Shared-At'));
  assert.ok(Number.isFinite(sharedAt)&&sharedAt>=before&&sharedAt<=Date.now(),`esperava timestamp recente, veio ${sharedAt}`);
});
test('SW v2 não intercepta navegação nem compartilhamento fora do próprio escopo',()=>{
  const {handlers}=worker();
  handlers.fetch({request:new Request('https://example.test/other-app/'),respondWith(){assert.fail('fora do escopo');}});
  handlers.fetch({request:new Request('https://example.test/other-app/share-target',{method:'POST',body:'teste'}),respondWith(){assert.fail('compartilhamento fora do escopo');}});
});
