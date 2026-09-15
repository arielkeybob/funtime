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

const COMMIT_APP_DATA_SRC = 'function commitAppData(key,current,patch){const next={...current,...patch};localStorage.setItem(key,JSON.stringify(next));return next;}';

function context(extra = {}) {
  const ctx = vm.createContext({ console, crypto: require('node:crypto').webcrypto, ...extra });
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
