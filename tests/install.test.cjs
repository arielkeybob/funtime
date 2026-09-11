const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8').split('const DATA_STORAGE_KEY')[0];
function setup(apps, unlocked = true) {
  const nodes = {};
  const listeners = {};
  const timers = new Map();
  let timerId = 0;
  const navigator = { userAgent: '', getInstalledRelatedApps: async () => apps };
  const context = vm.createContext({ URL, console, navigator,
    window: { navigator, location: { href: 'https://example.com/funtime/' },
      matchMedia: () => ({ matches: false }),
      setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
      clearTimeout: id => timers.delete(id),
      addEventListener: (name, fn) => { listeners[name] = fn; } },
    document: { querySelector: id => nodes[id] ??= {}, addEventListener() {} }
  });
  vm.runInContext(source, context);
  if (unlocked) vm.runInContext('browserInstallUnlocked = true', context);
  return { context, nodes, listeners, navigator, timers };
}
test('instalação v2 remove convite para instalar e atualiza ao retornar', async () => {
  const { context, nodes, listeners, navigator } = setup([
    { platform: 'webapp', url: 'https://example.com/funtime/manifest.webmanifest', id: '/funtime/' }
  ]);
  await context.refreshBrowserInstallUI();
  assert.equal(nodes['#browser-install-status-title'].textContent, 'App já instalado');
  assert.equal(nodes['#browser-gate-lead'].hidden, true);
  assert.equal(nodes['#browser-install-button'].hidden, true);
  navigator.getInstalledRelatedApps = async () => [];
  await listeners.focus();
  assert.equal(nodes['#browser-install-guidance'].hidden, false);
  assert.equal(nodes['#browser-gate-lead'].hidden, false);
});

test('visitante só libera instalação ao completar a senha exata', async () => {
  const { context, nodes, listeners } = setup([], false);
  let prompted = 0;
  await context.refreshBrowserInstallUI();
  assert.equal(nodes['#browser-install-access'].hidden, false);
  assert.equal(nodes['#browser-install-guidance'].hidden, true);
  listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompted++; return { outcome: 'dismissed' }; } });
  assert.equal(nodes['#browser-install-button'].hidden, true);
  await context.requestBrowserInstall();
  assert.equal(prompted, 0);
  for (const value of ['SenhadoFunTim', 'senhadofuntime', 'incorreta']) {
    await context.unlockBrowserInstall({ target: { value } });
    assert.equal(nodes['#browser-install-button'].hidden, true);
  }
  nodes['#browser-install-button'].focus = () => {};
  const input = { value: 'SenhadoFunTime' };
  await context.unlockBrowserInstall({ target: input });
  assert.equal(input.value, '');
  assert.equal(nodes['#browser-install-access'].hidden, true);
  assert.equal(nodes['#browser-install-button'].hidden, false);
  await context.requestBrowserInstall();
  assert.equal(prompted, 1);
});

test('senha libera orientação sem prompt e instalação detectada dispensa senha', async () => {
  const { context, nodes, listeners } = setup([], false);
  await context.unlockBrowserInstall({ target: { value: 'SenhadoFunTime' } });
  assert.equal(nodes['#browser-install-guidance'].hidden, false);
  const fresh = setup([], false);
  await fresh.context.refreshBrowserInstallUI();
  assert.equal(fresh.nodes['#browser-install-access'].hidden, false);
  fresh.listeners.appinstalled();
  assert.equal(fresh.nodes['#browser-install-access'].hidden, true);
  assert.equal(fresh.nodes['#browser-install-status-title'].textContent, 'App já instalado');
});
test('appinstalled conclui sem API e não regride quando o prompt resolve depois', async () => {
  const { context, navigator, nodes, listeners, timers } = setup([]);
  delete navigator.getInstalledRelatedApps;
  let resolvePrompt;
  listeners.beforeinstallprompt({ preventDefault() {}, prompt: () => new Promise(resolve => { resolvePrompt = resolve; }) });
  const request = context.requestBrowserInstall();
  listeners.appinstalled();
  resolvePrompt({ outcome: 'accepted' });
  await request;
  await listeners.focus();
  assert.equal(nodes['#browser-install-status-title'].textContent, 'App já instalado');
  assert.equal(timers.size, 0);
});
test('consulta negativa atrasada não desfaz appinstalled', async () => {
  const { context, navigator, nodes, listeners } = setup([]);
  let resolveDetection;
  navigator.getInstalledRelatedApps = () => new Promise(resolve => { resolveDetection = resolve; });
  const refresh = context.refreshBrowserInstallUI();
  listeners.appinstalled();
  resolveDetection([]);
  await refresh;
  navigator.getInstalledRelatedApps = async () => [];
  await listeners.focus();
  assert.equal(nodes['#browser-install-status-title'].textContent, 'App já instalado');
});
test('verificação periódica encontra instalação depois de cinco segundos e para', async () => {
  const { context, navigator, nodes, listeners, timers } = setup([]);
  listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => ({ outcome: 'accepted' }) });
  await context.requestBrowserInstall();
  for (let i = 0; i < 3; i++) {
    const [id, fn] = timers.entries().next().value;
    timers.delete(id);
    await fn();
  }
  assert.equal(nodes['#browser-install-status-title'].textContent, 'Instalação iniciada');
  navigator.getInstalledRelatedApps = async () => [{ platform: 'webapp', url: './manifest.webmanifest' }];
  const [id, fn] = timers.entries().next().value;
  timers.delete(id);
  await fn();
  assert.equal(nodes['#browser-install-status-title'].textContent, 'App já instalado');
  assert.equal(timers.size, 0);
});
test('v1 instalada não é confundida com FunTime 2', async () => {
  const { context } = setup([{ platform: 'webapp', url: 'https://example.com/intervalo/manifest.webmanifest', id: '/intervalo/' }]);
  assert.equal(await context.detectInstalledPwa(), false);
});
test('sem API mantém orientação; aceitar prompt não confirma instalação', async () => {
  const { context, navigator, nodes, listeners } = setup([]);
  delete navigator.getInstalledRelatedApps;
  await context.refreshBrowserInstallUI();
  assert.equal(nodes['#browser-install-guidance'].hidden, false);
  listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => ({ outcome: 'accepted' }) });
  await context.requestBrowserInstall();
  assert.equal(nodes['#browser-install-status-title'].textContent, 'Instalação iniciada');
  assert.equal(nodes['#browser-gate-lead'].hidden, true);
});
