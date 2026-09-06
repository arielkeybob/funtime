const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}
function context(extra = {}) {
  const ctx = vm.createContext({ console, Blob, File, crypto: require('node:crypto').webcrypto, ...extra });
  vm.runInContext(`const DATA_VERSION=8, DEFAULT_ICON='🍺', DRINK_EXPORT_TYPE='intervalo-drinks', DRINK_EXPORT_FORMAT_VERSION=1, BACKUP_EXPORT_TYPE='intervalo-backup', BACKUP_EXPORT_FORMAT_VERSION=1, DATA_STORAGE_KEY='balada-v1-data';`, ctx);
  for (const name of ['createId', 'normalizeIcon', 'normalizeIntervalMinutes', 'normalizeDoseSize', 'normalizeData', 'normalizeImportedDrink', 'validateDrinkExportPayload', 'validateBackupPayload', 'confirmBackupRestore', 'buildCurrentAppData', 'persistDrinkList']) vm.runInContext(extract(name), ctx);
  vm.runInContext('async ' + extract('readJsonFile'), ctx);
  return ctx;
}
const drink = {id:'d1', name:'Água', icon:'💧', intervalMinutes:60, askDoseSize:false};
function backup() { return {type:'intervalo-backup',formatVersion:1,data:{version:8,drinks:[{...drink}],events:[{id:'e1',drinkId:'d1',drinkName:'Água',drinkIcon:'💧',consumedAt:1700000000000,intervalMinutes:60,doseSize:null}],preferences:{cleanInterface:true}}}; }

test('backup válido conserva snapshots; bebida excluída continua restaurável', () => {
  const c=context(), b=backup(); b.data.events[0].intervalMinutes=90;
  assert.equal(c.validateBackupPayload(b).events[0].intervalMinutes,90);
  b.data.drinks=[];
  assert.equal(c.validateBackupPayload(b).events.length,1);
});
test('backup rejeita schema futuro, datas inválidas, duplicatas e tipos incorretos', () => {
  const c=context();
  for (const mutate of [b=>b.data.version=9,b=>b.data.events[0].consumedAt=1e30,b=>b.data.events[0].consumedAt='123',b=>b.data.events.push({...b.data.events[0]}),b=>b.data.drinks.push({...drink}),b=>b.data.events[0].doseSize='quarter',b=>b.data.preferences.cleanInterface='false',b=>b.data.drinks[0].askDoseSize='false',b=>b.data.events[0].intervalMinutes=null]) {
    const b=backup(); mutate(b); assert.throws(()=>c.validateBackupPayload(b));
  }
});
test('propriedades desconhecidas não são mescladas; HTML permanece texto', () => {
  const c=context(), b=backup();
  b.data.drinks[0]=JSON.parse('{"id":"__proto__","name":"<img src=x onerror=alert(1)>","icon":"💧","intervalMinutes":60,"__proto__":{"polluted":true}}');
  const d=c.validateBackupPayload(b).drinks[0];
  assert.equal(d.name,'<img src=x onerror=alert(1)>');
  assert.equal(Object.hasOwn(d,'__proto__'),false);
  assert.equal({}.polluted,undefined);
});
test('importação limita tipos e tamanho; JSON vazio ou corrompido é rejeitado', async () => {
  const c=context();
  for (const change of [{askDoseSize:'false'},{intervalMinutes:'60'},{intervalMinutes:1.2},{icon:'x'.repeat(65)}]) {
    assert.throws(()=>c.validateDrinkExportPayload({type:'intervalo-drinks',formatVersion:1,drinks:[{...drink,...change}]}));
  }
  await assert.rejects(c.readJsonFile(new Blob(['']),10));
  await assert.rejects(c.readJsonFile(new Blob(['{']),10));
  await assert.rejects(c.readJsonFile(new Blob(['12345678901']),10));
});
test('importar bebidas preserva eventos e preferências; falha de quota preserva estado', () => {
  let saved;
  const state={drinks:[drink],events:backup().data.events,preferences:{cleanInterface:false}};
  const c=context({state,localStorage:{setItem:(key,value)=>{saved=JSON.parse(value);}}});
  c.persistDrinkList([]);
  assert.deepEqual(saved.events,state.events);
  assert.equal(saved.preferences.cleanInterface,false);
  assert.equal(Object.hasOwn(c.buildCurrentAppData(),'termsAccepted'),false);
  c.localStorage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>c.persistDrinkList([drink]));
  assert.equal(state.drinks.length,0);
});
test('falha de sessionStorage após restauração não informa falsa preservação', () => {
  let reload=false, saved=false;
  const c=context({state:{pendingBackupRestore:{data:backup().data}},localStorage:{setItem:()=>{saved=true;}},sessionStorage:{setItem:()=>{throw Error('sessão');}},closeBackupRestoreDialog:()=>{},window:{location:{reload:()=>{reload=true;}}},backupRestoreError:{hidden:true}});
  c.confirmBackupRestore();
  assert.equal(saved,true); assert.equal(reload,true); assert.equal(c.backupRestoreError.hidden,true);
});
test('falha na gravação do backup mantém o diálogo e não recarrega', () => {
  let reload=false;
  const c=context({console:{error:()=>{}},state:{pendingBackupRestore:{data:backup().data}},localStorage:{setItem:()=>{throw Error('quota');}},window:{location:{reload:()=>{reload=true;}}},backupRestoreError:{hidden:true}});
  c.confirmBackupRestore(); assert.equal(reload,false); assert.equal(c.backupRestoreError.hidden,false);
});
test('aceite requer três confirmações, persiste localmente e falha fechada', async () => {
  let value=null, fail=false;
  const handlers={}, checks=[{checked:false},{checked:false},{checked:false}];
  const elements={ '#terms-screen':{hidden:true}, '#terms-form':{querySelectorAll:()=>checks,addEventListener:(k,v)=>{handlers[k]=v;},removeEventListener:k=>delete handlers[k]}, '#terms-continue':{}, '#terms-error':{hidden:true}, '#terms-title':{focus:()=>{}} };
  const c=vm.createContext({localStorage:{getItem:()=>value,setItem:(k,v)=>{if(fail)throw Error('quota');value=v;}},document:{querySelector:k=>elements[k],body:{classList:{add:()=>{},remove:()=>{}}}}});
  vm.runInContext(fs.readFileSync('policies.js','utf8'),c);
  assert.equal(c.hasCurrentTermsAcceptance(),false);
  let resolved=false; const pending=c.requireTermsAcceptance().then(()=>{resolved=true;});
  checks[0].checked=checks[1].checked=true; handlers.change(); assert.equal(elements['#terms-continue'].disabled,true);
  handlers.submit({preventDefault(){}}); assert.equal(value,null);
  checks[2].checked=true; handlers.change(); assert.equal(elements['#terms-continue'].disabled,false);
  fail=true; handlers.submit({preventDefault(){}}); assert.equal(elements['#terms-error'].hidden,false); assert.equal(resolved,false);
  fail=false; handlers.submit({preventDefault(){}}); await pending;
  assert.equal(c.hasCurrentTermsAcceptance(),true); assert.equal(JSON.parse(value).termsVersion,'1.0');
  value=JSON.stringify({...JSON.parse(value),termsVersion:'0.9'}); assert.equal(c.hasCurrentTermsAcceptance(),false);
  value='{'; assert.equal(c.hasCurrentTermsAcceptance(),false);
});
test('shell offline inclui as políticas e todos os arquivos existem', () => {
  const sw=fs.readFileSync('sw.js','utf8');
  const shell=JSON.parse(sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1]);
  assert.ok(shell.includes('./policies.html')); assert.ok(shell.includes('./policies.js'));
  for(const path of shell) assert.ok(fs.existsSync(path));
});
