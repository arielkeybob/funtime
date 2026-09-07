const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('migration.js','utf8');
function api(){const c=vm.createContext({});vm.runInContext(code,c);return c.FunTimeMigration;}
const data={version:9,drinks:[{id:'d',name:'Água',icon:'💧',intervalMinutes:30,askDoseSize:true}],events:[{id:'e',drinkId:'d',drinkName:'Nome histórico',drinkIcon:'🍍',consumedAt:1700000000000,intervalMinutes:90,doseSize:'half'}],preferences:{cleanInterface:false,countingMode:'normal',iconCatalog:[]}};
const security={version:3,enabled:true,method:'pin',relockSeconds:300,pin:{salt:'salt',hash:'hash',iterations:210000,length:4}};
const terms={termsAccepted:true,termsVersion:'1.0.1',termsAcceptedAt:1700000000000};
function store(seed={}){
  const map=new Map(Object.entries(seed));let count=0,stop=Infinity;
  function touch(){if(++count===stop)throw Error('armazenamento indisponível');}
  return {map,getItem(k){touch();return map.get(k)??null;},setItem(k,v){touch();map.set(k,v);},removeItem(k){touch();map.delete(k);},failAt(n){count=0;stop=n;},count:()=>count};
}
function original(){return {'balada-v1-data':JSON.stringify(data),'intervalo-security-v1':JSON.stringify(security),'intervalo-terms-v1':JSON.stringify(terms),'outro-app':'preservado'};}
function done(s){assert.equal(s.map.get('funtime-v1-data'),JSON.stringify(data));assert.equal(s.map.get('funtime-security-v1'),JSON.stringify(security));assert.equal(s.map.get('funtime-terms-v1'),JSON.stringify(terms));assert.equal(s.map.get('outro-app'),'preservado');for(const k of api().oldKeys)assert.equal(s.map.has(k),false);assert.deepEqual(JSON.parse(s.map.get('funtime-migration-v1')),{version:1,phase:'done'});}

test('migração preserva bytes de registros, proteção e aceite; repetição não altera destino',()=>{
  const s=store(original()),m=api();m.migrate(s);done(s);
  const next=JSON.stringify({...data,events:[]});s.setItem('funtime-v1-data',next);m.migrate(s);assert.equal(s.getItem('funtime-v1-data'),next);
});
test('cada falha de leitura, gravação ou exclusão pode retomar sem perda ou duplicação',()=>{
  const m=api(),probe=store(original());m.migrate(probe);const operations=probe.count();
  for(let n=1;n<=operations;n++){
    const s=store(original());s.failAt(n);assert.throws(()=>m.migrate(s),undefined,`operação ${n}`);
    assert.ok(s.map.has('balada-v1-data')||s.map.has('funtime-v1-data'));
    assert.ok(s.map.has('intervalo-security-v1')||s.map.has('funtime-security-v1'));
    s.failAt(Infinity);m.migrate(s);done(s);
  }
});
test('PIN legado de 6 dígitos e credenciais do aparelho permanecem idênticos',()=>{
  for(const config of [{...security,pin:{...security.pin,length:6}},{version:3,enabled:true,method:'device',relockSeconds:0,webauthn:{credentialId:'abc',publicKey:'key',algorithm:-7}}]){
    const seed=original();seed['intervalo-security-v1']=JSON.stringify(config);const s=store(seed);api().migrate(s);assert.equal(s.getItem('funtime-security-v1'),JSON.stringify(config));
  }
});
test('instalação limpa e dados legados geram estado completo estável',()=>{
  const m=api(),s=store();m.migrate(s);assert.deepEqual(JSON.parse(s.getItem('funtime-v1-data')).events,[]);
  const legacy=store({'balada-v1-drinks':JSON.stringify([{...data.drinks[0],lastConsumedAt:1700000000000}])});
  m.migrate(legacy);const raw=legacy.getItem('funtime-v1-data');m.migrate(legacy);assert.equal(legacy.getItem('funtime-v1-data'),raw);
  const d=JSON.parse(raw);assert.equal(d.events.length,1);assert.equal(d.events[0].consumedAt,1700000000000);assert.equal(d.events[0].drinkId,'d');
});
test('dados inválidos, segurança inválida e destinos conflitantes falham antes de apagar origem',()=>{
  for(const extra of [{'balada-v1-data':'{'},{'balada-v1-data':JSON.stringify({...data,version:10})},{'intervalo-security-v1':JSON.stringify({enabled:true,method:'pin'})},{'funtime-v1-data':JSON.stringify({...data,events:[]})},{'funtime-v1-data':'null'}]){
    const seed={...original(),...extra},s=store(seed);assert.throws(()=>api().migrate(s));assert.deepEqual(Object.fromEntries(s.map),seed);
  }
});
test('destino concluído não ressuscita origem nem permite perda silenciosa do destino',()=>{
  const m=api(),s=store(original());m.migrate(s);s.setItem('balada-v1-data',JSON.stringify(data));assert.throws(()=>m.migrate(s));
  assert.equal(s.getItem('funtime-v1-data'),JSON.stringify(data));s.removeItem('balada-v1-data');s.removeItem('funtime-v1-data');assert.throws(()=>m.migrate(s));
});
test('sessão expirada e rascunho são copiados sem renovar horários ou produzir aceite',()=>{
  const s=store({'intervalo-security-session-v1':JSON.stringify({lastActiveAt:1,hiddenAt:2}),'intervalo-terms-draft-v1':JSON.stringify({termsVersion:'1.0.1',checks:[true,false,false]})});
  api().migrateSession(s);assert.deepEqual(JSON.parse(s.getItem('funtime-security-session-v1')),{lastActiveAt:1,hiddenAt:2});assert.equal(s.getItem('funtime-terms-v1'),null);assert.equal(s.getItem('intervalo-terms-draft-v1'),null);
});
test('gravação que não persiste é detectada antes de apagar dados antigos',()=>{
  const s=store(original());s.setItem=()=>{};assert.throws(()=>api().migrate(s),/verificar/);assert.equal(s.getItem('balada-v1-data'),JSON.stringify(data));
});

test('falha de leitura após a migração não abre estado vazio nem desativa proteção',()=>{
  const source=fs.readFileSync('app.js','utf8');
  const ctx=vm.createContext({console:{error(){},warn(){}},FunTimeMigration:api(),localStorage:{getItem(){throw Error('falha tardia');}}});
  vm.runInContext(`const DATA_STORAGE_KEY='funtime-v1-data', SECURITY_STORAGE_KEY='funtime-security-v1';`,ctx);
  for(const name of ['loadAppData','loadSecurityConfig']){
    const start=source.indexOf(`function ${name}(`),next=source.slice(start+1).search(/\n(?:async )?function /);
    vm.runInContext(source.slice(start,start+1+next),ctx);
    assert.throws(()=>ctx[name](),/Não foi possível ler/);
  }
});
