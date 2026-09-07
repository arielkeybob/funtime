// Requer Playwright e Edge. Servidor e perfis temporários: nunca usa armazenamento real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pbkdf2Sync}=require('node:crypto');
const {chromium}=require('playwright');
const baselines={ '1.14.3':'06feefe693059ce7ff5586e04ce847e704eacdec', '1.15.0':'5edf167ee9943ef836689af50d9a43f606c10861' };

for(const [baseVersion,baseline] of Object.entries(baselines)) test(`atualização real do SW: v${baseVersion} → v1.16.0, PIN, duas janelas, arquivos e offline`, {timeout:90000}, async()=>{
  let current=false;
  const old=new Map(),root=process.cwd();
  const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root});
  const files=git('ls-tree','-r','--name-only',baseline).toString().trim().split(/\r?\n/);
  for(const file of files) old.set(file,git('show',`${baseline}:${file}`));
  const server=http.createServer((req,res)=>{
    const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
    if(file.includes('..')){res.writeHead(403).end();return;}
    let bytes;
    try{bytes=current?fs.readFileSync(path.join(root,file)):old.get(file);}catch{}
    if(!bytes){res.writeHead(404).end();return;}
    const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(file)]||'text/plain';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/`;
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PWA_BROWSER_CHANNEL||'msedge'});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(()=>{
      Object.defineProperty(navigator,'standalone',{value:true});
      // Exercitar download de forma determinística; a folha nativa é validada no aparelho.
      Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true});
    });
    const errors=[];
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    const a=await context.newPage();
    await a.goto(base);
    await a.evaluate(()=>navigator.serviceWorker.ready);
    // A v1.15 recarrega após a primeira ativação do SW. Só semear depois do boot.
    await a.locator('#terms-screen').waitFor({state:'visible'});
    const data={version:9,drinks:[{id:'d',name:'Teste de migração',icon:'🍍',intervalMinutes:30,askDoseSize:false}],events:[{id:'e',drinkId:'d',drinkName:'Snapshot preservado',drinkIcon:'💧',consumedAt:1700000000000,intervalMinutes:90,doseSize:null}],preferences:{cleanInterface:true,countingMode:'normal',iconCatalog:[]}};
    const salt=Buffer.from('fixture-salt-1234');
    const protection={version:3,enabled:true,method:'pin',relockSeconds:0,pin:{salt:salt.toString('base64url'),hash:pbkdf2Sync('1234',salt,210000,32,'sha256').toString('base64url'),iterations:210000,length:4}};
    const seed={'balada-v1-data':JSON.stringify(data),'intervalo-security-v1':JSON.stringify(protection),'intervalo-terms-v1':JSON.stringify({termsAccepted:true,termsVersion:'1.0.1',termsAcceptedAt:1700000000000})};
    const input=baseVersion==='1.15.0'?Object.fromEntries(Object.entries(seed).map(([key,value])=>[key.replace('balada-v1-data','funtime-v1-data').replace('intervalo-','funtime-'),value])):seed;
    await a.evaluate(seed=>{for(const [k,v]of Object.entries(seed))localStorage.setItem(k,v);},input);
    await a.reload();await a.locator('#pin-unlock-value').waitFor({state:'visible'});
    // Uma segunda janela antiga permanece aberta quando o usuário atualiza a primeira.
    const b=await context.newPage();await b.goto(base);
    if(baseVersion==='1.15.0')await b.waitForFunction(()=>document.querySelector('#startup-message').textContent.includes('outra janela'));
    else await b.locator('#pin-unlock-value').waitFor({state:'visible'});
    current=true;
    await a.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
    await a.locator('#apply-update').waitFor({state:'visible'});
    await a.locator('#pin-unlock-value').fill('1234');await a.locator('#pin-unlock-button').click();
    await a.locator('#lock-screen').waitFor({state:'hidden'});
    await a.locator('#apply-update').click();
    await a.waitForFunction(()=>document.querySelector('.app-footer-meta').textContent.includes('1.16.0'));
    await b.waitForFunction(()=>document.querySelector('.app-footer-meta').textContent.includes('1.16.0'));
    await a.waitForFunction(()=>localStorage.getItem('funtime-migration-v1')===JSON.stringify({version:1,phase:'done'}));
    const pages=[a,b];
    let active;
    for(let i=0;i<100;i++){
      for(const p of pages){if(await p.evaluate(()=>!document.body.classList.contains('boot-pending')))active=p;}
      if(active)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(active,'uma janela deve abrir com bloqueio preservado');
    const parked=pages.find(p=>p!==active);
    assert.equal(await parked.locator('#startup-screen').isVisible(),true);
    assert.match(await parked.locator('#startup-message').textContent(),/outra janela/);
    const actual=await active.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
    assert.equal(actual['funtime-v1-data'],seed['balada-v1-data']);
    assert.equal(actual['funtime-security-v1'],seed['intervalo-security-v1']);
    assert.equal(actual['funtime-terms-v1'],seed['intervalo-terms-v1']);
    assert.equal(actual['balada-v1-data'],undefined);
    await active.evaluate(()=>lockApp());
    await active.locator('#pin-unlock-value').fill('0000');await active.locator('#pin-unlock-button').click();
    await active.locator('#lock-error').waitFor({state:'visible'});assert.equal(await active.locator('#lock-screen').isVisible(),true);
    await active.locator('#pin-unlock-value').fill('1234');await active.locator('#pin-unlock-button').click();
    await active.locator('#lock-screen').waitFor({state:'hidden'});
    assert.equal(await active.evaluate(()=>state.events[0].drinkName),'Snapshot preservado');
    assert.equal(await active.locator('#terms-screen').isVisible(),false);
    if(process.env.PWA_SCREENSHOT_DIR){
      fs.mkdirSync(process.env.PWA_SCREENSHOT_DIR,{recursive:true});
      await active.screenshot({path:path.join(process.env.PWA_SCREENSHOT_DIR,'funtime-v116-home.png'),fullPage:true});
    }
    const formats=await active.evaluate(()=>({drinks:DRINK_EXPORT_TYPE,backup:BACKUP_EXPORT_TYPE,data:DATA_VERSION}));
    assert.deepEqual(formats,{drinks:'funtime-drinks',backup:'funtime-backup',data:9});
    await active.evaluate(()=>openSettingsView());
    for(const [button,prefix,type] of [['#export-drinks','FunTime-Bebidas-','funtime-drinks'],['#create-backup','FunTime-Backup-','funtime-backup']]){
      const downloadPromise=active.waitForEvent('download',{timeout:10000});await active.locator(button).click();
      const download=await downloadPromise.catch(async error=>{throw new Error(`${button}: ${error.message}; ${JSON.stringify(await active.evaluate(()=>({view:state.currentView,locked:state.securityLocked,drinks:state.drinks.length,version:APP_VERSION,notice:document.querySelector('#toast-message').textContent})))}`);});
      assert.ok(download.suggestedFilename().startsWith(prefix));
      const payload=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(payload.type,type);
      assert.equal(JSON.stringify(payload).includes(protection.pin.hash),false);
      if(type==='funtime-backup')assert.deepEqual(payload.data,data);
      else assert.equal(payload.events,undefined);
    }
    for(const prefix of ['intervalo','funtime']){
      const payload={type:`${prefix}-drinks`,formatVersion:1,drinks:data.drinks};
      await active.locator('#drink-import-file').setInputFiles({name:`${prefix}.txt`,mimeType:'text/plain',buffer:Buffer.from(JSON.stringify(payload))});
      await active.locator('#drink-import-dialog').waitFor({state:'visible'});
      assert.equal(await active.evaluate(()=>state.events[0].id),'e');
      await active.locator('#confirm-drink-import').click();
      await active.locator('#drink-import-dialog').waitFor({state:'hidden'});
      assert.deepEqual(await active.evaluate(()=>JSON.parse(localStorage.getItem('funtime-v1-data'))),data);
    }
    const shared=await active.evaluate(async()=>{
      const url=new URL('./__shared-drinks-import__',location.href).href;
      for(const [name,header,filename]of [['intervalo-share-target-v1','X-Intervalo-Filename','antigo.txt'],['funtime-share-target-v1','X-FunTime-Filename','novo.txt']]){
        const cache=await caches.open(name);await cache.put(url,new Response('{}',{headers:{[header]:encodeURIComponent(filename)}}));
      }
      const first=await readPendingSharedDrinkFile(),second=await readPendingSharedDrinkFile(),third=await readPendingSharedDrinkFile();
      return [first.name,second.name,third];
    });
    assert.deepEqual(shared,['antigo.txt','novo.txt',null]);
    // A próxima janela só carrega seu estado após adquirir a exclusividade.
    await active.close();await parked.locator('#pin-unlock-value').waitFor({state:'visible'});
    await parked.locator('#pin-unlock-value').fill('1234');await parked.locator('#pin-unlock-button').click();
    await parked.locator('#lock-screen').waitFor({state:'hidden'});
    await parked.evaluate(()=>openSettingsView());
    const backup={type:'intervalo-backup',formatVersion:1,data};
    await parked.locator('#backup-restore-file').setInputFiles({name:'Intervalo-Backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await parked.locator('#backup-restore-dialog').waitFor({state:'visible'});
    assert.equal(await parked.evaluate(()=>localStorage.getItem('funtime-security-v1')),seed['intervalo-security-v1']);
    await Promise.all([parked.waitForEvent('domcontentloaded'), parked.locator('#confirm-backup-restore').click()]);
    await parked.waitForFunction(()=>!document.body.classList.contains('boot-pending')&&typeof state!=='undefined');
    await context.setOffline(true);await parked.reload();
    await parked.locator('#pin-unlock-value').waitFor({state:'visible'});
    assert.equal(await parked.title(),'Início · FunTime');
    assert.deepEqual(await parked.evaluate(()=>JSON.parse(localStorage.getItem('funtime-v1-data'))),data);
    assert.deepEqual(errors,[]);
    await context.close();
    // A página comum de instalação não migra dados nem disputa a janela instalada.
    const gate=await browser.newContext();const page=await gate.newPage();await page.goto(base);
    await page.locator('#browser-gate').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>localStorage.length),0);
    await gate.close();
    const fresh=await browser.newContext();await fresh.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
    const first=await fresh.newPage();await first.goto(base);await first.locator('#terms-screen').waitFor({state:'visible'});
    assert.deepEqual(await first.evaluate(()=>JSON.parse(localStorage.getItem('funtime-v1-data')).events),[]);
    await fresh.close();
    const invalid=await browser.newContext();
    await invalid.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});if(location.protocol==='http:')localStorage.setItem('intervalo-security-v1',JSON.stringify({enabled:true,method:'pin'}));});
    const blocked=await invalid.newPage();await blocked.goto(base);await blocked.locator('#startup-retry').waitFor({state:'visible'});
    assert.match(await blocked.locator('#startup-message').textContent(),/interrompida/);
    assert.equal(await blocked.evaluate(()=>typeof state),'undefined');
    assert.equal(await blocked.evaluate(()=>localStorage.getItem('funtime-v1-data')),null);
    await invalid.close();
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
