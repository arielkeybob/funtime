const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const nodes = {};
  const timers = new Map();
  let blob;
  const node = id => nodes[id] ||= { disabled: false, checked: false, textContent: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, click() { this.listeners.click?.(); }, remove() {} };
  node('.app-footer-meta').textContent = 'v2.0.5 · By: arielkeybob';
  const ctx = vm.createContext({ document: { querySelector: node, createElement: () => node('link'), body: { append() {} } },
    Blob, URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
    navigator: { userAgent: 'Test browser', maxTouchPoints: 5 }, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    performance: { now: () => 1000 }, setTimeout(fn, ms) { timers.set(ms, fn); return ms; }, clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(fs.readFileSync('touch-debug.js', 'utf8'), ctx);
  return { ctx, node, timers, enable() { node('#touch-debug-enabled').checked = true; node('#touch-debug-enabled').listeners.change(); }, async report() { node('#export-touch-debug').click(); return JSON.parse(await blob.text()); } };
}

test('diagnóstico começa desligado, não persiste nem copia conteúdo do evento', async () => {
  const s = setup();
  s.ctx.FunTimeTouchDebug.record('press-start', { type: 'touchstart' });
  assert.equal(s.node('#export-touch-debug').disabled, true);
  s.enable();
  s.ctx.FunTimeTouchDebug.record('press-start', { type: 'touchstart', pointerType: 'touch', width: 45, target: 'Nome privado', value: 'PIN', clientX: 123 });
  const report = await s.report();
  assert.equal(report.events.length, 2);
  assert.equal(report.events[1].width, 45);
  for (const privateValue of ['Nome privado', 'PIN', 'clientX']) assert.equal(JSON.stringify(report).includes(privateValue), false);
  s.timers.get(600000)();
  assert.equal(s.node('#touch-debug-enabled').checked, false);
  s.ctx.FunTimeTouchDebug.record('press-start');
  assert.equal((await s.report()).events.length, 2);
  s.node('#clear-touch-debug').click();
  assert.equal(s.node('#export-touch-debug').disabled, true);
});

test('diagnóstico limita memória a 1500 eventos e reativar limpa a sessão', async () => {
  const s = setup(); s.enable();
  for (let i = 0; i < 1600; i++) s.ctx.FunTimeTouchDebug.record('press-end');
  assert.equal((await s.report()).events.length, 1500);
  assert.equal(s.node('#touch-debug-enabled').checked, false);
  s.enable();
  assert.equal((await s.report()).events.length, 1);
});
