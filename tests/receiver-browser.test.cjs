// Duas versões reais em uma origem efêmera. Nunca usa armazenamento do usuário.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {pbkdf2Sync}=require('node:crypto');
const {chromium}=require('playwright');
const {bridgeFile,versionFile}=require('./bridge-fixture.cjs');
const data={version:9,drinks:[{id:'d',name:'Água',icon:'💧',intervalMinutes:30,askDoseSize:false}],events:[{id:'e',drinkId:'d',drinkName:'Nome histórico',drinkIcon:'🍍',consumedAt:1700000000000,intervalMinutes:90,doseSize:null}],preferences:{cleanInterface:true,countingMode:'normal',iconCatalog:[]}};
async function environment(run,{startAtDev2=false}={}){
  let current=!startAtDev2;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const prefix=['/intervalo/','/funtime/'].find(prefix=>url.pathname.startsWith(prefix));
    if(!prefix){res.writeHead(404).end();return;}
    const file=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
    if(file.includes('..')){res.writeHead(403).end();return;}
    let bytes;try{bytes=prefix==='/intervalo/'?bridgeFile(file):current?fs.readFileSync(path.join(process.cwd(),file)):versionFile('7c93bd2',file);}catch{}
    if(!bytes){res.writeHead(404).end();return;}
    const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{browser=await chromium.launch({headless:true,channel:process.env.PWA_BROWSER_CHANNEL||'msedge'});await run(browser,origin,()=>{current=true;});}
  finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
async function installedContext(browser){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));return ctx;
}
async function acceptTerms(page){
  await page.locator('#terms-screen').waitFor({state:'visible'});
  for(const checkbox of await page.locator('#terms-form input[type=checkbox]').all())await checkbox.check();
  await page.locator('#terms-continue').click();
  await page.waitForFunction(()=>typeof state!=='undefined'&&!document.body.classList.contains('boot-pending')&&!document.body.classList.contains('terms-pending'));
}
async function capture(page,name){
  if(process.env.PWA_SCREENSHOT_DIR){fs.mkdirSync(process.env.PWA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PWA_SCREENSHOT_DIR,name),fullPage:true});}
}
test('receptor real aguarda v1, transfere últimos dados, exige PIN e reabre offline', {timeout:90000},async()=>environment(async(browser,origin)=>{
  const ctx=await installedContext(browser);
  const errors=[];ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  const source=await ctx.newPage();await source.goto(origin+'/intervalo/');await source.locator('#terms-screen').waitFor({state:'visible'});
  const salt=Buffer.from('fixture-salt-1234');
  const pin={version:3,enabled:true,method:'pin',relockSeconds:300,pin:{salt:salt.toString('base64url'),hash:pbkdf2Sync('1234',salt,210000,32,'sha256').toString('base64url'),iterations:210000,length:4}};
  await source.evaluate(({data,pin})=>{
    localStorage.setItem('funtime-v1-data',JSON.stringify(data));localStorage.setItem('funtime-security-v1',JSON.stringify(pin));
    localStorage.setItem('funtime-terms-v1',JSON.stringify({termsAccepted:true,termsVersion:'1.0.1',termsAcceptedAt:1700000000000}));
  },{data,pin});
  await source.reload();await source.locator('#pin-unlock-value').fill('1234');await source.locator('#pin-unlock-button').click();await source.locator('#lock-screen').waitFor({state:'hidden'});
  // Visitar pelo navegador só oferece instalação e não toma posse.
  const gate=await ctx.newPage();await gate.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:false}));
  await gate.goto(origin+'/funtime/');await gate.locator('#browser-gate').waitFor({state:'visible'});
  assert.equal(await gate.evaluate(()=>localStorage.getItem('funtime-installation-owner-v1')),null);
  await gate.close();
  const target=await ctx.newPage();await target.goto(origin+'/funtime/');
  await target.waitForFunction(()=>document.querySelector('#startup-message').textContent.includes('Feche as outras'));
  assert.equal(await target.evaluate(()=>typeof state),'undefined');
  await source.evaluate(()=>persistDrinkList([...state.drinks,{id:'latest',name:'Última bebida',icon:'🍍',intervalMinutes:60,askDoseSize:false}]));
  const raw=await source.evaluate(()=>localStorage.getItem('funtime-v1-data'));
  await source.close();
  await target.getByRole('button',{name:'Continuar no FunTime 2',exact:true}).waitFor();
  assert.equal(await target.evaluate(()=>localStorage.getItem('funtime-installation-owner-v1')),null);
  await capture(target,'funtime-v2-confirmation.png');
  await target.locator('#startup-retry').click();await target.locator('#pin-unlock-value').waitFor({state:'visible'});
  assert.equal(await target.evaluate(()=>localStorage.getItem('funtime-v1-data')),raw);
  assert.equal(await target.evaluate(()=>localStorage.getItem('funtime-security-v1')),JSON.stringify(pin));
  await target.locator('#pin-unlock-value').fill('0000');await target.locator('#pin-unlock-button').click();await target.locator('#lock-error').waitFor({state:'visible'});
  await target.locator('#pin-unlock-value').fill('1234');await target.locator('#pin-unlock-button').click();await target.locator('#lock-screen').waitFor({state:'hidden'});
  assert.equal(await target.evaluate(()=>state.events[0].drinkName),'Nome histórico');
  await capture(target,'funtime-v2-home.png');
  // Pendências nos caminhos e caches antigos e novos continuam alcançáveis.
  const files=await target.evaluate(async()=>{
    for(const [name,url,filename] of [['intervalo-share-target-v1','/intervalo/__shared-drinks-import__','antigo.txt'],['funtime-share-target-v1','/funtime/__shared-drinks-import__','novo.txt']]){
      const cache=await caches.open(name);await cache.put(new URL(url,location.origin),new Response('{}',{headers:{'X-Intervalo-Filename':filename}}));
    }
    return [(await readPendingSharedDrinkFile()).name,(await readPendingSharedDrinkFile()).name,await readPendingSharedDrinkFile()];
  });assert.deepEqual(files,['antigo.txt','novo.txt',null]);
  const old=await ctx.newPage();await old.goto(origin+'/intervalo/');await old.locator('#startup-continue').waitFor({state:'visible'});
  assert.equal(await old.evaluate(()=>typeof state),'undefined');
  assert.equal(await target.evaluate(()=>localStorage.getItem('funtime-v1-data')),raw);
  await old.close();
  await ctx.setOffline(true);await target.reload();await target.waitForFunction(()=>typeof state!=='undefined'&&!document.body.classList.contains('boot-pending'));
  assert.equal(await target.evaluate(()=>state.events[0].intervalMinutes),90);
  assert.equal(await target.evaluate(()=>localStorage.getItem('funtime-v1-data')),raw);
  assert.deepEqual(errors,[]);await ctx.close();
}));
test('armazenamento isolado oferece backup, preserva prévia e exige confirmação da restauração', {timeout:60000},async()=>environment(async(browser,origin)=>{
  const ctx=await installedContext(browser);const page=await ctx.newPage();await page.goto(origin+'/funtime/');
  await page.locator('#startup-backup').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.match(await page.locator('#startup-message').textContent(),/Nenhum dado/);
  await capture(page,'funtime-v2-empty-storage.png');
  await page.locator('#startup-backup').click();await acceptTerms(page);
  await page.locator('#settings-view').waitFor({state:'visible'});await page.locator('#toast-dismiss').click();
  const payload={type:'intervalo-backup',formatVersion:1,data};
  await page.locator('#backup-restore-file').setInputFiles({name:'Intervalo-Backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
  await page.locator('#backup-restore-dialog').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('funtime-v1-data')).events.length),0);
  await page.locator('#confirm-backup-restore').click();
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.events.length===1&&!document.body.classList.contains('boot-pending'));
  assert.equal(await page.evaluate(()=>state.events[0].drinkName),'Nome histórico');
  assert.equal(await page.evaluate(()=>localStorage.getItem('funtime-security-v1')),null);
  await ctx.close();
}));
test('dados existentes sem ponte compatível bloqueiam sem tomar posse; novo usuário confirma início vazio', {timeout:60000},async()=>environment(async(browser,origin)=>{
  const ctx=await installedContext(browser);const page=await ctx.newPage();
  await page.addInitScript(data=>{if(location.pathname.startsWith('/funtime/'))localStorage.setItem('funtime-v1-data',JSON.stringify(data));},data);
  await page.goto(origin+'/funtime/');await page.locator('#startup-retry').waitFor({state:'visible'});
  assert.match(await page.locator('#startup-message').textContent(),/v1.16/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('funtime-installation-owner-v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('funtime-v1-data')),JSON.stringify(data));
  await ctx.close();
  const fresh=await installedContext(browser);const start=await fresh.newPage();await start.goto(origin+'/funtime/');
  await start.getByRole('button',{name:'Começar sem dados',exact:true}).click();await acceptTerms(start);
  assert.equal(await start.evaluate(()=>state.drinks.length),0);
  assert.equal(await start.evaluate(()=>JSON.parse(localStorage.getItem('funtime-installation-owner-v1')).generation),2);
  await fresh.close();
}));
test('dev.2 atualiza pelo botão para 2.0.1 sem repetir transferência nem alterar dados', {timeout:60000},async()=>environment(async(browser,origin,publish)=>{
  const ctx=await installedContext(browser);const page=await ctx.newPage();await page.goto(origin+'/funtime/');
  await page.getByRole('button',{name:'Começar sem dados',exact:true}).click();await acceptTerms(page);
  await page.evaluate(data=>localStorage.setItem('funtime-v1-data',JSON.stringify(data)),data);
  await page.reload();await page.waitForFunction(()=>typeof state!=='undefined'&&state.events.length===1);
  assert.equal(await page.evaluate(()=>APP_VERSION),'2.0.0-dev.2');
  const owner=await page.evaluate(()=>localStorage.getItem('funtime-installation-owner-v1'));
  publish();await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
  await page.locator('#apply-update').waitFor({state:'visible'});await page.locator('#apply-update').click();
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&APP_VERSION==='2.0.1'&&!document.body.classList.contains('boot-pending'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('funtime-installation-owner-v1')),owner);
  assert.equal(await page.evaluate(()=>localStorage.getItem('funtime-v1-data')),JSON.stringify(data));
  assert.equal(await page.locator('#startup-retry').isVisible(),false);
  await ctx.setOffline(true);await page.reload();await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&APP_VERSION==='2.0.1'&&!document.body.classList.contains('boot-pending'));
  assert.equal(await page.evaluate(()=>state.events[0].drinkName),'Nome histórico');await ctx.close();
},{startAtDev2:true}));
