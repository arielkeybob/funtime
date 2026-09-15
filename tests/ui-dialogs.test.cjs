const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wireDialogDismissal } = require('../src/ui/dialogs.js');

function fakeDialog() {
  const listeners = {};
  return {
    listeners,
    getBoundingClientRect: () => ({ left: 10, right: 90, top: 10, bottom: 90 }),
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
}

test('clique dentro da área do diálogo não fecha', () => {
  const dialog = fakeDialog();
  let closed = false;
  wireDialogDismissal(dialog, () => { closed = true; });
  dialog.listeners.click({ clientX: 50, clientY: 50 });
  assert.equal(closed, false);
});

test('clique fora da área do diálogo (backdrop) fecha', () => {
  const dialog = fakeDialog();
  let closed = false;
  wireDialogDismissal(dialog, () => { closed = true; });
  dialog.listeners.click({ clientX: 5, clientY: 5 });
  assert.equal(closed, true);
});

test('sem { cancel: true }, não registra listener de cancel', () => {
  const dialog = fakeDialog();
  wireDialogDismissal(dialog, () => {});
  assert.equal(dialog.listeners.cancel, undefined);
});

test('com { cancel: true }, cancel previne o default e fecha', () => {
  const dialog = fakeDialog();
  let closed = false, prevented = false;
  wireDialogDismissal(dialog, () => { closed = true; }, { cancel: true });
  dialog.listeners.cancel({ preventDefault: () => { prevented = true; } });
  assert.equal(closed, true);
  assert.equal(prevented, true);
});
