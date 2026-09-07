const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('ícones declarados têm dimensões PNG corretas e identidade v2',()=>{
  const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
  assert.equal(manifest.id,'/funtime/');
  assert.equal(manifest.icons.filter(icon=>icon.purpose==='maskable').length,1);
  for(const icon of manifest.icons){
    const png=fs.readFileSync(icon.src);
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
  }
  for(const file of ['index.html','policies.html','sw.js','manifest.webmanifest']){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/v164\.png/);
  }
});
test('prévia não acessa armazenamento, não registra worker e não abre app',async()=>{
  const elements=new Map();
  const context=vm.createContext({
    document:{querySelector(selector){if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);}},
    navigator:{serviceWorker:{addEventListener(){},register(){assert.fail('Não registrar worker');}}},
    window:{addEventListener(){}},
    localStorage:{getItem(){assert.fail('Não ler dados');}},
    console
  });
  vm.runInContext(fs.readFileSync('boot.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(elements.get('#startup-message').textContent,/em preparação/);
  assert.equal(elements.get('#startup-continue').hidden,true);
  assert.equal(elements.get('#startup-retry').hidden,true);
});
