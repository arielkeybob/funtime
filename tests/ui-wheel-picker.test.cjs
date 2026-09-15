const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDurationPicker } = require('../src/ui/wheel-picker.js');

function fakeWheel() {
  return {
    classList: { removed: [], remove(name) { this.removed.push(name); } },
    dataset: { valueBeforeMax: '30' },
    setAttribute() {},
    tabIndex: -1,
  };
}

function fakeInput() { return { value: '' }; }

function setup(overrides = {}) {
  const hoursWheel = fakeWheel();
  const minutesWheel = fakeWheel();
  const hoursInput = fakeInput();
  const minutesInput = fakeInput();
  const setCalls = [];
  const createCalls = [];
  const picker = createDurationPicker({
    maxHours: 24,
    hoursWheel, minutesWheel, hoursInput, minutesInput,
    createWheelPicker: (el, input, max) => createCalls.push({ el, input, max }),
    setWheelPickerValue: (el, value) => setCalls.push({ el, value }),
    ...overrides,
  });
  return { picker, hoursWheel, minutesWheel, hoursInput, minutesInput, setCalls, createCalls };
}

test('set() sem capMinutesAtMaxHours mantém minutos livres mesmo no máximo de horas', () => {
  const { picker, hoursInput, minutesInput } = setup({ maxHours: 48 });
  picker.set(48, 45);
  assert.equal(hoursInput.value, '48');
  assert.equal(minutesInput.value, '45');
});

test('set() com capMinutesAtMaxHours zera minutos e reabilita o wheel no máximo de horas', () => {
  const { picker, hoursInput, minutesInput, minutesWheel } = setup({ capMinutesAtMaxHours: true });
  picker.set(24, 45);
  assert.equal(hoursInput.value, '24');
  assert.equal(minutesInput.value, '0');
  assert.deepEqual(minutesWheel.classList.removed, ['is-disabled']);
  assert.equal(minutesWheel.dataset.valueBeforeMax, undefined);
  assert.equal(minutesWheel.tabIndex, 0);
});

test('set() com capMinutesAtMaxHours abaixo do máximo preserva os minutos informados', () => {
  const { picker, hoursInput, minutesInput } = setup({ capMinutesAtMaxHours: true });
  picker.set(10, 45);
  assert.equal(hoursInput.value, '10');
  assert.equal(minutesInput.value, '45');
});

test('set() limita horas/minutos negativos ou acima do intervalo', () => {
  const { picker, hoursInput, minutesInput } = setup({ maxHours: 24 });
  picker.set(-5, 200);
  assert.equal(hoursInput.value, '0');
  assert.equal(minutesInput.value, '59');
});

test('initialize() cria os dois wheels com os limites certos e aplica o valor inicial', () => {
  const { picker, createCalls, setCalls } = setup();
  picker.initialize(1, 0);
  assert.equal(createCalls.length, 2);
  assert.equal(createCalls[0].max, 24);
  assert.equal(createCalls[1].max, 59);
  assert.equal(setCalls.length, 2);
});
