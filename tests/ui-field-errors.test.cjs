const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFieldErrorController, createFormErrorController } = require('../src/ui/field-errors.js');

function fakeClassList() {
  const classes = new Set();
  return { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), has: name => classes.has(name) };
}

test('createFieldErrorController: set(true) marca erro no campo, erro visível e aria-invalid', () => {
  const fieldEl = { classList: fakeClassList() };
  const errorEl = { hidden: true };
  const attrs = {};
  const inputEl = { setAttribute: (k, v) => { attrs[k] = v; } };
  const controller = createFieldErrorController({ fieldEl, errorEl, inputEl });

  controller.set(true);
  assert.equal(fieldEl.classList.has('has-error'), true);
  assert.equal(errorEl.hidden, false);
  assert.equal(attrs['aria-invalid'], 'true');
});

test('createFieldErrorController: clear() equivale a set(false)', () => {
  const fieldEl = { classList: fakeClassList() };
  const errorEl = { hidden: false };
  const attrs = {};
  const inputEl = { setAttribute: (k, v) => { attrs[k] = v; } };
  const controller = createFieldErrorController({ fieldEl, errorEl, inputEl });

  controller.set(true);
  controller.clear();
  assert.equal(fieldEl.classList.has('has-error'), false);
  assert.equal(errorEl.hidden, true);
  assert.equal(attrs['aria-invalid'], 'false');
});

test('createFormErrorController: mostra a mensagem e revela o elemento', () => {
  const el = { textContent: '', hidden: true };
  const showError = createFormErrorController(el);
  showError('Algo deu errado.');
  assert.equal(el.textContent, 'Algo deu errado.');
  assert.equal(el.hidden, false);
});
