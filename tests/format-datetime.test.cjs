const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatTime, formatClock, formatHistoryElapsed, formatInterval } = require('../src/format/datetime.js');

test('formatTime converte milissegundos em HH:MM:SS, arredondando para cima e sem negativos', () => {
  assert.equal(formatTime(5400000), '01:30:00');
  assert.equal(formatTime(1500), '00:00:02');
  assert.equal(formatTime(0), '00:00:00');
  assert.equal(formatTime(-1000), '00:00:00');
});

test('formatClock formata hora local pt-BR em HH:MM', () => {
  assert.match(formatClock(Date.UTC(2026, 0, 1, 12, 5)), /^\d{2}:\d{2}$/);
});

test('formatHistoryElapsed cobre os quatro limiares e o plural de dia(s)', () => {
  const now = 1_000_000_000_000;
  assert.equal(formatHistoryElapsed(now - 30_000, now), 'menos de 1 min atrás');
  assert.equal(formatHistoryElapsed(now - 5 * 60_000, now), '5 min atrás');
  assert.equal(formatHistoryElapsed(now - 90 * 60_000, now), '01:30h atrás');
  assert.equal(formatHistoryElapsed(now - 24 * 60 * 60_000, now), '1 dia atrás');
  assert.equal(formatHistoryElapsed(now - 3 * 24 * 60 * 60_000, now), '3 dias atrás');
});

test('formatInterval combina horas e minutos, ou mostra só a unidade presente', () => {
  assert.equal(formatInterval(90), '1 h 30 min');
  assert.equal(formatInterval(60), '1 h');
  assert.equal(formatInterval(45), '45 min');
  assert.equal(formatInterval(0), '0 min');
});
