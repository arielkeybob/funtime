const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatTime, formatClock, formatHistoryElapsed, formatInterval, formatAgendaDateTime, agendaDateParts, calendarDaysBetween, formatEventDuration, resolveLogTimestamp, formatLogDay } = require('../src/format/datetime.js');

test('resolveLogTimestamp usa hoje, ou ontem quando a hora ainda não chegou', () => {
  const now = new Date(2026, 9, 28, 1, 0, 30).getTime();
  const yesterday = resolveLogTimestamp({ hour: 23, minute: 0, now });
  assert.equal(yesterday.timestamp, new Date(2026, 9, 27, 23, 0).getTime());
  assert.equal(yesterday.daysAgo, 1);
  assert.equal(yesterday.isFuture, false);
  const sameMinute = resolveLogTimestamp({ hour: 1, minute: 0, now });
  assert.equal(sameMinute.timestamp, new Date(2026, 9, 28, 1, 0).getTime());
  assert.equal(sameMinute.daysAgo, 0);
  const evening = new Date(2026, 9, 28, 20, 0).getTime();
  assert.equal(resolveLogTimestamp({ hour: 19, minute: 30, now: evening }).daysAgo, 0);
});

test('resolveLogTimestamp atravessa virada de mês e de ano', () => {
  const now = new Date(2027, 0, 1, 0, 10).getTime();
  assert.equal(resolveLogTimestamp({ hour: 23, minute: 50, now }).timestamp, new Date(2026, 11, 31, 23, 50).getTime());
});

test('resolveLogTimestamp com data escolhida: ela manda e avisa horário futuro', () => {
  const now = new Date(2026, 9, 28, 21, 0).getTime();
  const old = resolveLogTimestamp({ hour: 22, minute: 15, date: '2026-09-12', now });
  assert.equal(old.timestamp, new Date(2026, 8, 12, 22, 15).getTime());
  assert.equal(old.isFuture, false);
  assert.equal(resolveLogTimestamp({ hour: 23, minute: 0, date: '2026-10-28', now }).isFuture, true);
});

test('formatLogDay marca hoje e ontem', () => {
  const now = new Date(2026, 9, 28, 1, 0).getTime();
  assert.match(formatLogDay(new Date(2026, 9, 28, 0, 30).getTime(), now), /^Hoje · \S+ 28\/10$/);
  assert.match(formatLogDay(new Date(2026, 9, 27, 23, 0).getTime(), now), /^\(ontem\) \S+ 27\/10$/);
  assert.match(formatLogDay(new Date(2026, 8, 12, 22, 0).getTime(), now), /^\S+ 12\/09$/);
});

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

// Data da agenda de eventos: dia da semana + dia/mês (+ ano só se não for o corrente) + hora.
test('formatAgendaDateTime mostra dia da semana, dia/mês e hora, sem ponto na abreviação', () => {
  const agora = new Date(2026, 8, 26, 12, 0).getTime();

  assert.equal(formatAgendaDateTime(new Date(2026, 9, 17, 21, 23).getTime(), agora), 'sáb 17/10 · 21:23');
  assert.equal(formatAgendaDateTime(new Date(2026, 8, 19, 9, 5).getTime(), agora), 'sáb 19/09 · 09:05');
});

test('formatAgendaDateTime acrescenta o ano só quando ele não é o corrente', () => {
  const agora = new Date(2026, 11, 30, 12, 0).getTime();

  assert.equal(formatAgendaDateTime(new Date(2027, 0, 2, 20, 0).getTime(), agora), 'sáb 02/01/27 · 20:00');
  assert.equal(formatAgendaDateTime(new Date(2026, 0, 2, 20, 0).getTime(), agora), 'sex 02/01 · 20:00');
});

// Partes da data para o bloquinho da lista de eventos e a linha do tempo do detalhe.
test('agendaDateParts separa dia da semana, dia, data e hora, com o ano só fora do corrente', () => {
  const agora = new Date(2026, 9, 27, 19, 0).getTime();

  assert.deepEqual(agendaDateParts(new Date(2026, 9, 18, 1, 30).getTime(), agora), { weekday: 'dom', day: '18', date: '18/10', time: '01:30' });
  assert.equal(agendaDateParts(new Date(2027, 0, 2, 20, 0).getTime(), agora).date, '02/01/27');
});

test('calendarDaysBetween conta a virada de dia pelo calendário, não por 24 horas', () => {
  assert.equal(calendarDaysBetween(new Date(2026, 9, 18, 1, 30).getTime(), new Date(2026, 9, 18, 17, 19).getTime()), 0);
  assert.equal(calendarDaysBetween(new Date(2026, 8, 6, 22, 0).getTime(), new Date(2026, 8, 7, 2, 10).getTime()), 1);
  assert.equal(calendarDaysBetween(new Date(2026, 7, 28, 18, 0).getTime(), new Date(2026, 7, 30, 23, 0).getTime()), 2);
});

test('formatEventDuration usa minutos e horas e, a partir de um dia, dias e horas', () => {
  assert.equal(formatEventDuration(45 * 60000), '45 min');
  assert.equal(formatEventDuration((15 * 60 + 49) * 60000), '15 h 49 min');
  assert.equal(formatEventDuration(24 * 3600000), '1 dia');
  assert.equal(formatEventDuration(53 * 3600000 + 59000), '2 dias 5 h');
  assert.equal(formatEventDuration(-1), '0 min');
});
