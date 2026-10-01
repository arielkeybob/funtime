// Navegador real, origem efêmera. Animação "atualizando" (abacaxi trocando óculos e canudo): roda uma única
// vez em 8 s (styles.css, @keyframes pine-*-swap), a recarga espera o fim dela e, depois dela, o abacaxi
// fica parado. A "versão anterior" é a própria árvore atual com outro número de versão.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const currentVersion=fs.readFileSync('app.js','utf8').match(/const APP_VERSION = "([^"]+)"/)[1];
const OLD_VERSION='1.0.0';
const ANIMATION_MS=8000;
const SLACK_MS=150;
const renumber=bytes=>Buffer.from(bytes.toString('utf8').replaceAll(currentVersion,OLD_VERSION)
  .replaceAll(`funtime-v2-${currentVersion.replaceAll('.','-')}`,`funtime-v2-${OLD_VERSION.replaceAll('.','-')}`));
// 'completa' renumera sw.js, boot.js e app.js até publish(): a janela abre normal e depois chega a versão atual.
// 'so-worker' renumera só o primeiro sw.js: o worker ativo fica mais velho que o boot.js e a tela de início bloqueia.
async function environment(previous,run,contextOptions){
  let published=false,workerRequests=0;
  const server=http.createServer((req,res)=>{
    const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/^\/funtime\//,''))||'index.html';
    if(file.includes('..')){res.writeHead(403).end();return;}
    if(file==='sw.js')workerRequests++;
    let bytes;try{bytes=fs.readFileSync(path.join(process.cwd(),file));}catch{}
    if(!bytes){res.writeHead(404).end();return;}
    const older=previous==='completa'?!published&&['sw.js','boot.js','app.js'].includes(file):file==='sw.js'&&workerRequests===1;
    if(older)bytes=renumber(bytes);
    const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{browser=await chromium.launch({headless:true,channel:process.env.PWA_BROWSER_CHANNEL||'msedge'});await run(browser,origin,()=>{published=true;});}
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
const runningAnimations=(page,selector)=>page.evaluate(selector=>[...document.querySelector(selector).getAnimations({subtree:true})].map(a=>{const timing=a.effect.getComputedTiming();return{name:a.animationName,iterations:timing.iterations,duration:timing.duration};}),selector);
// Clique em Atualizar → a animação roda uma vez; o worker novo assume antes do fim, mas a página só recarrega nele.
async function assertUpdateWaitsForAnimation(page,artSelector,clickUpdate){
  await page.evaluate(()=>{window.__mesmaPagina=true;});
  const clickedAt=Date.now();await clickUpdate();
  await page.locator(`${artSelector}.is-updating`).waitFor({state:'attached'});
  const running=await runningAnimations(page,artSelector);
  assert.deepEqual(running.map(a=>a.name).sort(),['pine-glasses-swap','pine-straw-swap']);
  for(const animation of running){assert.equal(animation.iterations,1,'sem loop');assert.equal(animation.duration,ANIMATION_MS);}
  await page.waitForTimeout(5000-(Date.now()-clickedAt));
  assert.equal(await page.evaluate(()=>window.__mesmaPagina===true),true,'ainda na mesma página aos 5 s');
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=event=>resolve(event.data.version);navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'},[channel.port2]);})),currentVersion,'o worker novo já assumiu');
  await page.waitForFunction(()=>window.__mesmaPagina===undefined);
  const elapsed=Date.now()-clickedAt;
  assert.ok(elapsed>=ANIMATION_MS-SLACK_MS,`recarregou antes do fim da animação (${elapsed} ms)`);
  assert.ok(elapsed<ANIMATION_MS+5000,`recarga demorou demais (${elapsed} ms)`);
  await page.waitForFunction(version=>typeof APP_VERSION!=='undefined'&&APP_VERSION===version&&!document.body.classList.contains('boot-pending'),currentVersion);
}
test('aviso do rodapé: Atualizar cobre a tela com a animação e a recarga espera o fim dela',{timeout:60000},async()=>environment('completa',async(browser,origin,publish)=>{
  const ctx=await installedContext(browser);const page=await ctx.newPage();await page.goto(origin+'/funtime/');await acceptTerms(page);
  publish();await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
  await page.locator('#apply-update').waitFor({state:'visible'});
  assert.equal(await page.locator('#updating-overlay').isVisible(),false);
  await assertUpdateWaitsForAnimation(page,'#updating-overlay .updating-art',async()=>{
    await page.locator('#apply-update').click();
    await page.locator('#updating-overlay').waitFor({state:'visible'});
    assert.equal(await page.locator('#update-toast').isVisible(),false);
  });
  await ctx.close();
}));
test('tela de início bloqueante: Atualizar mostra a animação e a recarga espera o fim dela',{timeout:60000},async()=>environment('so-worker',async(browser,origin)=>{
  const ctx=await installedContext(browser);const page=await ctx.newPage();await page.goto(origin+'/funtime/');
  await page.locator('#startup-retry').waitFor({state:'visible'});
  assert.equal(await page.locator('#startup-retry').textContent(),'Atualizar');
  assert.equal(await page.locator('#startup-screen').evaluate(screen=>screen.classList.contains('is-update')),true);
  assert.deepEqual(await runningAnimations(page,'#startup-art .updating-art'),[],'parado até o toque');
  await assertUpdateWaitsForAnimation(page,'#startup-art .updating-art',async()=>{
    await page.locator('#startup-retry').click();
    assert.equal(await page.locator('#startup-retry').textContent(),'Atualizando…');
  });
  await ctx.close();
}));
test('depois da execução o abacaxi fica parado, sem loop; movimento reduzido não anima',{timeout:30000},async()=>environment('completa',async(browser,origin)=>{
  const addArt=page=>page.evaluate(()=>{const art=document.querySelector('#updating-art').content.firstElementChild.cloneNode(true);art.id='teste-art';document.body.append(art);art.classList.add('is-updating');});
  const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();await page.goto(origin+'/funtime/');
  await page.waitForFunction(()=>!document.body.classList.contains('boot-pending'));
  const startedAt=Date.now();await addArt(page);
  await page.waitForFunction(()=>document.querySelector('#teste-art').getAnimations({subtree:true}).every(a=>a.playState==='finished'),null,{timeout:15000});
  assert.ok(Date.now()-startedAt>=ANIMATION_MS-SLACK_MS,'terminou antes dos 8 s');
  await page.waitForTimeout(1500);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelector('#teste-art').getAnimations({subtree:true})].map(a=>a.playState)),['finished','finished'],'não recomeça');
  assert.deepEqual(await page.evaluate(()=>['.pine-glasses','.pine-straw'].map(part=>{const style=getComputedStyle(document.querySelector(`#teste-art ${part}`));return[style.transform,style.opacity];})),[['none','1'],['none','1']]);
  await ctx.close();
  const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const quiet=await reduced.newPage();await quiet.goto(origin+'/funtime/');
  await quiet.waitForFunction(()=>!document.body.classList.contains('boot-pending'));await addArt(quiet);
  assert.deepEqual(await runningAnimations(quiet,'#teste-art'),[]);await reduced.close();
}));
