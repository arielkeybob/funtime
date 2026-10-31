// src/security/lock.js lê `document`/`setTimeout`/`clearTimeout` como globais soltos
// (mesma convenção dos outros módulos em src/ - ver src/README.md) - testado via
// require() real, com document/timers de mentira injetados em global pela duração
// de cada chamada (setTimeout/clearTimeout ficam fake: updatePinLockoutMessage
// reagenda a si mesma recursivamente enquanto o bloqueio não passa, e um timer real
// nesse caminho deixaria o processo do teste pendurado).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSecurityLock } = require('../src/security/lock.js');

function el(overrides = {}) {
  return { hidden: false, value: '', textContent: '', disabled: false, maxLength: 0, placeholder: '',
    classList: { add() {}, remove() {}, contains: () => false }, focus() {}, close() {}, ...overrides };
}

// hidden/hasFocus/listeners: o pedido automático da biometria só sai com a página à
// vista e com foco, e observa se ela se esconde enquanto o pedido está aberto.
function fakeDocument(dialogs = [], { hidden = false, focused = true } = {}) {
  const listeners = new Set();
  return {
    hidden,
    focused,
    hasFocus() { return this.focused; },
    addEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.delete(fn); },
    setHidden(value) { this.hidden = value; listeners.forEach((fn) => fn()); },
    body: { classList: { added: [], removed: [], add(c) { this.added.push(c); }, remove(c) { this.removed.push(c); } } },
    querySelectorAll: (selector) => selector === 'dialog[open]' ? dialogs : [],
  };
}

function fakeWindow() {
  const focusListeners = [];
  return {
    focusListeners,
    addEventListener: (type, fn) => { if (type === 'focus') focusListeners.push(fn); },
    focus() { focusListeners.splice(0).forEach((fn) => fn()); },
  };
}

function baseState(overrides = {}) {
  return {
    securityConfig: { enabled: true, method: 'pin' }, securityLocked: false, securityHiddenAt: null,
    pinFailedAttempts: 0, pinLockoutUntil: 0, pinLockoutTimer: null, privacyShieldVisible: false,
    currentView: 'home', pendingSharedImportCheck: false, securitySetupGeneration: 0,
    ...overrides,
  };
}

function securityLockInstance({ state, dialogs, documentState, ...overrides }) {
  global.document = fakeDocument(dialogs, documentState);
  global.window = fakeWindow();
  global.setTimeout = () => 0;
  global.clearTimeout = () => {};
  return createSecurityLock({
    state,
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
    ...overrides,
  });
}

// --- closeSensitiveDialogs ---

test('closeSensitiveDialogs: fecha todo diálogo aberto, limpa campos de PIN e o toast', () => {
  const dialogA = el({ open: true }); const dialogB = el({ open: true });
  let closedA = false, closedB = false, hiddenUpdate = false, hiddenToast = false;
  dialogA.close = () => { closedA = true; };
  dialogB.close = () => { closedB = true; };
  const pinSetupValue = el({ value: '1234' }); const pinSetupConfirm = el({ value: '1234' });
  const state = baseState();
  const lock = securityLockInstance({
    state, dialogs: [dialogA, dialogB],
    pinSetupValue, pinSetupConfirm,
    hideUpdateAvailable: () => { hiddenUpdate = true; },
    toast: el({ hidden: false }), hideToast: () => { hiddenToast = true; },
  });
  lock.closeSensitiveDialogs();
  assert.equal(closedA, true);
  assert.equal(closedB, true);
  assert.equal(pinSetupValue.value, '');
  assert.equal(pinSetupConfirm.value, '');
  assert.equal(hiddenUpdate, true);
  assert.equal(hiddenToast, true, 'esconde o toast quando ele não estava escondido');
  assert.equal(state.securitySetupGeneration, 1, 'invalida configurações assíncronas em andamento');
});

test('closeSensitiveDialogs: não chama hideToast quando o toast já está escondido', () => {
  let hiddenToast = false;
  const lock = securityLockInstance({ state: baseState(), toast: el({ hidden: true }), hideToast: () => { hiddenToast = true; } });
  lock.closeSensitiveDialogs();
  assert.equal(hiddenToast, false);
});

// --- showLockScreen ---

test('showLockScreen: método pin mostra o formulário de PIN e configura o campo', () => {
  const pinUnlockValue = el(); const pinUnlockForm = el(); const deviceUnlockPanel = el(); const lockScreen = el(); const lockError = el();
  const lock = securityLockInstance({
    state: baseState({ securityConfig: { enabled: true, method: 'pin' } }),
    pinUnlockValue, pinUnlockForm, deviceUnlockPanel, lockScreen, lockError,
  });
  lock.showLockScreen();
  assert.equal(global.document.body.classList.added.includes('app-locked'), true);
  assert.equal(lockScreen.hidden, false);
  assert.equal(lockError.hidden, true);
  assert.equal(pinUnlockForm.hidden, false);
  assert.equal(deviceUnlockPanel.hidden, true);
  assert.equal(pinUnlockValue.maxLength, 4);
  assert.equal(pinUnlockValue.value, '');
});

test('showLockScreen: método device mostra o painel de dispositivo, não o de PIN', () => {
  const pinUnlockForm = el(); const deviceUnlockPanel = el();
  const lock = securityLockInstance({
    state: baseState({ securityConfig: { enabled: true, method: 'device' } }),
    pinUnlockForm, deviceUnlockPanel,
  });
  lock.showLockScreen();
  assert.equal(deviceUnlockPanel.hidden, false);
  assert.equal(pinUnlockForm.hidden, true);
});

// --- lockApp / unlockApp ---

test('lockApp: sem proteção habilitada não faz nada', () => {
  const state = baseState({ securityConfig: { enabled: false, method: null } });
  const lockScreen = el();
  const lock = securityLockInstance({ state, lockScreen });
  lock.lockApp();
  assert.equal(state.securityLocked, false);
  assert.equal(lockScreen.hidden, false, 'showLockScreen nunca chega a rodar (só muda hidden=false lá dentro)');
});

test('lockApp: com proteção habilitada bloqueia e mostra a tela de bloqueio', () => {
  const state = baseState();
  let sessionCleared = false;
  const lockScreen = el(); const privacyShield = el();
  const lock = securityLockInstance({ state, lockScreen, privacyShield, clearSecuritySession: () => { sessionCleared = true; } });
  lock.lockApp();
  assert.equal(state.securityLocked, true);
  assert.equal(sessionCleared, true);
  assert.equal(lockScreen.hidden, false);
  assert.equal(privacyShield.hidden, true, 'hidePrivacyShield roda como parte do bloqueio');
});

test('unlockApp: reseta bloqueio/tentativas e re-renderiza a view atual', () => {
  const state = baseState({ securityLocked: true, pinFailedAttempts: 3, pinLockoutUntil: Date.now() + 5000, currentView: 'history' });
  let rendered = false, historyRendered = false, activeMarked = false;
  const lockScreen = el();
  const lock = securityLockInstance({ state, lockScreen, render: () => { rendered = true; }, renderHistory: () => { historyRendered = true; }, markSecurityActive: () => { activeMarked = true; } });
  lock.unlockApp();
  assert.equal(state.securityLocked, false);
  assert.equal(state.pinFailedAttempts, 0);
  assert.equal(state.pinLockoutUntil, 0);
  assert.equal(lockScreen.hidden, true);
  assert.equal(activeMarked, true);
  assert.equal(historyRendered, true, 'view atual é history, não home');
  assert.equal(rendered, false);
});

test('lockApp/unlockApp reaplicam as cores da tela com o estado já trocado (bloqueado = neutro)', () => {
  const state = baseState({ currentView: 'shared' });
  const seen = [];
  const lock = securityLockInstance({ state, applyViewTheme: () => seen.push(state.securityLocked) });
  lock.lockApp();
  lock.unlockApp();
  assert.deepEqual(seen, [true, false]);
});

test('unlockApp: persistSession=false não marca sessão ativa', () => {
  let activeMarked = false;
  const lock = securityLockInstance({ state: baseState(), markSecurityActive: () => { activeMarked = true; } });
  lock.unlockApp({ persistSession: false });
  assert.equal(activeMarked, false);
});

// --- handlePinUnlock ---

function submitEvent() { return { preventDefault: () => {} }; }

test('handlePinUnlock: ainda bloqueado não tenta verificar o PIN', async () => {
  let verified = false;
  const lock = securityLockInstance({ state: baseState(), getPinLockoutRemainingMs: () => 5000, verifyPin: async () => { verified = true; return true; } });
  await lock.handlePinUnlock(submitEvent());
  assert.equal(verified, false);
});

test('handlePinUnlock: PIN correto desbloqueia o app', async () => {
  const state = baseState();
  const lockScreen = el();
  const lock = securityLockInstance({ state, lockScreen, pinUnlockValue: el({ value: '1234' }), verifyPin: async () => true });
  await lock.handlePinUnlock(submitEvent());
  assert.equal(state.securityLocked, false, 'unlockApp interno rodou');
  assert.equal(lockScreen.hidden, true);
});

test('handlePinUnlock: PIN incorreto sem atingir o limite mostra tentativas restantes', async () => {
  const state = baseState({ pinFailedAttempts: 2 });
  const lockError = el();
  const lock = securityLockInstance({ state, lockError, pinUnlockValue: el({ value: '0000' }), verifyPin: async () => false, registerFailedPinAttempt: () => false });
  await lock.handlePinUnlock(submitEvent());
  assert.equal(lockError.hidden, false);
  assert.match(lockError.textContent, /Restam 3 tentativa/);
});

test('handlePinUnlock: PIN incorreto atingindo o limite aciona a mensagem de bloqueio', async () => {
  const state = baseState({ pinFailedAttempts: 4 });
  const lockError = el();
  // getPinLockoutRemainingMs muda de 0 (permite tentar) para >0 (já bloqueado,
  // por causa da tentativa que acabou de rodar) só depois de registerFailedPinAttempt.
  let lockedOut = false;
  const lock = securityLockInstance({
    state, lockError, pinUnlockValue: el({ value: '0000' }), verifyPin: async () => false,
    registerFailedPinAttempt: () => { lockedOut = true; return true; },
    getPinLockoutRemainingMs: () => lockedOut ? 30000 : 0,
  });
  await lock.handlePinUnlock(submitEvent());
  assert.equal(lockError.hidden, false);
  assert.match(lockError.textContent, /Muitas tentativas/, 'updatePinLockoutMessage interno rodou em vez da mensagem de tentativas restantes');
});

// --- handleDeviceUnlock ---

test('handleDeviceUnlock: sucesso desbloqueia e restaura o botão', async () => {
  const state = baseState({ securityConfig: { enabled: true, method: 'device' } });
  const deviceUnlockButton = el();
  const lock = securityLockInstance({ state, deviceUnlockButton, verifyDeviceCredential: async () => true });
  await lock.handleDeviceUnlock();
  assert.equal(state.securityLocked, false, 'unlockApp interno rodou');
  assert.equal(deviceUnlockButton.disabled, false);
  assert.equal(deviceUnlockButton.textContent, 'Entrar');
});

test('handleDeviceUnlock: cancelamento mostra mensagem específica', async () => {
  const lockError = el();
  const lock = securityLockInstance({
    state: baseState({ securityConfig: { enabled: true, method: 'device' } }), lockError,
    verifyDeviceCredential: async () => { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; },
  });
  await lock.handleDeviceUnlock();
  assert.equal(lockError.hidden, false);
  assert.match(lockError.textContent, /cancelada/);
});

test('handleDeviceUnlock: falha genérica mostra a mensagem do erro', async () => {
  const lockError = el();
  const lock = securityLockInstance({
    state: baseState({ securityConfig: { enabled: true, method: 'device' } }), lockError,
    verifyDeviceCredential: async () => { throw new Error('Credencial inválida.'); },
  });
  await lock.handleDeviceUnlock();
  assert.equal(lockError.textContent, 'Credencial inválida.');
});

// --- pedido automático da biometria (promptDevice) ---

const deviceState = (overrides = {}) => baseState({ securityConfig: { enabled: true, method: 'device' }, ...overrides });
const settle = () => new Promise((resolve) => setImmediate(resolve));
function cancelled() { const e = new Error('x'); e.name = 'NotAllowedError'; return e; }

test('lockApp com promptDevice: já pede a biometria e desbloqueia sem tocar em Entrar', async () => {
  const state = deviceState();
  let asked = 0;
  const lock = securityLockInstance({ state, verifyDeviceCredential: async () => { asked++; return true; } });
  lock.lockApp({ promptDevice: true });
  await settle();
  assert.equal(asked, 1);
  assert.equal(state.securityLocked, false);
});

test('lockApp sem promptDevice (Bloquear agora, inatividade) não pede a biometria', async () => {
  let asked = 0;
  const lock = securityLockInstance({ state: deviceState(), verifyDeviceCredential: async () => { asked++; return true; } });
  lock.lockApp();
  await settle();
  assert.equal(asked, 0);
});

test('promptDevice com método PIN não pede biometria', async () => {
  let asked = 0;
  const lock = securityLockInstance({ state: baseState(), verifyDeviceCredential: async () => { asked++; return true; } });
  lock.lockApp({ promptDevice: true });
  await settle();
  assert.equal(asked, 0);
});

test('promptDevice com a página escondida não pede (fica para a volta)', async () => {
  let asked = 0;
  const lock = securityLockInstance({
    state: deviceState(), documentState: { hidden: true },
    verifyDeviceCredential: async () => { asked++; return true; },
  });
  lock.lockApp({ promptDevice: true });
  await settle();
  assert.equal(asked, 0);
});

test('promptDevice sem foco espera o foco da janela para pedir', async () => {
  const state = deviceState();
  let asked = 0;
  const lock = securityLockInstance({
    state, documentState: { focused: false },
    verifyDeviceCredential: async () => { asked++; return true; },
  });
  lock.lockApp({ promptDevice: true });
  lock.showLockScreen({ promptDevice: true });
  await settle();
  assert.equal(asked, 0);
  assert.equal(global.window.focusListeners.length, 1, 'um só listener, mesmo pedindo duas vezes');
  global.document.focused = true;
  global.window.focus();
  await settle();
  assert.equal(asked, 1);
  assert.equal(state.securityLocked, false);
});

test('pedido automático cancelado não mostra erro e deixa o Entrar', async () => {
  const state = deviceState();
  const lockError = el(); const deviceUnlockButton = el();
  const lock = securityLockInstance({
    state, lockError, deviceUnlockButton,
    verifyDeviceCredential: async () => { throw cancelled(); },
  });
  lock.lockApp({ promptDevice: true });
  await settle();
  assert.equal(state.securityLocked, true);
  assert.equal(lockError.hidden, true);
  assert.equal(deviceUnlockButton.disabled, false);
  assert.equal(deviceUnlockButton.textContent, 'Entrar');
});

test('pedido automático com falha que não é cancelamento mostra o erro', async () => {
  const lockError = el();
  const lock = securityLockInstance({
    state: deviceState(), lockError,
    verifyDeviceCredential: async () => false,
  });
  lock.lockApp({ promptDevice: true });
  await settle();
  assert.equal(lockError.hidden, false);
  assert.match(lockError.textContent, /Não foi possível confirmar/);
});

test('não pede de novo enquanto um pedido está aberto', async () => {
  const state = deviceState();
  let asked = 0; let finish;
  const lock = securityLockInstance({
    state, verifyDeviceCredential: () => { asked++; return new Promise((resolve) => { finish = resolve; }); },
  });
  lock.lockApp({ promptDevice: true });
  lock.showLockScreen({ promptDevice: true });
  await lock.handleDeviceUnlock();
  assert.equal(asked, 1);
  finish(true);
  await settle();
  assert.equal(state.securityLocked, false);
});

test('se o pedido esconde a página e é cancelado, a volta não pede de novo (sem laço); a seguinte pede', async () => {
  const state = deviceState({ securityLocked: true });
  let asked = 0;
  const lock = securityLockInstance({ state, verifyDeviceCredential: async () => { asked++; throw cancelled(); } });
  // Pedido da abertura: a folha do sistema esconde a página e o cancelamento chega antes da volta.
  const pending = lock.handleDeviceUnlock({ automatic: true });
  global.document.setHidden(true);
  await pending;
  global.document.setHidden(false);
  lock.showLockScreen({ promptDevice: true });
  await settle();
  assert.equal(asked, 1, 'a volta causada pelo próprio pedido não dispara outro');
  // Sair do app de verdade e voltar pede de novo.
  global.document.setHidden(true);
  global.document.setHidden(false);
  lock.showLockScreen({ promptDevice: true });
  await settle();
  assert.equal(asked, 2);
});

test('se a volta chega antes do cancelamento, também não pede de novo', async () => {
  const state = deviceState();
  let asked = 0; let reject;
  const lock = securityLockInstance({
    state, verifyDeviceCredential: () => { asked++; return new Promise((_, r) => { reject = r; }); },
  });
  lock.lockApp({ promptDevice: true });
  global.document.setHidden(true);
  global.document.setHidden(false);
  lock.showLockScreen({ promptDevice: true });
  reject(cancelled());
  await settle();
  assert.equal(asked, 1);
  // A volta seguinte (saída real do app) pede normalmente.
  lock.showLockScreen({ promptDevice: true });
  await settle();
  assert.equal(asked, 2);
});

test('desbloquear com a página escondida não atrapalha o pedido do próximo bloqueio', async () => {
  const state = deviceState();
  let asked = 0;
  const lock = securityLockInstance({ state, verifyDeviceCredential: async () => { asked++; return true; } });
  state.securityLocked = true;
  const pending = lock.handleDeviceUnlock({ automatic: true });
  global.document.setHidden(true);
  await pending;
  global.document.setHidden(false);
  assert.equal(state.securityLocked, false);
  lock.lockApp({ promptDevice: true });
  await settle();
  assert.equal(asked, 2);
});
