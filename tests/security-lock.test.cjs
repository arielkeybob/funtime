// Fluxo de bloqueio/desbloqueio (app.js) - sem nenhum teste unitário até aqui, só
// exercitado de passagem por tests/navigation-browser.test.cjs/occasions-browser.test.cjs.
// Rede de segurança para a extração planejada em src/security/lock.js (spec 0021,
// Fase 9.3.2) - testa o comportamento ATUAL, antes de qualquer código mover de lugar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');

function extract(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function el(overrides = {}) {
  return { hidden: false, value: '', textContent: '', disabled: false, maxLength: 0, placeholder: '',
    classList: { add() {}, remove() {}, contains: () => false }, focus() {}, close() {}, ...overrides };
}

function context(extra = {}) {
  const dialogs = extra.dialogs || [];
  const ctx = vm.createContext({
    console, setTimeout: () => 0, clearTimeout: () => {},
    PIN_LOCKOUT_ATTEMPTS: 5,
    document: {
      body: { classList: { added: [], removed: [], add(c) { this.added.push(c); }, remove(c) { this.removed.push(c); } } },
      querySelectorAll: (selector) => selector === 'dialog[open]' ? dialogs : [],
    },
    lockScreen: el(), lockError: el(), deviceUnlockPanel: el(), pinUnlockForm: el(),
    pinUnlockValue: el(), deviceUnlockButton: el(), privacyShield: el(),
    pinSetupValue: el(), pinSetupConfirm: el(), toast: el({ hidden: true }),
    hideToast: () => {}, hideUpdateAvailable: () => {},
    clearSecuritySession: () => {}, markSecurityActive: () => {},
    render: () => {}, renderHistory: () => {}, maybeHandleSharedDrinkImport: () => {},
    getConfiguredPinLength: () => 4, normalizePinInput: (input) => input.value,
    verifyPin: async () => false, verifyDeviceCredential: async () => false,
    registerFailedPinAttempt: () => false,
    getPinLockoutRemainingMs: () => 0,
    ...extra,
  });
  // `var` (não `let`) para virar propriedade legível do contexto a partir de fora.
  vm.runInContext('var securitySetupGeneration = 0;', ctx);
  for (const name of ['closeSensitiveDialogs', 'showLockScreen', 'lockApp', 'unlockApp', 'showPrivacyShield', 'hidePrivacyShield', 'updatePinLockoutMessage']) {
    vm.runInContext(extract(name), ctx);
  }
  vm.runInContext(extract('handlePinUnlock'), ctx);
  vm.runInContext(extract('handleDeviceUnlock'), ctx);
  return ctx;
}

function baseState(overrides = {}) {
  return {
    securityConfig: { enabled: true, method: 'pin' }, securityLocked: false, securityHiddenAt: null,
    pinFailedAttempts: 0, pinLockoutUntil: 0, pinLockoutTimer: null, privacyShieldVisible: false,
    currentView: 'home', pendingSharedImportCheck: false,
    ...overrides,
  };
}

// --- closeSensitiveDialogs ---

test('closeSensitiveDialogs: fecha todo diálogo aberto, limpa campos de PIN e o toast', () => {
  const dialogA = el({ open: true }); const dialogB = el({ open: true });
  let closedA = false, closedB = false, hiddenUpdate = false, hiddenToast = false;
  dialogA.close = () => { closedA = true; };
  dialogB.close = () => { closedB = true; };
  const c = context({
    state: baseState(), dialogs: [dialogA, dialogB],
    pinSetupValue: el({ value: '1234' }), pinSetupConfirm: el({ value: '1234' }),
    hideUpdateAvailable: () => { hiddenUpdate = true; },
    toast: el({ hidden: false }), hideToast: () => { hiddenToast = true; },
  });
  c.closeSensitiveDialogs();
  assert.equal(closedA, true);
  assert.equal(closedB, true);
  assert.equal(c.pinSetupValue.value, '');
  assert.equal(c.pinSetupConfirm.value, '');
  assert.equal(hiddenUpdate, true);
  assert.equal(hiddenToast, true, 'esconde o toast quando ele não estava escondido');
  assert.equal(c.securitySetupGeneration, 1, 'invalida configurações assíncronas em andamento');
});

test('closeSensitiveDialogs: não chama hideToast quando o toast já está escondido', () => {
  let hiddenToast = false;
  const c = context({ state: baseState(), toast: el({ hidden: true }), hideToast: () => { hiddenToast = true; } });
  c.closeSensitiveDialogs();
  assert.equal(hiddenToast, false);
});

// --- showLockScreen ---

test('showLockScreen: método pin mostra o formulário de PIN e configura o campo', () => {
  const c = context({ state: baseState({ securityConfig: { enabled: true, method: 'pin' } }) });
  c.showLockScreen();
  assert.equal(c.document.body.classList.added.includes('app-locked'), true);
  assert.equal(c.lockScreen.hidden, false);
  assert.equal(c.lockError.hidden, true);
  assert.equal(c.pinUnlockForm.hidden, false);
  assert.equal(c.deviceUnlockPanel.hidden, true);
  assert.equal(c.pinUnlockValue.maxLength, 4);
  assert.equal(c.pinUnlockValue.value, '');
});

test('showLockScreen: método device mostra o painel de dispositivo, não o de PIN', () => {
  const c = context({ state: baseState({ securityConfig: { enabled: true, method: 'device' } }) });
  c.showLockScreen();
  assert.equal(c.deviceUnlockPanel.hidden, false);
  assert.equal(c.pinUnlockForm.hidden, true);
});

// --- lockApp / unlockApp ---

test('lockApp: sem proteção habilitada não faz nada', () => {
  const state = baseState({ securityConfig: { enabled: false, method: null } });
  const c = context({ state });
  c.lockApp();
  assert.equal(state.securityLocked, false);
  assert.equal(c.lockScreen.hidden, false, 'showLockScreen nunca chega a rodar (só muda hidden=false lá dentro)');
});

test('lockApp: com proteção habilitada bloqueia e mostra a tela de bloqueio', () => {
  const state = baseState();
  let sessionCleared = false;
  const c = context({ state, clearSecuritySession: () => { sessionCleared = true; } });
  c.lockApp();
  assert.equal(state.securityLocked, true);
  assert.equal(sessionCleared, true);
  assert.equal(c.lockScreen.hidden, false);
  assert.equal(c.privacyShield.hidden, true, 'hidePrivacyShield roda como parte do bloqueio');
});

test('unlockApp: reseta bloqueio/tentativas e re-renderiza a view atual', () => {
  const state = baseState({ securityLocked: true, pinFailedAttempts: 3, pinLockoutUntil: Date.now() + 5000, currentView: 'history' });
  let rendered = false, historyRendered = false, activeMarked = false;
  const c = context({ state, render: () => { rendered = true; }, renderHistory: () => { historyRendered = true; }, markSecurityActive: () => { activeMarked = true; } });
  c.unlockApp();
  assert.equal(state.securityLocked, false);
  assert.equal(state.pinFailedAttempts, 0);
  assert.equal(state.pinLockoutUntil, 0);
  assert.equal(c.lockScreen.hidden, true);
  assert.equal(activeMarked, true);
  assert.equal(historyRendered, true, 'view atual é history, não home');
  assert.equal(rendered, false);
});

test('unlockApp: persistSession=false não marca sessão ativa', () => {
  let activeMarked = false;
  const c = context({ state: baseState(), markSecurityActive: () => { activeMarked = true; } });
  c.unlockApp({ persistSession: false });
  assert.equal(activeMarked, false);
});

// --- handlePinUnlock ---

function submitEvent() { return { preventDefault: () => {} }; }

test('handlePinUnlock: ainda bloqueado não tenta verificar o PIN', async () => {
  let verified = false;
  const c = context({ state: baseState(), getPinLockoutRemainingMs: () => 5000, verifyPin: async () => { verified = true; return true; } });
  await c.handlePinUnlock(submitEvent());
  assert.equal(verified, false);
});

test('handlePinUnlock: PIN correto desbloqueia o app', async () => {
  const state = baseState();
  let unlocked = false;
  const c = context({ state, pinUnlockValue: el({ value: '1234' }), verifyPin: async () => true });
  c.unlockApp = () => { unlocked = true; };
  await c.handlePinUnlock(submitEvent());
  assert.equal(unlocked, true);
});

test('handlePinUnlock: PIN incorreto sem atingir o limite mostra tentativas restantes', async () => {
  const state = baseState({ pinFailedAttempts: 2 });
  const c = context({ state, pinUnlockValue: el({ value: '0000' }), verifyPin: async () => false, registerFailedPinAttempt: () => false });
  await c.handlePinUnlock(submitEvent());
  assert.equal(c.lockError.hidden, false);
  assert.match(c.lockError.textContent, /Restam 3 tentativa/);
});

test('handlePinUnlock: PIN incorreto atingindo o limite aciona a mensagem de bloqueio', async () => {
  let lockoutMessageShown = false;
  const c = context({ state: baseState(), pinUnlockValue: el({ value: '0000' }), verifyPin: async () => false, registerFailedPinAttempt: () => true, getPinLockoutRemainingMs: () => 0 });
  c.updatePinLockoutMessage = () => { lockoutMessageShown = true; };
  await c.handlePinUnlock(submitEvent());
  assert.equal(lockoutMessageShown, true);
});

// --- handleDeviceUnlock ---

test('handleDeviceUnlock: sucesso desbloqueia e restaura o botão', async () => {
  let unlocked = false;
  const c = context({ state: baseState({ securityConfig: { enabled: true, method: 'device' } }), verifyDeviceCredential: async () => true });
  c.unlockApp = () => { unlocked = true; };
  await c.handleDeviceUnlock();
  assert.equal(unlocked, true);
  assert.equal(c.deviceUnlockButton.disabled, false);
  assert.equal(c.deviceUnlockButton.textContent, 'Entrar');
});

test('handleDeviceUnlock: cancelamento mostra mensagem específica', async () => {
  const c = context({
    state: baseState({ securityConfig: { enabled: true, method: 'device' } }),
    verifyDeviceCredential: async () => { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; },
  });
  await c.handleDeviceUnlock();
  assert.equal(c.lockError.hidden, false);
  assert.match(c.lockError.textContent, /cancelada/);
});

test('handleDeviceUnlock: falha genérica mostra a mensagem do erro', async () => {
  const c = context({
    state: baseState({ securityConfig: { enabled: true, method: 'device' } }),
    verifyDeviceCredential: async () => { throw new Error('Credencial inválida.'); },
  });
  await c.handleDeviceUnlock();
  assert.equal(c.lockError.textContent, 'Credencial inválida.');
});
