const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync('reset.js', 'utf8');
function context() {
  const nodes = new Map();
  const node = id => { if(!nodes.has(id)) nodes.set(id,{hidden:false,value:'1234',disabled:false,open:true,addEventListener(){},focus(){},close(){this.open=false;}}); return nodes.get(id); };
  const data={version:9,drinks:[{id:'d',name:'Água',icon:'💧'}],events:[{id:'e',drinkId:'d',drinkName:'Água',drinkIcon:'💧',consumedAt:1000}],preferences:{cleanInterface:false,iconCatalog:['⭐']}};
  const state={...data,securityConfig:{enabled:true,method:'pin'},securityLocked:false,pinFailedAttempts:0,pinLockoutUntil:0};
  const storage=new Map([['data',JSON.stringify(data)],['security',JSON.stringify(state.securityConfig)],['legacy','old'],['intervalo-terms-v1','accepted'],['other-app','keep']]);
  const c=vm.createContext({state,Date,console,PICKER_ICONS:['🍺','💧'],DATA_STORAGE_KEY:'data',SECURITY_STORAGE_KEY:'security',LEGACY_DRINKS_STORAGE_KEY:'legacy',SECURITY_SESSION_KEY:'session',SHARE_IMPORT_CACHE_NAME:'shared',PIN_LOCKOUT_ATTEMPTS:5,PIN_LOCKOUT_MS:30000,
    document:{querySelector:node,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{removeItem(){}},window:{caches:{},location:{reload(){c.reloaded=true;}}},caches:{delete:async()=>true},
    buildCurrentAppData:()=>({version:9,drinks:state.drinks,events:state.events,preferences:state.preferences}),hideToast(){},applyInterfacePreferences(){},refreshDataViews(){},updateDataSettingsUI(){},showToast(){},getDefaultSecurityConfig:()=>({enabled:false,method:null}),clearTimeout(){},getConfiguredPinLength:()=>4,normalizePinInput:i=>i.value,getPinLockoutRemainingMs:()=>Math.max(0,state.pinLockoutUntil-Date.now()),verifyPin:async()=>true,verifyDeviceCredential:async()=>true});
  vm.runInContext(source,c);
  c.prepare=action=>{c.action=action;vm.runInContext(`resetPending={action,confirmed:true,plan:planDataReset(buildCurrentAppData(),action,{period:'all',drinkIds:['d'],withHistory:true}),snapshot:JSON.stringify(buildCurrentAppData()),storedSnapshot:localStorage.getItem(DATA_STORAGE_KEY),securitySnapshot:JSON.stringify(state.securityConfig),storedSecuritySnapshot:localStorage.getItem(SECURITY_STORAGE_KEY)};`,c);};
  c.storage=storage;c.nodes=nodes;return c;
}
test('períodos incluem limites por consumedAt e não incluem registros futuros',()=>{
 const c=context(),now=10000000000;
 for(const minutes of [30,60,120,300,1440,2880,10080,43200]) {
  const from=now-minutes*60000;
  const data={drinks:[],events:[{id:'old',consumedAt:from-1},{id:'edge',consumedAt:from},{id:'now',consumedAt:now},{id:'future',consumedAt:now+1}]};
  assert.deepEqual(Array.from(c.planDataReset(data,'history',{period:minutes},now).eventIds),['edge','now']);
  assert.equal(c.planDataReset(data,'history',{period:'all'},now).eventIds.length,4);
 }
 assert.throws(()=>c.planDataReset({drinks:[],events:[]},'history',{period:31}));
});
test('excluir bebidas selecionadas permite manter snapshots ou apagar apenas histórico relacionado',()=>{
 const c=context(),data=c.buildCurrentAppData();data.events.push({id:'orphan',drinkId:'gone',drinkName:'Antiga',drinkIcon:'⭐'});
 for(const withHistory of [true,false]) {
  const plan=c.planDataReset(data,'drinks',{drinkIds:['d'],withHistory});const next=c.applyDataReset(data,plan);
  assert.equal(next.drinks.length,0);assert.equal(next.events.length,withHistory?1:2);
  assert.equal(next.events.at(-1).drinkName,'Antiga');
 }
});
test('reset de ícones preserva bebidas, histórico e preferências restantes',()=>{
 const c=context(),data=c.buildCurrentAppData();const next=c.applyDataReset(data,c.planDataReset(data,'icons'));
 assert.equal(next.events[0].drinkIcon,'💧');assert.equal(next.drinks[0].id,'d');assert.equal(next.preferences.cleanInterface,false);
 assert.deepEqual(Array.from(next.preferences.iconCatalog),['🍺','💧']);
});
test('PIN incorreto e bloqueio de tentativas impedem exclusão',async()=>{
 const c=context();c.prepare('all');c.verifyPin=async()=>false;
 for(let i=0;i<5;i++){c.nodes.get('#reset-pin')&&(c.nodes.get('#reset-pin').value='1234');await c.submitDataReset({preventDefault(){}});}
 assert.equal(c.state.events.length,1);assert.ok(c.state.pinLockoutUntil>Date.now());
 c.verifyPin=async()=>true;await c.submitDataReset({preventDefault(){}});assert.equal(c.state.events.length,1);
});
test('cancelar durante autenticação ou mudar dados invalida autorização',async()=>{
 for(const kind of ['cancel','data','security']) {
  const c=context();c.prepare('all');c.verifyPin=async()=>{if(kind==='cancel')c.closeDataReset();if(kind==='data')c.state.events.push({id:'new'});if(kind==='security')c.storage.set('security','changed');return true;};
  await c.submitDataReset({preventDefault(){}});assert.ok(c.state.drinks.length);assert.equal(c.storage.get('legacy'),'old');
 }
});
test('falha de gravação mantém memória e armazenamento anteriores',async()=>{
 const c=context();c.prepare('history');c.localStorage.setItem=()=>{throw Error('quota');};
 await c.submitDataReset({preventDefault(){}});assert.equal(c.state.events.length,1);assert.equal(JSON.parse(c.storage.get('data')).events.length,1);
});
test('apagar tudo limpa dados e proteção sem apagar aceite ou outras aplicações',async()=>{
 const c=context();c.prepare('all');await c.submitDataReset({preventDefault(){}});
 assert.equal(c.state.events.length,0);assert.equal(c.state.drinks.length,0);assert.equal(c.state.preferences.cleanInterface,true);
 assert.equal(c.storage.has('legacy'),false);assert.equal(c.storage.has('security'),false);assert.equal(c.storage.get('intervalo-terms-v1'),'accepted');assert.equal(c.storage.get('other-app'),'keep');assert.equal(c.reloaded,true);
});
test('falha parcial mantém estado vazio válido e informa resultado parcial',async()=>{
 const c=context();c.prepare('all');c.caches.delete=async()=>{throw Error('cache');};await c.submitDataReset({preventDefault(){}});
 assert.equal(JSON.parse(c.storage.get('data')).events.length,0);assert.equal(c.storage.has('security'),true);assert.match(c.nodes.get('#reset-error').textContent,/limpeza complementar/);
});

test('biometria cancelada não executa; biometria confirmada executa uma vez',async()=>{
 for(const success of [false,true]) {
  const c=context();c.state.securityConfig.method='device';c.storage.set('security',JSON.stringify(c.state.securityConfig));c.prepare('history');
  c.verifyDeviceCredential=async()=>{if(!success){const e=Error('cancel');e.name='NotAllowedError';throw e;}return true;};
  await c.submitDataReset({preventDefault(){}});assert.equal(c.state.events.length,success?0:1);
 }
});
test('sem proteção a ação exige configuração; diálogo fechado invalida resultado',async()=>{
 const c=context();c.prepare('all');c.state.securityConfig.enabled=false;await c.submitDataReset({preventDefault(){}});
 assert.equal(c.state.drinks.length,1);assert.equal(c.nodes.get('#reset-setup').hidden,false);
 const d=context();d.prepare('history');d.verifyPin=async()=>{d.nodes.get('#reset-dialog').open=false;return true;};await d.submitDataReset({preventDefault(){}});assert.equal(d.state.events.length,1);
});
