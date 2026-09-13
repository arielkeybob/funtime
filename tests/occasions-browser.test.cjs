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
  assert.equal(await page.locator('#nav-occasion').isVisible(),false);
  await page.locator('#open-settings').click();
  assert.equal(await page.locator('#events-enabled').isChecked(),false);
  await page.locator('label[for=events-enabled]').click();
  assert.equal(await page.locator('#nav-occasion').isVisible(),true);
  await page.locator('#nav-occasion').click();
  assert.deepEqual(await page.locator('.agenda-tabs button').allTextContents(), ['Anteriores', 'Próximos']);
  await page.locator('#occasion-new').click();
  assert.equal(await page.locator('#occasion-start').evaluate(el=>el.parentElement.hidden),true);
  await page.locator('#occasion-mode').selectOption('scheduled');
  await page.locator('#occasion-name').fill('Evento passado');
  await page.evaluate(()=>{
    const start=Date.now()-7*86400000;
    state.drinks=[{id:'old',name:'Água',icon:'💧',intervalMinutes:60,askDoseSize:false}];
    registerDrinkAt('old',start+3600000);
    document.getElementById('occasion-start').value=occasionInput(start);
    document.getElementById('occasion-start').dispatchEvent(new Event('input',{bubbles:true}));
    document.getElementById('occasion-end').value=occasionInput(start+7200000);
  });
  assert.equal(await page.locator('#occasion-past-notice').isVisible(),true);
  await page.locator('#occasion-has-end').check();
  await page.locator('#occasion-submit').click();
  await page.waitForFunction(()=>!document.getElementById('occasion-dialog').open);
  assert.equal(await page.evaluate(()=>state.events[0].occasionId===state.occasions[0].id),true);
  assert.equal(await page.evaluate(()=>state.occasions[0].endedAt!==null),true);
  await page.evaluate(()=>{
    const next=FunTimeOccasions.configure(buildCurrentAppData(),false);
    state.historyOccasionId='none'; commitOccasions(next.occasions,next.events,next.preferences); openHistoryView();
  });
  assert.equal(await page.locator('#history-occasion-filter').isVisible(),false);
  assert.equal(await page.locator('.history-event').count(),1);
  assert.equal(await page.locator('.history-event-detail').count(),0);
  assert.match(await page.locator('.history-event-mobile-time').textContent(),/^em \d{2}\/\d{2}\/\d{2}$/);
  await page.locator('.history-event').click();
  assert.equal(await page.locator('#record-occasion').isVisible(),false);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    const next=FunTimeOccasions.configure(buildCurrentAppData(),true);
    commitOccasions(next.occasions,next.events,next.preferences); renderHistory();
  });
  assert.equal(await page.locator('#history-occasion-filter').isVisible(),true);
  assert.equal(await page.locator('.history-event-detail').textContent(),'Evento passado');
  await page.evaluate(() => {
    const firstOccasion = state.occasions[0];
    state.drinks.push({id:'wine', name:'Vinho', icon:'🍷', intervalMinutes:60, askDoseSize:false});
    state.occasions.push({id:'other-occasion', name:'Somente outra bebida', startedAt:Date.now()-3600000, endedAt:Date.now()});
    state.events.push(
      {id:'wine-with-event', drinkId:'wine', drinkName:'Vinho', drinkIcon:'🍷', consumedAt:firstOccasion.startedAt+1000, occasionId:firstOccasion.id, intervalMinutes:60},
      {id:'wine-without-event', drinkId:'wine', drinkName:'Vinho', drinkIcon:'🍷', consumedAt:Date.now()-1000, occasionId:null, intervalMinutes:60},
      {id:'other-drink-event', drinkId:'old', drinkName:'Água', drinkIcon:'💧', consumedAt:Date.now()-2000, occasionId:'other-occasion', intervalMinutes:60}
    );
    openHistoryView('wine');
  });
  await page.locator('#history-occasion-filter').click();
  assert.deepEqual(await page.locator('.history-filter-option').allTextContents(), [
    'Todos os eventos', 'Sem evento', 'Evento passado · ' + await page.evaluate(() => toLocalDateInputValue(state.occasions[0].startedAt))
  ]);
  assert.equal(await page.getByRole('option', {name:/Somente outra bebida/}).count(), 0);
  await page.getByRole('option', {name:'Sem evento', exact:true}).click();
  assert.equal(await page.locator('#history-occasion-filter-label').textContent(), 'Sem evento');
  assert.equal(await page.locator('.history-event').count(), 1);
  assert.equal(await page.evaluate(() => state.historyOccasionId), 'none');
  await page.evaluate(()=>{
    state.drinks=[];commitOccasions([],[]);
    state.securityConfig={version:3,enabled:true,method:'pin',relockSeconds:300,eventUnlockOccasionId:null,pin:{salt:'salt',hash:'hash',iterations:210000,length:4},webauthn:null};
    saveSecurityConfig();
  });
  await page.locator('#nav-occasion').click(); await page.locator('#occasion-new').click(); await page.locator('#occasion-name').fill('Aniversário do João');
  assert.equal(await page.locator('#occasion-unlock').isVisible(),true);
  await page.locator('#occasion-unlock').check();
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'funtime-event-form-unlock.png')});
  await page.locator('#occasion-submit').click(); await page.waitForFunction(()=>state.currentView==='home');
  assert.equal(await page.evaluate(()=>state.securityConfig.eventUnlockOccasionId),await page.evaluate(()=>state.occasions[0].id));
  assert.equal(await page.locator('#home-occasion').evaluate(el=>el.classList.contains('is-active')),true);
  assert.match(await page.locator('#home-occasion').textContent(),/^🎉 /);
  const activeHeight=await page.locator('#home-occasion').evaluate(el=>el.getBoundingClientRect().height);
  assert.equal(await page.locator('#home-occasion').evaluate(el=>{el.classList.remove('is-active');const height=el.getBoundingClientRect().height;refreshOccasionContext();return height;}),activeHeight);
  assert.equal(await page.locator('#home-occasion').evaluate(el=>getComputedStyle(el).animationDuration),'6s');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#home-occasion').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#home-occasion').click();
  assert.equal(await page.locator('#occasion-detail-dialog').isVisible(),true);
  assert.equal(await page.locator('#occasion-detail-content h2').textContent(),'Aniversário do João');
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'funtime-event-unlock.png')});
  assert.equal(await page.getByRole('checkbox',{name:/Manter app desbloqueado/}).isVisible(),true);
  assert.equal(await page.getByRole('checkbox',{name:/Manter app desbloqueado/}).isChecked(),true);
  assert.equal(await page.evaluate(()=>state.securityConfig.eventUnlockOccasionId),await page.evaluate(()=>state.occasions[0].id));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('funtime-security-v1')).eventUnlockOccasionId),await page.evaluate(()=>state.occasions[0].id));
  await page.evaluate(()=>document.querySelector('#lock-now').click());
  assert.equal(await page.evaluate(()=>state.securityLocked),true);
  assert.equal(await page.evaluate(()=>state.securityConfig.eventUnlockOccasionId),null);
  await page.evaluate(()=>{unlockApp();openOccasionDetails(state.occasions[0].id);});
  await page.getByRole('checkbox',{name:/Manter app desbloqueado/}).check();
  assert.equal(await page.evaluate(()=>state.currentView),'home');
  await page.locator('#occasion-detail-close').click();
  await page.evaluate(()=>{state.drinks=[{id:'d', name:'Água', icon:'💧', intervalMinutes:60, askDoseSize:false}]; registerDrinkAt('d', Date.now());});
  const id=await page.evaluate(()=>state.occasions[0].id);
  assert.equal(await page.evaluate(()=>state.events[0].occasionId),id);
  await page.locator('#nav-occasion').click(); await page.locator('#occasion-current .agenda-row').click();
  await page.getByRole('button',{name:'Ver registros',exact:true}).click(); assert.equal(await page.locator('.history-event').count(),1);
  await page.locator('#nav-occasion').click(); await page.locator('#occasion-current .agenda-row').click();
  await page.getByRole('button',{name:'Encerrar evento',exact:true}).click(); await page.locator('#app-confirm-accept').click(); await page.waitForFunction(()=>state.currentView==='home');
  assert.equal(await page.evaluate(()=>state.securityConfig.eventUnlockOccasionId),null);
  assert.ok((await page.locator('[data-drink-id=d]').getAttribute('class')).includes('waiting'));
  await page.locator('#nav-occasion').click(); await page.locator('#agenda-past').click(); await page.locator('#occasion-list .agenda-row').click();
  assert.equal(await page.getByText('Mais opções',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Reabrir',exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Excluir evento',exact:true}).isVisible(),true);
  await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'funtime-event-actions.png')});
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.locator('#occasion-name').fill('João editado'); await page.locator('#occasion-submit').click();
  assert.equal(await page.evaluate(()=>state.occasions[0].name),'João editado');
  await page.locator('#occasion-new').click(); await page.locator('#occasion-mode').selectOption('scheduled'); await page.locator('#occasion-name').fill('Churrasco');
  assert.equal(await page.locator('#occasion-unlock-field').isVisible(),false);
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
  await page.locator('#open-settings').click();
  await page.locator('label[for=events-enabled]').click();
  assert.equal(await page.locator('#nav-occasion').isVisible(),false);
  await page.reload();
  await page.waitForFunction(()=>typeof state!=='undefined'&&!document.body.classList.contains('boot-pending'));
  assert.equal(await page.evaluate(()=>state.preferences.eventsEnabled),false);
  assert.equal(await page.locator('#nav-occasion').isVisible(),false);
  await page.evaluate(()=>{const payload={type:BACKUP_EXPORT_TYPE,formatVersion:2,data:buildCurrentAppData()};if(validateBackupPayload(payload).preferences.eventsEnabled!==false)throw Error('preferência perdida');});
  assert.deepEqual(errors,[]);
 } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
});
