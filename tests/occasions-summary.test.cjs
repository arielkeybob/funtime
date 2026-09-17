const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeOccasionDoses } = require('../src/occasions/summary.js');

// Espelha getEventDrinkIdentity do lado de quem é dono dos dados.
const comoDono = (record) => ({ name: record.drinkName, icon: record.drinkIcon });
const dose = (drinkName, drinkIcon = '🍺') => ({ drinkName, drinkIcon });

test('conta os registros e agrupa por bebida', () => {
  const resumo = summarizeOccasionDoses([dose('Cerveja'), dose('Vinho'), dose('Cerveja')], comoDono);

  assert.equal(resumo.count, 3);
  assert.deepEqual(resumo.totals, [
    { name: 'Cerveja', icon: '🍺', count: 2 },
    { name: 'Vinho', icon: '🍺', count: 1 },
  ]);
});

// A versão anterior vivia em occasions-ui.js e usava um Map com a mesma chave; a ordem
// de exibição vinha da ordem de inserção e não pode mudar com a extração.
test('preserva a ordem de primeira aparição', () => {
  const resumo = summarizeOccasionDoses([dose('Vinho'), dose('Cerveja'), dose('Vinho')], comoDono);

  assert.deepEqual(resumo.totals.map((item) => item.name), ['Vinho', 'Cerveja']);
});

test('sem registros, devolve zero e lista vazia', () => {
  assert.deepEqual(summarizeOccasionDoses([], comoDono), { count: 0, totals: [] });
  assert.deepEqual(summarizeOccasionDoses(undefined, comoDono), { count: 0, totals: [] });
});

// Do lado de quem vê um evento compartilhado não existe cadastro de bebidas: a
// identidade tem que sair da própria dose.
test('funciona com identidade vinda da dose, sem cadastro de bebidas', () => {
  const resumo = summarizeOccasionDoses(
    [dose('Gin', '🍸'), dose('Gin', '🍸')],
    (record) => ({ name: record.drinkName, icon: record.drinkIcon })
  );

  assert.deepEqual(resumo.totals, [{ name: 'Gin', icon: '🍸', count: 2 }]);
});
