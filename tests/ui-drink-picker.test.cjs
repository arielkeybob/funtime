const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allPicked, toggleAll, drinkPickLabel } = require('../src/ui/drink-picker.js');

test('etiqueta junta ícone e nome, sem espaço sobrando', () => {
  assert.equal(drinkPickLabel({ icon: '🍺', name: 'Cerveja' }), '🍺 Cerveja');
  assert.equal(drinkPickLabel({ icon: '', name: 'Água' }), 'Água');
});

test('"todas marcadas" só olha as etiquetas livres', () => {
  const presa = (key) => key === 1;
  assert.equal(allPicked([0, 1, 2], new Set([0, 2]), presa), true, 'a presa não conta');
  assert.equal(allPicked([0, 1, 2], new Set([0, 1]), presa), false);
  assert.equal(allPicked([1], new Set([1]), presa), false, 'sem nenhuma livre não há o que marcar');
  assert.equal(allPicked([], new Set()), false);
});

test('marcar/desmarcar todas não mexe na etiqueta presa', () => {
  const presa = (key) => key === 'b';
  const marcadas = new Set(['a', 'b', 'c']);
  assert.equal(toggleAll(['a', 'b', 'c'], marcadas, presa), false, 'todas marcadas: desmarca');
  assert.deepEqual([...marcadas], ['b']);
  assert.equal(toggleAll(['a', 'b', 'c'], marcadas, presa), true, 'alguma desmarcada: marca');
  assert.deepEqual([...marcadas].sort(), ['a', 'b', 'c']);

  const sem = new Set(['a']);
  assert.equal(toggleAll(['a', 'c'], sem), true);
  assert.deepEqual([...sem].sort(), ['a', 'c']);
});
