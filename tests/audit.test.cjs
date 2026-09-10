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
  const ctx = vm.createContext({ console, Blob, File, crypto: require('node:crypto').webcrypto, FunTimeOccasions: require("../occasions.js"), ...extra });
  vm.runInContext(`const DATA_VERSION=11, PICKER_ICONS=["🍺","💧"], DEFAULT_ICON='🍺', DRINK_EXPORT_TYPE='funtime-drinks', DRINK_EXPORT_FORMAT_VERSION=1, BACKUP_EXPORT_TYPE='funtime-backup', BACKUP_EXPORT_FORMAT_VERSION=2, DATA_STORAGE_KEY='funtime-v1-data';`, ctx);
  for (const name of ['normalizeIconCatalog', 'persistIconCatalog', 'createId', 'normalizeIcon', 'normalizeIntervalMinutes', 'normalizeDoseSize', 'normalizeData', 'normalizeImportedDrink', 'validateDrinkExportPayload', 'validateBackupPayload', 'confirmBackupRestore', 'buildCurrentAppData', 'persistDrinkList']) vm.runInContext(extract(name), ctx);
  vm.runInContext('async ' + extract('readJsonFile'), ctx);
  return ctx;
}
const drink = {id:'d1', name:'Água', icon:'💧', intervalMinutes:60, askDoseSize:false};
test('backup preserva contagem encerrada e rejeita marca inválida sem mudar snapshots', () => {
  const c = context(), b = backup();
  b.data.events[0].countingStoppedAt = 1700000001000;
  const result = c.validateBackupPayload(b);
  assert.equal(result.events[0].countingStoppedAt, 1700000001000);
  assert.equal(result.events[0].consumedAt, b.data.events[0].consumedAt);
  assert.equal(result.events[0].intervalMinutes, b.data.events[0].intervalMinutes);
  for (const bad of [null, '1700000001000', Infinity, 1e30]) {
    b.data.events[0].countingStoppedAt = bad;
    assert.throws(() => c.validateBackupPayload(b));
  }
  delete b.data.events[0].countingStoppedAt;
  assert.equal(Object.hasOwn(c.validateBackupPayload(b).events[0], 'countingStoppedAt'), false);
});
test('reordenar catálogo preserva seleção de dados, backup e ordem em falha de gravação', () => {
  let saved;
  const state = { drinks: [drink], events: backup().data.events, preferences: { cleanInterface: true, iconCatalog: ['🍺', '💧', '⭐'] } };
  const c = context({ state, localStorage: { setItem: (key, value) => { saved = JSON.parse(value); } } });
  vm.runInContext(extract('moveCatalogIcon'), c);
  assert.equal(c.moveCatalogIcon('🍺', 2), true);
  assert.deepEqual(Array.from(state.preferences.iconCatalog), ['💧', '⭐', '🍺']);
  assert.deepEqual(saved.drinks, state.drinks);
  assert.deepEqual(saved.events, state.events);
  assert.deepEqual(Array.from(c.validateBackupPayload({ type: 'funtime-backup', formatVersion: 1, data: saved }).preferences.iconCatalog), ['💧', '⭐', '🍺']);
  for (const index of [-1, 3, 0.5, NaN]) assert.equal(c.moveCatalogIcon('🍺', index), false);
  assert.equal(c.moveCatalogIcon('❌', 0), false);
  assert.equal(c.moveCatalogIcon('🍺', 2), false);
  c.localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => c.moveCatalogIcon('🍺', 0), /quota/);
  assert.deepEqual(Array.from(state.preferences.iconCatalog), ['💧', '⭐', '🍺']);
});
function backup() { return {type:'intervalo-backup',formatVersion:1,data:{version:8,drinks:[{...drink}],events:[{id:'e1',drinkId:'d1',drinkName:'Água',drinkIcon:'💧',consumedAt:1700000000000,intervalMinutes:60,doseSize:null}],preferences:{cleanInterface:true}}}; }

test('backup válido conserva snapshots; bebida excluída continua restaurável', () => {
  const c=context(), b=backup(); b.data.events[0].intervalMinutes=90;
  assert.equal(c.validateBackupPayload(b).events[0].intervalMinutes,90);
  b.data.drinks=[];
  assert.equal(c.validateBackupPayload(b).events.length,1);
});

test('FunTime lê arquivos das duas marcas e distingue bebidas de backup', () => {
  const c=context();
  for (const prefix of ['intervalo', 'funtime']) {
    const b=backup(); b.type=`${prefix}-backup`;
    assert.equal(c.validateBackupPayload(b).events[0].id,'e1');
    const drinks={type:`${prefix}-drinks`,formatVersion:1,drinks:[drink]};
    assert.equal(c.validateDrinkExportPayload(drinks).length,1);
    assert.throws(()=>c.validateDrinkExportPayload(b),/Restaurar backup/);
    assert.throws(()=>c.validateBackupPayload(drinks),/Importar bebidas/);
  }
});
test('backup rejeita schema futuro, datas inválidas, duplicatas e tipos incorretos', () => {
  const c=context();
  for (const mutate of [b=>b.data.version=12,b=>b.data.events[0].consumedAt=1e30,b=>b.data.events[0].consumedAt='123',b=>b.data.events.push({...b.data.events[0]}),b=>b.data.drinks.push({...drink}),b=>b.data.events[0].doseSize='quarter',b=>b.data.preferences.cleanInterface='false',b=>b.data.drinks[0].askDoseSize='false',b=>b.data.events[0].intervalMinutes=null]) {
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
  assert.equal(c.hasCurrentTermsAcceptance(),true); assert.equal(JSON.parse(value).termsVersion,'1.0.1');
  value=JSON.stringify({...JSON.parse(value),termsVersion:'0.9'}); assert.equal(c.hasCurrentTermsAcceptance(),false);
  value='{'; assert.equal(c.hasCurrentTermsAcceptance(),false);
});
test('shell offline inclui as políticas e todos os arquivos existem', () => {
  const sw=fs.readFileSync('sw.js','utf8');
  const shell=JSON.parse(sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1]);
  assert.ok(shell.includes('./policies.html')); assert.ok(shell.includes('./policies.js'));
  for(const path of shell) assert.ok(fs.existsSync(path));
});

test('rascunho restaura marcações ao voltar, sem aceitar; nova versão zera escolhas', async () => {
  const storage = new Map();
  let accepted = null;
  const sessionStorage = {getItem:key=>storage.get(key) ?? null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key)};
  function open(version = '1.0') {
    const handlers = {}, checks = [{checked:false},{checked:false},{checked:false}];
    const elements = {'#terms-screen':{},'#terms-form':{querySelectorAll:()=>checks,addEventListener:(key,fn)=>{handlers[key]=fn;},removeEventListener:key=>delete handlers[key]},'#terms-continue':{},'#terms-error':{},'#terms-title':{focus(){}}};
    const ctx = vm.createContext({sessionStorage,localStorage:{getItem:()=>accepted,setItem:(key,value)=>{accepted=value;}},document:{querySelector:key=>elements[key],body:{classList:{add(){},remove(){}}}}});
    vm.runInContext(fs.readFileSync('policies.js','utf8').replace(/const TERMS_VERSION = "[^"]+";/, `const TERMS_VERSION = "${version}";`),ctx);
    const pending=ctx.requireTermsAcceptance();
    return {ctx,checks,handlers,elements,pending};
  }
  const first=open();
  first.checks[0].checked=first.checks[1].checked=true;
  first.handlers.change();
  const returned=open();
  assert.deepEqual(returned.checks.map(input=>input.checked),[true,true,false]);
  assert.equal(returned.elements['#terms-continue'].disabled,true);
  assert.equal(accepted,null);
  returned.checks[2].checked=true; returned.handlers.change();
  returned.handlers.submit({preventDefault(){}}); await returned.pending;
  assert.equal(storage.size,0);
  assert.equal(JSON.parse(accepted).termsVersion,'1.0');
  storage.set('intervalo-terms-draft-v1',JSON.stringify({termsVersion:'1.0',checks:[true,true,true]}));
  const updated=open('1.0.1');
  assert.equal(updated.ctx.hasCurrentTermsAcceptance(),false);
  assert.deepEqual(updated.checks.map(input=>input.checked),[false,false,false]);
  assert.equal(updated.elements['#terms-continue'].disabled,true);
  assert.equal(updated.elements['#terms-screen'].hidden,false);
  updated.checks.forEach(input=>{input.checked=true;}); updated.handlers.change();
  updated.handlers.submit({preventDefault(){}}); await updated.pending;
  assert.equal(JSON.parse(accepted).termsVersion,'1.0.1');
  assert.equal(open('1.0.1').ctx.hasCurrentTermsAcceptance(),true);
  accepted=null;
  storage.set('intervalo-terms-draft-v1','{');
  assert.deepEqual(open('1.0.1').checks.map(input=>input.checked),[false,false,false]);
});

test('catálogo migra backups antigos e preserva lista vazia e ordem personalizada', () => {
 const c=context(), b=backup();
 assert.deepEqual(Array.from(c.validateBackupPayload(b).preferences.iconCatalog), ['🍺','💧']);
 b.data.version=9; b.data.preferences.iconCatalog=[];
 assert.equal(c.validateBackupPayload(b).preferences.iconCatalog.length,0);
 b.data.preferences.iconCatalog=['🧋','⭐'];
 assert.deepEqual(Array.from(c.validateBackupPayload(b).preferences.iconCatalog),['🧋','⭐']);
 for(const bad of [null, '🍺', [''], ['⭐','⭐'], [42], Array(101).fill('⭐')]) {
   b.data.preferences.iconCatalog=bad; assert.throws(()=>c.validateBackupPayload(b));
 }
});
test('catálogo interno tem opções únicas por categoria e inclui todos os padrões', () => {
 const c=vm.createContext({});
 vm.runInContext(fs.readFileSync('emoji-data.js', 'utf8'),c);
 const groups=vm.runInContext('EMOJI_GROUPS',c);
 const icons=groups.flatMap(group=>group.icons);
 assert.equal(icons.length,1906);
 assert.equal(new Set(icons).size,1906);
 assert.ok(icons.every(icon => !/[\u{1F3FB}-\u{1F3FF}]/u.test(icon)));
 for (const icon of ['👋', '👍', '🙏', '🧑', '👨', '👩', '🧙‍♂️', '🤝']) assert.ok(icons.includes(icon), icon);
 const segmenter = new Intl.Segmenter('pt', {granularity:'grapheme'});
 for (const icon of icons) { assert.ok(icon.length <= 64); assert.equal([...segmenter.segment(icon)].length,1,icon); }
 for(const group of groups) assert.equal(new Set(group.icons).size,group.icons.length);
 const defaults=vm.runInNewContext(source.match(/const PICKER_ICONS = (\[[\s\S]*?\]);/)[1]);
 for(const icon of defaults) assert.ok(icons.includes(icon),icon);
 const h=fs.readFileSync('index.html','utf8');
 assert.equal(h.includes('id="custom-icon"'),false);
});
test('normalização de atualização preserva exclusões, ordem e catálogo vazio', () => {
 const c=context(), b=backup();b.data.version=9;b.data.preferences.iconCatalog=['⭐'];
 const updated=c.normalizeData(b.data);
 assert.deepEqual(Array.from(updated.preferences.iconCatalog),['⭐']);
 updated.preferences.iconCatalog=[];
 assert.equal(c.normalizeData(updated).preferences.iconCatalog.length,0);
});
test('salvar catálogo preserva bebidas e snapshots e só muda estado após gravar', () => {
 let saved;
 const state={drinks:[drink],events:backup().data.events,preferences:{cleanInterface:false,iconCatalog:['💧']}};
 const c=context({state,localStorage:{setItem:(k,v)=>{saved=JSON.parse(v);}}});
 c.persistIconCatalog([]);
 assert.deepEqual(saved.drinks,state.drinks); assert.deepEqual(saved.events,state.events);
 assert.equal(saved.preferences.cleanInterface,false); assert.equal(state.preferences.iconCatalog.length,0);
 c.localStorage.setItem=()=>{throw Error('quota');};
 assert.throws(()=>c.persistIconCatalog(['⭐'])); assert.equal(state.preferences.iconCatalog.length,0);
});


test('rolagem sincroniza categoria; dropdown salta sem rolar o formulário', () => {
 const category={value:'0'};
 const grid={scrollTop:0,clientHeight:216,scrollHeight:1200,getBoundingClientRect:()=>({top:100})};
 grid.children=[0,400,800].map((offset,index)=>({dataset:{category:String(index)},getBoundingClientRect:()=>({top:100+offset-grid.scrollTop})}));
 const c=vm.createContext({document:{querySelector:selector=>selector==='#emoji-menu'?grid:category}});
 vm.runInContext(extract('syncEmojiCategory')+'\n'+extract('scrollToEmojiCategory'),c);
 grid.scrollTop=450;c.syncEmojiCategory();assert.equal(category.value,'1');
 grid.scrollTop=50;c.syncEmojiCategory();assert.equal(category.value,'0');
 category.value='2';c.scrollToEmojiCategory();assert.equal(grid.scrollTop,800);
 c.syncEmojiCategory();assert.equal(category.value,'2');
 grid.scrollTop=984;c.syncEmojiCategory();assert.equal(category.value,'2');
 category.value='0';c.scrollToEmojiCategory();assert.equal(grid.scrollTop,0);
});


test('preferência de contagem migra como regressiva e é preservada no backup', () => {
 const c=context(), b=backup();
 assert.equal(c.normalizeData(b.data).preferences.countingMode,'countdown');
 b.data.preferences.countingMode='normal';
 assert.equal(c.validateBackupPayload(b).preferences.countingMode,'normal');
 b.data.preferences.countingMode='invalid';assert.throws(()=>c.validateBackupPayload(b));
});

test('contadores usam timestamps e intervalo histórico, com limites e transição', () => {
 const c=vm.createContext({state:{preferences:{countingMode:'normal'}}});
 for (const name of ['formatTime','formatHistoryElapsed','formatHistoryCounter','formatActivityCounter']) vm.runInContext(extract(name),c);
 const activity={latestEvent:{intervalMinutes:90},remainingMs:5400000};
 assert.equal(c.formatActivityCounter(activity),'Contando: 00:00:00');
 activity.remainingMs=5398500;assert.equal(c.formatActivityCounter(activity),'Contando: 00:00:01');
 activity.remainingMs=-1000;assert.equal(c.formatActivityCounter(activity),'Contando: 01:30:00');
 activity.remainingMs=5500000;assert.equal(c.formatActivityCounter(activity),'Contando: 00:00:00');
 assert.equal(c.formatHistoryCounter(100000,90,100000),'Falta 01:30');
 assert.equal(c.formatHistoryCounter(100000,1,159999),'Falta 00:01');
 assert.equal(c.formatHistoryCounter(100000,90,160000),'Falta 01:29');
 assert.equal(c.formatHistoryCounter(100000,60,100000),'Falta 01:00');
 assert.equal(c.formatHistoryCounter(100000,1440,100000),'Falta 24:00');
 assert.equal(c.formatHistoryCounter(100000,1,160000),'1 min atrás');
 c.state.preferences.countingMode='countdown';
 assert.equal(c.formatHistoryCounter(100000,90,160000),'1 min atrás');
 activity.remainingMs=5399000;assert.equal(c.formatActivityCounter(activity),'Falta: -01:29:59');
});

test('falha ao salvar contagem preserva a preferência anterior e dados', () => {
 const state={preferences:{countingMode:'countdown'},drinks:[drink],events:backup().data.events};
 let saved;
 const c=context({state, countingModeInput:{value:'normal'},refreshDataViews:()=>{},showToast:()=>{},showAppNotification:()=>{},localStorage:{setItem:(k,v)=>{saved=JSON.parse(v);}}});
 vm.runInContext(extract('changeCountingMode'),c);
 c.changeCountingMode('normal');assert.equal(saved.preferences.countingMode,'normal');assert.deepEqual(saved.events,state.events);
 c.localStorage.setItem=()=>{throw Error('quota');};c.changeCountingMode('countdown');
 assert.equal(state.preferences.countingMode,'normal');assert.equal(c.countingModeInput.value,'normal');
});

test('Anterior mostra horário antes de 24h e data local curta a partir de 24h', () => {
  const c = context({ setClockStatus: (element, prefix, timestamp, suffix) => { element.textContent = prefix + ' horário' + suffix; } });
  vm.runInContext(extract('setPreviousStatus'), c);
  const timestamp = new Date(2026, 8, 6, 23, 30).getTime();
  const element = {};
  c.setPreviousStatus(element, timestamp, ' · Meia', timestamp + 86400000 - 1);
  assert.equal(element.textContent, 'Anterior: horário · Meia');
  for (const elapsed of [86400000, 86400001, 3 * 86400000]) {
    c.setPreviousStatus(element, timestamp, ' · Meia', timestamp + elapsed);
    assert.equal(element.textContent, 'Anterior: 06/09/26 · Meia');
  }
  c.setPreviousStatus(element, timestamp, '', timestamp + 86400000);
  assert.equal(element.textContent, 'Anterior: 06/09/26');
});

test('histórico troca horário por data no limite de 24h durante a atualização', () => {
  const timestamp = new Date(2026, 8, 6, 23, 30).getTime();
  const element = { dataset: {} };
  const c = context({
    setClockStatus: (el, prefix) => { el.textContent = prefix + ' horário'; },
    document: { querySelectorAll: selector => selector === '[data-history-timestamp]' ? [element] : [] },
  });
  for (const name of ['setPreviousStatus', 'setHistoryClockLabel', 'updateHistoryElapsedLabels']) vm.runInContext(extract(name), c);
  c.setHistoryClockLabel(element, timestamp, timestamp + 86400000 - 1);
  assert.equal(element.textContent, 'às horário');
  vm.runInContext(`Date.now = () => ${timestamp + 86400000}`, c);
  c.updateHistoryElapsedLabels();
  assert.equal(element.textContent, 'em 06/09/26');
});
