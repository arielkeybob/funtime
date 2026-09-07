const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function setup(seed={}){
  const values=new Map(Object.entries(seed));
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const context=vm.createContext({URL,crypto:webcrypto,TextEncoder});
  for(const file of ['migration.js','transition.js','receiver.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {api:context.FunTimeReceiver,storage,values};
}
const origin='https://example.test';
const data=JSON.stringify({version:9,drinks:[{id:'d',name:'Água',icon:'💧',intervalMinutes:60,askDoseSize:false}],events:[],preferences:{cleanInterface:true}});
test('inspeção vazia não cria dados; confirmação prepara e registra posse verificável',async()=>{
  const {api,storage,values}=setup();
  assert.equal(api.inspect(storage,origin).existing,false);assert.equal(values.size,0);
  const snapshot=await api.prepare(storage,origin);
  assert.equal(storage.getItem('funtime-installation-owner-v1'),null);
  assert.equal(api.claim(storage,origin,snapshot,1700000000000).generation,2);
});
test('migração e posse preservam bytes de dados, proteção e aceite',async()=>{
  const pin=JSON.stringify({enabled:true,method:'pin',pin:{salt:'salt',hash:'hash'}});
  const {api,storage}=setup({'balada-v1-data':data,'intervalo-security-v1':pin});
  const snapshot=await api.prepare(storage,origin);api.claim(storage,origin,snapshot);
  assert.equal(storage.getItem('funtime-v1-data'),data);assert.equal(storage.getItem('funtime-security-v1'),pin);
  const owner=storage.getItem('funtime-installation-owner-v1');api.claim(storage,origin,await api.prepare(storage,origin));
  assert.equal(storage.getItem('funtime-installation-owner-v1'),owner);
});
test('dados ausentes após posse, proteção órfã e marcador inválido não viram instalação vazia',()=>{
  for(const seed of [
    {'funtime-installation-owner-v1':JSON.stringify({version:1,generation:2,targetPath:'/funtime/',claimedAt:1700000000000,dataVersion:9})},
    {'funtime-security-v1':JSON.stringify({enabled:true,method:'pin'})},
    {'funtime-installation-owner-v1':'{'}
  ]){const {api,storage}=setup(seed);assert.throws(()=>api.inspect(storage,origin));}
});
test('alteração concorrente e falha de quota impedem posse sem apagar dados',async()=>{
  const {api,storage}=setup({'funtime-v1-data':data});const snapshot=await api.prepare(storage,origin);
  storage.setItem('funtime-v1-data',data+' ');assert.throws(()=>api.claim(storage,origin,snapshot));
  assert.equal(storage.getItem('funtime-installation-owner-v1'),null);
  const next=await api.prepare(storage,origin);storage.setItem=()=>{throw Error('QuotaExceededError');};
  assert.throws(()=>api.claim(storage,origin,next),/Quota/);assert.equal(storage.getItem('funtime-v1-data'),data+' ');
});
test('gravação de posse sem persistência é detectada',async()=>{
  const {api,storage}=setup({'funtime-v1-data':data});const snapshot=await api.prepare(storage,origin);
  storage.setItem=()=>{};assert.throws(()=>api.claim(storage,origin,snapshot));
});
test('interrupção após gravar posse retoma pela v2 e não desfaz transferência',async()=>{
  const {api,storage}=setup({'funtime-v1-data':data});const snapshot=await api.prepare(storage,origin);
  const set=storage.setItem;storage.setItem=(key,value)=>{set(key,value);throw Error('interrupção');};
  assert.throws(()=>api.claim(storage,origin,snapshot),/interrupção/);storage.setItem=set;
  assert.equal(api.inspect(storage,origin).owner.generation,2);
  await api.prepare(storage,origin);assert.equal(storage.getItem('funtime-v1-data'),data);
});
test('ponte exige escopo e protocolos ativos; ausência só é aceita sem dados anteriores',async()=>{
  const {api}=setup();const absent={getRegistration:async()=>null};
  assert.equal(await api.verifyBridge(absent,origin,()=>{},false),false);
  await assert.rejects(api.verifyBridge(absent,origin,()=>{},true),/v1.16/);
  const active={},registration={scope:origin+'/intervalo/',active};const sw={getRegistration:async()=>registration};
  await assert.rejects(api.verifyBridge(sw,origin,async()=>({migrationProtocol:1}),true),/v1.16/);
  const send=async(worker,type)=>type==='GET_VERSION'?{migrationProtocol:2,transitionProtocol:1}:{ready:true,protocol:2,transitionProtocol:1};
  assert.equal(await api.verifyBridge(sw,origin,send,true),true);
  await assert.rejects(api.verifyBridge(sw,origin,async(worker,type)=>{
    if(type==='FUNTIME_PREPARE')registration.active={};return send(worker,type);
  },true),/janelas/);
});
