// Receptor de teste, não uma implementação ou publicação da v2.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const {bridgeFile}=require('./bridge-fixture.cjs');
const receiver=`<!doctype html><meta charset="utf-8"><p id="status">Pronto</p>
<script src="/intervalo/transition.js"></script><script>
window.takeOver = async () => {
  const registration = await navigator.serviceWorker.getRegistration('/intervalo/');
  const proof = await new Promise((resolve,reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(Error('Sem ponte')); },10000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
    registration.active.postMessage({type:'FUNTIME_PREPARE'},[channel.port2]);
  });
  if (!proof.ready || proof.protocol!==2 || proof.transitionProtocol!==1) throw Error('Ponte incompatível');
  document.querySelector('#status').textContent='Aguardando';
  await navigator.locks.request(FunTimeTransition.writerLock,async () => {
    const raw=localStorage.getItem('funtime-v1-data');
    const data=JSON.parse(raw);
    if(data.version!==9 || !Array.isArray(data.drinks) || !Array.isArray(data.events))throw Error('Dados inválidos');
    window.received=raw;
    const record=JSON.stringify({version:1,generation:2,targetPath:'/funtime/',claimedAt:Date.now(),dataVersion:9});
    localStorage.setItem(FunTimeTransition.ownerKey,record);
    if(localStorage.getItem(FunTimeTransition.ownerKey)!==record)throw Error('Falha no registro');
    document.querySelector('#status').textContent='Transferido';
    await new Promise(()=>{});
  });
};
</script>`;

test('duas instalações na mesma origem: receptor aguarda, v1 para antes de ler dados e funciona offline', {timeout:60000},async()=>{
  const root=process.cwd();
  let releaseReady=false;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/funtime/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(receiver);return;}
    if(url.pathname==='/funtime/transition.json'){
      if(!releaseReady){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({version:1,generation:2,status:'ready',targetPath:'/funtime/',appVersion:'2.0.0',transitionProtocol:1,publishedAt:1700000000000,dataVersion:9}));return;
    }
    if(!url.pathname.startsWith('/intervalo/')){res.writeHead(404).end();return;}
    const file=decodeURIComponent(url.pathname.slice('/intervalo/'.length))||'index.html';
    if(file.includes('..')){res.writeHead(403).end();return;}
    try{
      const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain';
      const bytes=bridgeFile(file);if(!bytes){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(bytes);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PWA_BROWSER_CHANNEL||'msedge'});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
    const source=await context.newPage();await source.goto(`${origin}/intervalo/`);
    await source.locator('#terms-screen').waitFor({state:'visible'});
    const data={version:9,drinks:[],events:[],preferences:{cleanInterface:true,countingMode:'normal',iconCatalog:[]}};
    await source.evaluate(data=>{
      localStorage.setItem('funtime-v1-data',JSON.stringify(data));
      localStorage.setItem('funtime-terms-v1',JSON.stringify({termsAccepted:true,termsVersion:'1.0.1',termsAcceptedAt:1700000000000}));
    },data);
    await source.reload();await source.waitForFunction(()=>!document.body.classList.contains('boot-pending')&&typeof state!=='undefined');
    assert.equal(await source.locator('#startup-continue').isVisible(),false);
    releaseReady=true;
    await source.reload();await source.locator('#startup-continue').waitFor({state:'visible'});
    assert.match(await source.locator('#startup-message').textContent(),/2\.0\.0 está disponível/);
    assert.equal(await source.locator('#startup-continue').getAttribute('href'),`${origin}/funtime/`);
    assert.equal(await source.locator('#startup-retry').textContent(),'Continuar na versão 1.16');
    if(process.env.PWA_SCREENSHOT_DIR){fs.mkdirSync(process.env.PWA_SCREENSHOT_DIR,{recursive:true});await source.screenshot({path:path.join(process.env.PWA_SCREENSHOT_DIR,'funtime-v116-release.png'),fullPage:true});}
    await source.locator('#startup-retry').click();
    await source.waitForFunction(()=>!document.body.classList.contains('boot-pending')&&typeof state!=='undefined');
    const target=await context.newPage();await target.goto(`${origin}/funtime/`);
    await target.evaluate(()=>{window.takeOver().catch(error=>window.transferError=error.message);});
    await target.waitForFunction(()=>document.querySelector('#status').textContent==='Aguardando'||window.transferError);
    assert.equal(await target.evaluate(()=>window.transferError),undefined);
    assert.equal(await source.evaluate(()=>localStorage.getItem('funtime-installation-owner-v1')),null);
    // O receptor precisa receber inclusive uma gravação feita depois do pedido de transferência.
    await source.evaluate(()=>persistDrinkList([{id:'latest',name:'Última bebida',icon:'💧',intervalMinutes:30,askDoseSize:false}]));
    const latest=await source.evaluate(()=>localStorage.getItem('funtime-v1-data'));
    await source.close();await target.waitForFunction(()=>document.querySelector('#status').textContent==='Transferido'||window.transferError);
    assert.equal(await target.evaluate(()=>window.transferError),undefined);
    assert.equal(await target.evaluate(()=>window.received),latest);
    const old=await context.newPage();
    await old.addInitScript(()=>{
      window.storageReads=[];const original=Storage.prototype.getItem;
      Storage.prototype.getItem=function(key){window.storageReads.push(key);return original.call(this,key);};
    });
    await old.goto(`${origin}/intervalo/`);await old.locator('#startup-continue').waitFor({state:'visible'});
    assert.equal(await old.locator('#startup-continue').getAttribute('href'),`${origin}/funtime/`);
    assert.equal(await old.evaluate(()=>typeof state),'undefined');
    assert.deepEqual(await old.evaluate(()=>window.storageReads),['funtime-installation-owner-v1']);
    assert.equal(await target.evaluate(()=>localStorage.getItem('funtime-v1-data')),latest);
    if(process.env.PWA_SCREENSHOT_DIR){fs.mkdirSync(process.env.PWA_SCREENSHOT_DIR,{recursive:true});await old.screenshot({path:path.join(process.env.PWA_SCREENSHOT_DIR,'funtime-v116-transition.png'),fullPage:true});}
    // Mesmo um schema futuro não deve ser lido ou normalizado pela instalação antiga.
    await target.evaluate(()=>{const data=JSON.parse(localStorage.getItem('funtime-v1-data'));data.version=10;localStorage.setItem('funtime-v1-data',JSON.stringify(data));});
    await context.setOffline(true);await old.reload();await old.locator('#startup-continue').waitFor({state:'visible'});
    assert.equal(await old.evaluate(()=>typeof state),'undefined');
    assert.equal(await target.evaluate(()=>JSON.parse(localStorage.getItem('funtime-v1-data')).version),10);
    await target.evaluate(()=>localStorage.setItem('funtime-installation-owner-v1','{'));
    await old.reload();await old.locator('#startup-retry').waitFor({state:'visible'});
    assert.equal(await old.locator('#startup-continue').isVisible(),false);
    assert.equal(await old.evaluate(()=>typeof state),'undefined');
    await context.close();
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
