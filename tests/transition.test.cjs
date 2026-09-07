const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({URL});vm.runInContext(fs.readFileSync('transition.js','utf8'),context);
const api=context.FunTimeTransition;
const valid={version:1,generation:2,targetPath:'/funtime/',claimedAt:1700000000000,dataVersion:9};
const store=value=>({getItem:key=>{assert.equal(key,'funtime-installation-owner-v1');return value;}});
test('sem transferência não anuncia a v2 nem escreve qualquer registro',()=>{
  assert.equal(api.readOwner(store(null),'https://example.test'),null);
});
test('posse da v2 resolve apenas o endereço contratado na mesma origem',()=>{
  const owner=api.readOwner(store(JSON.stringify(valid)),'https://example.test');
  assert.equal(owner.url,'https://example.test/funtime/');
  assert.equal(api.readOwner(store(JSON.stringify({...valid,dataVersion:10})),'http://localhost:8080').url,'http://localhost:8080/funtime/');
});
test('marcador inválido, futuro desconhecido ou URL externa bloqueiam, sem fallback para v1',()=>{
  for(const raw of ['{','null','false',JSON.stringify({...valid,version:2}),JSON.stringify({...valid,generation:1}),JSON.stringify({...valid,claimedAt:0}),JSON.stringify({...valid,dataVersion:'9'}),JSON.stringify({...valid,targetPath:'https://outro.test/'}),JSON.stringify({...valid,targetPath:'//outro.test/'}),JSON.stringify({...valid,targetPath:'/funtime/?token=abc'})]){
    assert.throws(()=>api.readOwner(store(raw),'https://example.test'),/verificar/);
  }
  assert.throws(()=>api.readOwner({getItem(){throw Error('indisponível');}},'https://example.test'),/indisponível/);
});
test('anúncio válido da v2 resolve somente o destino contratado',()=>{
  const release={version:1,generation:2,status:'ready',targetPath:'/funtime/',appVersion:'2.0.0',transitionProtocol:1,publishedAt:1700000000000,dataVersion:9};
  assert.equal(api.parseRelease(release,'https://example.test').url,'https://example.test/funtime/');
  for(const invalid of [
    {...release,status:'draft'}, {...release,targetPath:'/outra/'}, {...release,appVersion:'1.99.0'},
    {...release,transitionProtocol:2}, {...release,publishedAt:0}, {...release,dataVersion:8}
  ]) assert.equal(api.parseRelease(invalid,'https://example.test'),null);
});
test('descoberta só aceita JSON pronto, sem redirecionamento, e falha silenciosamente offline',async()=>{
  const release={version:1,generation:2,status:'ready',targetPath:'/funtime/',appVersion:'2.0.0',transitionProtocol:1,publishedAt:1700000000000,dataVersion:9};
  let request;
  const found=await api.discoverRelease(async(url,options)=>{
    request={url,options};
    return {ok:true,url,headers:{get:name=>name==='content-type'?'application/json; charset=utf-8':null},json:async()=>release};
  },'https://example.test');
  assert.equal(found.url,'https://example.test/funtime/');
  assert.equal(request.url,'https://example.test/funtime/transition.json');
  assert.equal(request.options.cache,'no-store');
  assert.equal(request.options.redirect,'error');
  assert.equal(await api.discoverRelease(async()=>{throw Error('offline');},'https://example.test'),null);
  assert.equal(await api.discoverRelease(async()=>({ok:true,url:'https://example.test/funtime/',headers:{get:()=> 'text/html'},json:async()=>release}),'https://example.test'),null);
});
