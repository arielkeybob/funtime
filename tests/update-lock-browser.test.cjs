// Duas versões reais do próprio FunTime numa origem efêmera. Nunca usa armazenamento do usuário.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const currentVersion=fs.readFileSync('app.js','utf8').match(/const APP_VERSION = "([^"]+)"/)[1];
const data={version:9,drinks:[{id:'d',name:'Água',icon:'💧',intervalMinutes:30,askDoseSize:false}],events:[{id:'e',drinkId:'d',drinkName:'Nome histórico',drinkIcon:'🍍',consumedAt:1700000000000,intervalMinutes:90,doseSize:null}],preferences:{cleanInterface:true,countingMode:'normal',iconCatalog:[]}};
const OLD_BUILD_COMMIT='7c93bd2';
const oldBuildCache=new Map();
function oldBuildFile(file){
  const key=`${OLD_BUILD_COMMIT}:${file}`;
  if(!oldBuildCache.has(key)){
    try{oldBuildCache.set(key,execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'show',key],{stdio:['ignore','pipe','ignore']}));}
    catch{oldBuildCache.set(key,null);}
  }
  return oldBuildCache.get(key);
}
async function environment(run){
  let current=false;
  const server=http.createServer((req,res)=>{
    const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/^\/funtime\//,''))||'index.html';
    if(file.includes('..')){res.writeHead(403).end();return;}
    let bytes;try{bytes=current?fs.readFileSync(path.join(process.cwd(),file)):oldBuildFile(file);}catch{}
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
  await ctx.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true,configurable:true});try { localStorage.setItem('funtime-tutorial-v1', '{"seen":true,"at":0}'); } catch (e) {}});return ctx;
}
async function acceptTerms(page){
  await page.locator('#terms-screen').waitFor({state:'visible'});
  for(const checkbox of await page.locator('#terms-form input[type=checkbox]').all())await checkbox.check();
  await page.locator('#terms-continue').click();
  await page.waitForFunction(()=>typeof state!=='undefined'&&!document.body.classList.contains('boot-pending')&&!document.body.classList.contains('terms-pending'));
}
test(`build antiga atualiza pelo botão para ${currentVersion} sem alterar dados`, {timeout:60000},async()=>environment(async(browser,origin,publish)=>{
  const ctx=await installedContext(browser);const page=await ctx.newPage();await page.goto(origin+'/funtime/');
  // A build antiga (commit congelado) ainda mostra a tela de escolha da migração v1; a build atual não tem mais essa tela.
  await page.getByRole('button',{name:'Começar sem dados',exact:true}).click();await acceptTerms(page);
  await page.evaluate(data=>localStorage.setItem('funtime-v1-data',JSON.stringify(data)),data);
  await page.reload();await page.waitForFunction(()=>typeof state!=='undefined'&&state.events.length===1);
  publish();await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
  await page.locator('#apply-update').waitFor({state:'visible'});await page.locator('#apply-update').click();
  await page.waitForFunction(version=>typeof APP_VERSION!=='undefined'&&APP_VERSION===version&&!document.body.classList.contains('boot-pending'),currentVersion);
  assert.equal(await page.evaluate(()=>localStorage.getItem('funtime-v1-data')),JSON.stringify(data));
  assert.equal(await page.locator('#startup-retry').isVisible(),false);
  await ctx.setOffline(true);await page.reload();await page.waitForFunction(version=>typeof APP_VERSION!=='undefined'&&APP_VERSION===version&&!document.body.classList.contains('boot-pending'),currentVersion);
  assert.equal(await page.evaluate(()=>state.events[0].drinkName),'Nome histórico');await ctx.close();
}));
