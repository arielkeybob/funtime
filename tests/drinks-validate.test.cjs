const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDrinkDraft } = require('../src/drinks/validate.js');

test('nome faltando retorna fieldErrors com "name"', () => {
  const result = validateDrinkDraft({ name: '', icon: '🍺', hours: 1, minutes: 0 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.fieldErrors, ['name']);
});

test('ícone faltando retorna fieldErrors com "icon"', () => {
  const result = validateDrinkDraft({ name: 'Água', icon: null, hours: 1, minutes: 0 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.fieldErrors, ['icon']);
});

test('nome e ícone faltando juntos retornam os dois em fieldErrors', () => {
  const result = validateDrinkDraft({ name: '', icon: null, hours: 1, minutes: 0 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.fieldErrors, ['name', 'icon']);
});

test('horas fora do intervalo (0-24) retorna mensagem específica', () => {
  const result = validateDrinkDraft({ name: 'Água', icon: '🍺', hours: 25, minutes: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Use um valor de horas entre 0 e 24.');
});

test('minutos fora do intervalo (0-59) retorna mensagem específica', () => {
  const result = validateDrinkDraft({ name: 'Água', icon: '🍺', hours: 1, minutes: 60 });
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Use um valor de minutos entre 0 e 59.');
});

test('intervalo total 0 (0h0min) é inválido', () => {
  const result = validateDrinkDraft({ name: 'Água', icon: '🍺', hours: 0, minutes: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.message, 'O intervalo deve ficar entre 1 minuto e 24 horas.');
});

test('intervalo total no limite exato (24h = 1440min) é válido', () => {
  const result = validateDrinkDraft({ name: 'Água', icon: '🍺', hours: 24, minutes: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.totalMinutes, 1440);
});

test('caminho de sucesso calcula totalMinutes corretamente', () => {
  const result = validateDrinkDraft({ name: 'Água', icon: '🍺', hours: 1, minutes: 30 });
  assert.equal(result.ok, true);
  assert.equal(result.totalMinutes, 90);
});
