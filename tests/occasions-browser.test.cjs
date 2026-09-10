const { test } = require('node:test'); const assert = require('node:assert/strict');
const { chromium } = require('playwright'); const { createDevServer } = require('../scripts/dev-server.cjs');
test('agenda compacta, evento, edição, agendamento automático, aviso e persistência', { timeout: 90000 }, async () => {
 const server = createDevServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/funtime/`);
  await page.getByRole('button',{name:'Começar sem dados',exact:true}).click();
  for(const box of await page.locator('#terms-form input[type=checkbox]').all()) await box.check();
  await page.locator('#terms-continue').click(); await page.waitForFunction(()=>!document.body.classList.contains('boot-pending'));
  await page.locator('#nav-occasion').click(); await page.locator('#occasion-new').click(); await page.locator('#occasion-name').fill('Aniversário do João');
  await page.locator('#occasion-submit').click(); await page.waitForFunction(()=>state.currentView==='home');
  await page.evaluate(()=>{state.drinks=[{id:'d', name:'Água', icon:'💧', intervalMinutes:60, askDoseSize:false}]; registerDrinkAt('d', Date.now());});
  const id=await page.evaluate(()=>state.occasions[0].id);
  assert.equal(await page.evaluate(()=>state.events[0].occasionId),id);
  await page.locator('#nav-occasion').click(); await page.locator('#occasion-current .agenda-row').click();
  await page.getByRole('button',{name:'Ver registros',exact:true}).click(); assert.equal(await page.locator('.history-event').count(),1);
  await page.locator('#nav-occasion').click(); await page.locator('#occasion-current .agenda-row').click();
  await page.getByRole('button',{name:'Encerrar evento',exact:true}).click(); await page.locator('#app-confirm-accept').click(); await page.waitForFunction(()=>state.currentView==='home');
  assert.ok((await page.locator('[data-drink-id=d]').getAttribute('class')).includes('waiting'));
  await page.locator('#nav-occasion').click(); await page.locator('#agenda-past').click(); await page.locator('#occasion-list .agenda-row').click();
  await page.locator('.agenda-options summary').click(); await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.locator('#occasion-name').fill('João editado'); await page.locator('#occasion-submit').click();
  assert.equal(await page.evaluate(()=>state.occasions[0].name),'João editado');
  await page.locator('#occasion-new').click(); await page.locator('#occasion-mode').selectOption('scheduled'); await page.locator('#occasion-name').fill('Churrasco');
  await page.locator('#occasion-auto').check(); await page.locator('#occasion-has-end').check();
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'funtime-agenda-form.png')});
  await page.locator('#occasion-submit').click(); assert.equal(await page.locator('#occasion-list .agenda-row').count(),1);
  assert.equal(await page.evaluate(()=>FunTimeOccasions.active(state.occasions)),null);
  await page.evaluate(()=>{window.realNow=Date.now;window.agendaClock=state.occasions[1].scheduledStartAt;Date.now=()=>window.agendaClock;reconcileOccasions();});
  assert.equal(await page.evaluate(()=>FunTimeOccasions.active(state.occasions).name),'Churrasco');
  await page.evaluate(()=>{window.agendaClock=state.occasions[1].scheduledEndAt;reconcileOccasions();});
  assert.equal(await page.evaluate(()=>state.occasions[1].endReason),'scheduled');
  await page.evaluate(()=>{Date.now=realNow; const start=Date.now()+1800000;commitOccasions([...state.occasions,{id:'manual',name:'Evento hoje',startedAt:null,endedAt:null,scheduledStartAt:start,autoStart:false}]);closeHistoryView();refreshOccasionReminder();});
  assert.equal(await page.locator('#occasion-reminder').isVisible(),true); await page.getByRole('button',{name:'Agora não',exact:true}).click();
  await page.evaluate(()=>refreshOccasionReminder()); assert.equal(await page.locator('#occasion-reminder').isVisible(),false);
  await page.reload(); await page.waitForFunction(()=>typeof state!=='undefined'&&state.occasions?.length===3);
  assert.equal(await page.locator('#occasion-reminder').isVisible(),false);
  await page.locator('#nav-occasion').click(); await page.locator('#agenda-past').click();
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'funtime-agenda.png')});
  assert.equal(await page.locator('#occasion-list .agenda-row').count(),2);
  await page.evaluate(()=>{const payload={type:BACKUP_EXPORT_TYPE,formatVersion:2,data:buildCurrentAppData()}; const next=validateBackupPayload(payload);if(next.occasions[2].scheduledStartAt!==state.occasions[2].scheduledStartAt)throw Error('agenda perdida');});
  await page.evaluate(()=>{
    state.occasions = Array.from({length:100},(_,i)=>({id:'agenda'+i,name:'Agenda '+String(i).padStart(3,'0'),startedAt:null,endedAt:null,scheduledStartAt:Date.now()+(i+7)*86400000,autoStart:false}));
    state.events=[]; saveData(); refreshOccasionFilters();
  });
  await page.locator('#agenda-upcoming').click(); assert.equal(await page.locator('#occasion-list .agenda-row').count(),20);
  await page.locator('#agenda-more').click(); assert.equal(await page.locator('#occasion-list .agenda-row').count(),40);
  await page.locator('.agenda-filters summary').click(); await page.locator('#agenda-search').fill('Agenda 099');
  assert.equal(await page.locator('#occasion-list .agenda-row').count(),1);
  await page.locator('#occasion-list .agenda-row').click(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#agenda-search').inputValue(),'Agenda 099');
  for(const width of [320,1024]) {await page.setViewportSize({width,height:844});assert.ok(await page.locator('.bottom-nav').evaluate(node=>node.getBoundingClientRect().right<=innerWidth));}
  await page.evaluate(()=>{
    state.occasions=[{id:'recover',name:'Recuperação',startedAt:Date.now()-49*3600000,endedAt:null}]; saveData();
    window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota');};
    reconcileOccasions();
  });
  assert.equal(await page.evaluate(()=>state.occasions[0].endedAt),null);
  await page.evaluate(()=>{Storage.prototype.setItem=realSetItem;occasionRetryAt=0;reconcileOccasions();});
  assert.equal(await page.evaluate(()=>state.occasions[0].endReason),'empty48h');
  assert.deepEqual(errors,[]);
 } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
});
