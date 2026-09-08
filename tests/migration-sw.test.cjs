const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {MessageChannel}=require('node:worker_threads');
function worker(extra={}){
  const handlers={};
  const self={registration:{scope:'https://example.test/funtime/'},location:{origin:'https://example.test'},clients:{claim:async()=>{}},addEventListener:(k,fn)=>handlers[k]=fn};
  const ctx=vm.createContext({URL,Request,Response,File,MessageChannel,setTimeout,clearTimeout,self,...extra});
  vm.runInContext(fs.readFileSync('sw.js','utf8'),ctx);return {ctx,self,handlers};
}
test('ativação limpa apenas shells antigos e conserva pendências e caches de outros apps',async()=>{
  const removed=[];
  const {handlers}=worker({caches:{keys:async()=>['intervalo-v1-14-3','funtime-v1-14-9','funtime-v1-16-0','funtime-v2-0-0-dev-2','funtime-v2-0-0','intervalo-share-target-v1','funtime-share-target-v1','other-v1','intervalo-arquivo'],delete:async key=>removed.push(key)}});
  let work;handlers.activate({waitUntil:p=>work=p});await work;
  assert.deepEqual(removed,['funtime-v2-0-0-dev-2']);
});
test('ponte distingue páginas prontas e atualiza somente janelas antigas do app',async()=>{
  let navigated=0;
  const ready={id:'new',url:'https://example.test/funtime/',postMessage:(data,ports)=>ports[0].postMessage({protocol:2})};
  const old={id:'old',url:'https://example.test/funtime/index.html?x=1',postMessage:(data,ports)=>ports[0].postMessage({protocol:1}),navigate:async()=>{navigated++;return ready;}};
  const {ctx,self}=worker();self.clients.matchAll=async()=>[ready,old,{url:'https://example.test/other/'},{url:'https://example.test/intervalo/policies.html'}];
  await ctx.prepareMigrationClients();assert.equal(navigated,1);
});
test('janela que não atualiza impede autorizar migração',async()=>{
  const stale={id:'old',url:'https://example.test/funtime/',postMessage:(data,ports)=>ports[0].postMessage({protocol:1})};stale.navigate=async()=>stale;
  const {ctx,self}=worker();self.clients.matchAll=async()=>[stale];
  await assert.rejects(ctx.prepareMigrationClients(),/ainda não atualizada/);
});
test('fetch usa somente cache da versão ativa, nunca cache global de outra geração',async()=>{
  const seen=[];
  const cache={match:async request=>{seen.push(typeof request==='string'?request:request.url);return new Response('FunTime');}};
  const {handlers}=worker({caches:{open:async key=>{assert.equal(key,'funtime-v2-0-0');return cache;},match:()=>{throw Error('cache global proibido');}}});
  let response;handlers.fetch({request:new Request('https://example.test/funtime/app.js'),respondWith:p=>response=p});
  assert.equal(await (await response).text(),'FunTime');assert.equal(seen.length,1);
});

test('worker anuncia capacidades verificáveis pela futura v2 antes de assumir os dados',async()=>{
  const {handlers,self}=worker();let version,ready,work;self.clients.matchAll=async()=>[];
  handlers.message({data:{type:'GET_VERSION'},ports:[{postMessage:value=>version=value}]});
  assert.equal(version.version,'2.0.0');assert.equal(version.migrationProtocol,2);assert.equal(version.transitionProtocol,1);
  handlers.message({data:{type:'FUNTIME_PREPARE'},ports:[{postMessage:value=>ready=value}],waitUntil:value=>work=value});await work;
  assert.equal(ready.ready,true);assert.equal(ready.protocol,2);assert.equal(ready.transitionProtocol,1);
});
test('SW v2 não intercepta navegação ou recursos da ponte v1',()=>{
  const {handlers}=worker();
  handlers.fetch({request:new Request('https://example.test/intervalo/'),respondWith(){assert.fail('fora do escopo');}});
  handlers.fetch({request:new Request('https://example.test/intervalo/share-target',{method:'POST',body:'teste'}),respondWith(){assert.fail('compartilhamento fora do escopo');}});
});
