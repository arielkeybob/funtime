// Gesto secreto das opções de teste (docs/specs/0036): 7 toques seguidos liberam.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSecretTaps } = require('../src/ui/secret-taps.js');

function setup() {
  let agora = 0;
  const eventos = [];
  const taps = createSecretTaps({
    now: () => agora,
    onProgress: (faltam) => eventos.push(`faltam ${faltam}`),
    onUnlock: () => eventos.push('liberou'),
  });
  return { eventos, tocar: (vezes = 1, intervalo = 300) => { for (let i = 0; i < vezes; i += 1) { agora += intervalo; taps.tap(); } } };
}

test('sete toques seguidos liberam, com aviso do 4º ao 6º', () => {
  const { eventos, tocar } = setup();
  tocar(7);
  assert.deepEqual(eventos, ['faltam 3', 'faltam 2', 'faltam 1', 'liberou']);
});

test('poucos toques não dizem nada nem liberam', () => {
  const { eventos, tocar } = setup();
  tocar(3);
  assert.deepEqual(eventos, []);
});

test('uma pausa maior que 1,5 s recomeça a contagem', () => {
  const { eventos, tocar } = setup();
  tocar(5);
  tocar(1, 1600); // recomeça: este é o 1º
  tocar(5); // 2º ao 6º: avisa, mas não libera
  assert.deepEqual(eventos, ['faltam 3', 'faltam 2', 'faltam 3', 'faltam 2', 'faltam 1']);
});

test('depois de liberar, a contagem volta do zero', () => {
  const { eventos, tocar } = setup();
  tocar(7);
  tocar(3);
  assert.deepEqual(eventos, ['faltam 3', 'faltam 2', 'faltam 1', 'liberou']);
  tocar(4);
  assert.deepEqual(eventos.slice(4), ['faltam 3', 'faltam 2', 'faltam 1', 'liberou']);
});
