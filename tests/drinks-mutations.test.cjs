const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function extractStatement(startText) {
  const start = source.indexOf(startText);
  const end = source.indexOf('\n});', start) + 4;
  return source.slice(start, end);
}

const COMMIT_APP_DATA_SRC = 'function commitAppData(key,current,patch){const next={...current,...patch};localStorage.setItem(key,JSON.stringify(next));return next;}';

const { validateDrinkDraft } = require('../src/drinks/validate.js');

function context(extra = {}) {
  const ctx = vm.createContext({ console, crypto: require('node:crypto').webcrypto, validateDrinkDraft, ...extra });
  vm.runInContext('const DATA_VERSION=11, DATA_STORAGE_KEY="funtime-v1-data", DEFAULT_ICON="🍺";', ctx);
  vm.runInContext(COMMIT_APP_DATA_SRC, ctx);
  for (const name of ['buildCurrentAppData', 'normalizeIcon', 'createId', 'getEventDrinkIdentity']) {
    vm.runInContext(extract(name), ctx);
  }
  return ctx;
}

function workingLocalStorage() {
  const map = new Map();
  return { setItem: (k, v) => map.set(k, v), getItem: k => map.get(k) };
}

function throwingLocalStorage() {
  return { setItem: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } };
}

// --- deleteDrinkKeepingHistory ---

test('deleteDrinkKeepingHistory: sucesso remove a bebida, atualiza identidade nos eventos e grava', () => {
  const state = {
    deleteDrinkId: 'd1',
    drinks: [{ id: 'd1', name: 'Água', icon: '💧' }, { id: 'd2', name: 'Suco', icon: '🧃' }],
    events: [{ id: 'e1', drinkId: 'd1', drinkName: 'Água (antigo)', drinkIcon: '💧-old' }, { id: 'e2', drinkId: 'd2' }],
    editingDrinkId: 'd1',
  };
  let notified = null, closed = false, refreshed = false, toast = null;
  const c = context({
    state,
    showAppNotification: msg => { notified = msg; },
    closeDeleteDrinkDialog: () => { closed = true; },
    refreshDataViews: () => { refreshed = true; },
    showToast: msg => { toast = msg; },
    localStorage: workingLocalStorage(),
  });
  vm.runInContext(extract('deleteDrinkKeepingHistory'), c);
  c.deleteDrinkKeepingHistory();
  assert.deepEqual(state.drinks.map(d => d.id), ['d2']);
  assert.equal(state.events.find(e => e.id === 'e1').drinkName, 'Água');
  assert.equal(state.events.length, 2, 'histórico é mantido');
  assert.equal(state.editingDrinkId, null);
  assert.equal(closed, true);
  assert.equal(refreshed, true);
  assert.match(toast, /excluída da lista/);
  assert.equal(notified, null);
});

test('deleteDrinkKeepingHistory: falha de gravação preserva drinks/events e mostra erro, sem fechar o diálogo', () => {
  const state = {
    deleteDrinkId: 'd1',
    drinks: [{ id: 'd1', name: 'Água', icon: '💧' }],
    events: [{ id: 'e1', drinkId: 'd1' }],
    editingDrinkId: 'd1',
  };
  let notified = null, closed = false;
  const c = context({
    state,
    showAppNotification: msg => { notified = msg; },
    closeDeleteDrinkDialog: () => { closed = true; },
    refreshDataViews: () => {},
    showToast: () => { throw new Error('não deveria mostrar toast de sucesso'); },
    localStorage: throwingLocalStorage(),
  });
  vm.runInContext(extract('deleteDrinkKeepingHistory'), c);
  c.deleteDrinkKeepingHistory();
  assert.equal(state.drinks.length, 1);
  assert.equal(state.events.length, 1);
  assert.match(notified, /Não foi possível excluir/);
  assert.equal(closed, false);
});

// --- deleteDrinkWithHistory ---

test('deleteDrinkWithHistory: sucesso remove bebida e histórico relacionado', () => {
  const state = {
    deleteDrinkId: 'd1',
    drinks: [{ id: 'd1', name: 'Água', icon: '💧' }, { id: 'd2', name: 'Suco', icon: '🧃' }],
    events: [{ id: 'e1', drinkId: 'd1' }, { id: 'e2', drinkId: 'd2' }],
    editingDrinkId: 'd1',
  };
  let toast = null;
  const c = context({
    state,
    showAppNotification: () => {},
    closeDeleteDrinkDialog: () => {},
    refreshDataViews: () => {},
    showToast: msg => { toast = msg; },
    localStorage: workingLocalStorage(),
  });
  vm.runInContext(extract('deleteDrinkWithHistory'), c);
  c.deleteDrinkWithHistory();
  assert.deepEqual(state.drinks.map(d => d.id), ['d2']);
  assert.deepEqual(state.events.map(e => e.id), ['e2']);
  assert.match(toast, /e seus registros foram excluídos/);
});

test('deleteDrinkWithHistory: falha de gravação preserva drinks/events e mostra erro', () => {
  const state = {
    deleteDrinkId: 'd1',
    drinks: [{ id: 'd1', name: 'Água', icon: '💧' }],
    events: [{ id: 'e1', drinkId: 'd1' }],
    editingDrinkId: 'd1',
  };
  let notified = null;
  const c = context({
    state,
    showAppNotification: msg => { notified = msg; },
    closeDeleteDrinkDialog: () => {},
    refreshDataViews: () => {},
    showToast: () => { throw new Error('não deveria mostrar toast de sucesso'); },
    localStorage: throwingLocalStorage(),
  });
  vm.runInContext(extract('deleteDrinkWithHistory'), c);
  c.deleteDrinkWithHistory();
  assert.equal(state.drinks.length, 1);
  assert.equal(state.events.length, 1);
  assert.match(notified, /Não foi possível excluir/);
});

// --- deleteSelectedEvent ---

function eventContext(state, overrides = {}) {
  return context({
    state,
    formatClock: () => '10:00',
    showAppConfirmation: async () => true,
    showAppNotification: () => {},
    closeEventDialog: () => {},
    refreshDataViews: () => {},
    showToast: () => {},
    localStorage: workingLocalStorage(),
    ...overrides,
  });
}

test('deleteSelectedEvent: sucesso remove só o registro selecionado', async () => {
  const state = {
    selectedEventId: 'e1',
    securityLocked: false,
    drinks: [{ id: 'd1', name: 'Água', icon: '💧' }],
    events: [{ id: 'e1', drinkId: 'd1', consumedAt: 1 }, { id: 'e2', drinkId: 'd1', consumedAt: 2 }],
  };
  let toast = null;
  const c = eventContext(state, { showToast: msg => { toast = msg; } });
  vm.runInContext('async ' + extract('deleteSelectedEvent'), c);
  await c.deleteSelectedEvent();
  assert.deepEqual(state.events.map(e => e.id), ['e2']);
  assert.match(toast, /excluída/);
});

test('deleteSelectedEvent: cancelar a confirmação não altera events', async () => {
  const state = {
    selectedEventId: 'e1',
    securityLocked: false,
    drinks: [{ id: 'd1', name: 'Água', icon: '💧' }],
    events: [{ id: 'e1', drinkId: 'd1', consumedAt: 1 }],
  };
  const c = eventContext(state, { showAppConfirmation: async () => false });
  vm.runInContext('async ' + extract('deleteSelectedEvent'), c);
  await c.deleteSelectedEvent();
  assert.equal(state.events.length, 1);
});

test('deleteSelectedEvent: falha de gravação preserva events e mostra erro', async () => {
  const state = {
    selectedEventId: 'e1',
    securityLocked: false,
    drinks: [{ id: 'd1', name: 'Água', icon: '💧' }],
    events: [{ id: 'e1', drinkId: 'd1', consumedAt: 1 }],
  };
  let notified = null;
  const c = eventContext(state, {
    localStorage: throwingLocalStorage(),
    showAppNotification: msg => { notified = msg; },
    showToast: () => { throw new Error('não deveria mostrar toast de sucesso'); },
  });
  vm.runInContext('async ' + extract('deleteSelectedEvent'), c);
  await c.deleteSelectedEvent();
  assert.equal(state.events.length, 1);
  assert.match(notified, /Não foi possível excluir o registro/);
});

// --- handleDrinkSubmit ---

class FakeFormData {
  constructor(form) { this.form = form; }
  get(key) { return this.form[key]; }
}

function drinkFormContext(state, formValues, overrides = {}) {
  return context({
    state,
    FormData: FakeFormData,
    drinkForm: formValues,
    drinkNameField: { scrollIntoView: () => {} },
    drinkIconField: { scrollIntoView: () => {} },
    formError: { hidden: true, textContent: '' },
    requestAnimationFrame: fn => fn(),
    clearDrinkValidation: () => {},
    setDrinkFieldError: () => {},
    showFormError: () => {},
    closeDrinkDialog: () => {},
    refreshDataViews: () => {},
    showToast: () => {},
    localStorage: workingLocalStorage(),
    ...overrides,
  });
}

const VALID_FORM = { name: 'Refrigerante', icon: '🥤', intervalHours: '1', intervalMinutes: '30', askDoseSize: 'on' };

test('handleDrinkSubmit: criar bebida adiciona ao final de drinks sem mutar itens existentes', () => {
  const existing = { id: 'd1', name: 'Água', icon: '💧' };
  const state = { editingDrinkId: null, drinks: [existing], events: [] };
  const c = drinkFormContext(state, VALID_FORM);
  vm.runInContext(extract('handleDrinkSubmit'), c);
  c.handleDrinkSubmit({ preventDefault: () => {} });
  assert.equal(state.drinks.length, 2);
  assert.equal(state.drinks[0], existing, 'bebida existente não foi substituída/mutada');
  assert.equal(state.drinks[1].name, 'Refrigerante');
  assert.equal(state.drinks[1].intervalMinutes, 90);
});

test('handleDrinkSubmit: criar bebida — falha de gravação não adiciona a bebida', () => {
  const state = { editingDrinkId: null, drinks: [], events: [] };
  let errorShown = null;
  const c = drinkFormContext(state, VALID_FORM, {
    localStorage: throwingLocalStorage(),
    showFormError: msg => { errorShown = msg; },
    showToast: () => { throw new Error('não deveria mostrar toast de sucesso'); },
  });
  vm.runInContext(extract('handleDrinkSubmit'), c);
  c.handleDrinkSubmit({ preventDefault: () => {} });
  assert.equal(state.drinks.length, 0);
  assert.match(errorShown, /Não foi possível salvar/);
});

test('handleDrinkSubmit: editar bebida substitui o item imutavelmente e atualiza identidade dos eventos', () => {
  const original = { id: 'd1', name: 'Água', icon: '💧', intervalMinutes: 60, askDoseSize: false };
  const state = {
    editingDrinkId: 'd1',
    drinks: [original],
    events: [{ id: 'e1', drinkId: 'd1', drinkName: 'Água', drinkIcon: '💧' }],
  };
  const c = drinkFormContext(state, VALID_FORM);
  vm.runInContext(extract('handleDrinkSubmit'), c);
  c.handleDrinkSubmit({ preventDefault: () => {} });
  assert.equal(state.drinks.length, 1);
  assert.equal(state.drinks[0].name, 'Refrigerante');
  assert.equal(original.name, 'Água', 'objeto original não foi mutado em place');
  assert.equal(state.events[0].drinkName, 'Refrigerante');
  assert.equal(state.events[0].intervalMinutes, undefined, 'evento não ganha um campo que não tinha');
});

test('handleDrinkSubmit: editar bebida — falha de gravação preserva o objeto original', () => {
  const original = { id: 'd1', name: 'Água', icon: '💧', intervalMinutes: 60, askDoseSize: false };
  const state = { editingDrinkId: 'd1', drinks: [original], events: [] };
  let errorShown = null;
  const c = drinkFormContext(state, VALID_FORM, {
    localStorage: throwingLocalStorage(),
    showFormError: msg => { errorShown = msg; },
    showToast: () => { throw new Error('não deveria mostrar toast de sucesso'); },
  });
  vm.runInContext(extract('handleDrinkSubmit'), c);
  c.handleDrinkSubmit({ preventDefault: () => {} });
  assert.equal(state.drinks[0], original);
  assert.equal(state.drinks[0].name, 'Água');
  assert.match(errorShown, /Não foi possível salvar/);
});

// --- choosePendingDoseSize ---

test('choosePendingDoseSize: sucesso substitui o evento imutavelmente e grava', () => {
  const original = { id: 'e1', drinkId: 'd1', doseSize: null };
  const state = { pendingDoseEventId: 'e1', events: [original] };
  let refreshed = false, selection = null, closed = false;
  const c = context({
    state,
    showAppNotification: () => { throw new Error('não deveria notificar erro'); },
    refreshDataViews: () => { refreshed = true; },
    updateDoseDialogSelection: value => { selection = value; },
    closeDoseSizeDialog: () => { closed = true; },
    localStorage: workingLocalStorage(),
  });
  vm.runInContext(extract('choosePendingDoseSize'), c);
  c.choosePendingDoseSize('half');
  assert.equal(state.events[0].doseSize, 'half');
  assert.notEqual(state.events[0], original, 'evento foi substituído, não mutado em place');
  assert.equal(original.doseSize, null, 'objeto original não foi mutado');
  assert.equal(selection, 'half');
  assert.equal(refreshed, true);
  assert.equal(closed, true);
});

test('choosePendingDoseSize: falha de gravação preserva o evento original e mostra erro', () => {
  const original = { id: 'e1', drinkId: 'd1', doseSize: null };
  const state = { pendingDoseEventId: 'e1', events: [original] };
  let notified = null, closed = false;
  const c = context({
    state,
    showAppNotification: msg => { notified = msg; },
    refreshDataViews: () => { throw new Error('não deveria atualizar a tela em caso de erro'); },
    updateDoseDialogSelection: () => {},
    closeDoseSizeDialog: () => { closed = true; },
    localStorage: throwingLocalStorage(),
  });
  vm.runInContext(extract('choosePendingDoseSize'), c);
  c.choosePendingDoseSize('half');
  assert.equal(state.events[0], original);
  assert.equal(state.events[0].doseSize, null);
  assert.match(notified, /Não foi possível salvar/);
  assert.equal(closed, false);
});

// --- undoLastRegistration ---

test('undoLastRegistration: sucesso remove o evento desfeito e limpa o undo', () => {
  const state = { undo: { type: 'add-event', eventId: 'e1' }, events: [{ id: 'e1' }, { id: 'e2' }] };
  let refreshed = false, hidden = false;
  const c = context({
    state,
    showAppNotification: () => { throw new Error('não deveria notificar erro'); },
    refreshDataViews: () => { refreshed = true; },
    hideToast: () => { hidden = true; },
    localStorage: workingLocalStorage(),
  });
  vm.runInContext(extract('undoLastRegistration'), c);
  c.undoLastRegistration();
  assert.deepEqual(state.events.map(e => e.id), ['e2']);
  assert.equal(state.undo, null);
  assert.equal(refreshed, true);
  assert.equal(hidden, true);
});

test('undoLastRegistration: falha de gravação preserva events e o undo pendente', () => {
  const state = { undo: { type: 'add-event', eventId: 'e1' }, events: [{ id: 'e1' }] };
  let notified = null;
  const c = context({
    state,
    showAppNotification: msg => { notified = msg; },
    refreshDataViews: () => { throw new Error('não deveria atualizar a tela em caso de erro'); },
    hideToast: () => { throw new Error('não deveria esconder o toast em caso de erro'); },
    localStorage: throwingLocalStorage(),
  });
  vm.runInContext(extract('undoLastRegistration'), c);
  c.undoLastRegistration();
  assert.equal(state.events.length, 1);
  assert.notEqual(state.undo, null);
  assert.match(notified, /Não foi possível desfazer/);
});

// --- toggle "interface limpa" ---

function cleanInterfaceContext(state, checked, overrides = {}) {
  const listeners = {};
  const cleanInterfaceInput = { checked, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const c = context({
    state,
    cleanInterfaceInput,
    applyInterfacePreferences: () => {
      const clean = state.preferences?.cleanInterface !== false;
      cleanInterfaceInput.checked = clean;
    },
    showAppNotification: () => {},
    showToast: () => {},
    localStorage: workingLocalStorage(),
    ...overrides,
  });
  vm.runInContext(extractStatement('cleanInterfaceInput.addEventListener("change"'), c);
  return { c, fire: () => listeners.change(), cleanInterfaceInput };
}

test('toggle "interface limpa": sucesso grava a preferência e sincroniza a UI', () => {
  const state = { preferences: { cleanInterface: true } };
  let toast = null;
  const { fire, cleanInterfaceInput } = cleanInterfaceContext(state, false, { showToast: msg => { toast = msg; } });
  fire();
  assert.equal(state.preferences.cleanInterface, false);
  assert.equal(cleanInterfaceInput.checked, false);
  assert.match(toast, /auxiliares exibidas/);
});

test('toggle "interface limpa": falha de gravação reverte o checkbox e mostra erro', () => {
  const state = { preferences: { cleanInterface: true } };
  let notified = null;
  const { fire, cleanInterfaceInput } = cleanInterfaceContext(state, false, {
    localStorage: throwingLocalStorage(),
    showAppNotification: (msg) => { notified = msg; },
    showToast: () => { throw new Error('não deveria mostrar toast de sucesso'); },
  });
  fire();
  assert.equal(state.preferences.cleanInterface, true, 'preferência não muda em caso de falha');
  assert.equal(cleanInterfaceInput.checked, true, 'checkbox é revertido visualmente');
  assert.match(notified, /Não foi possível salvar esta configuração/);
});
