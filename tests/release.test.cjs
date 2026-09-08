const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {bridgeFile}=require('./bridge-fixture.cjs');
test('marcador de lançamento é reconhecido pela ponte v1.16 já publicada',()=>{
  const context=vm.createContext({URL});
  vm.runInContext(bridgeFile('transition.js').toString(),context);
  const marker=JSON.parse(fs.readFileSync('transition.json','utf8'));
  const release=context.FunTimeTransition.parseRelease(marker,'https://arielkeybob.github.io');
  assert.ok(release);assert.equal(release.appVersion,'2.0.0');
  assert.equal(release.url,'https://arielkeybob.github.io/funtime/');
  assert.equal(marker.dataVersion,9);
  assert.equal(context.FunTimeTransition.ownerKey,'funtime-installation-owner-v1');
  assert.ok(!Object.hasOwn(marker,'claimedAt'));
});
