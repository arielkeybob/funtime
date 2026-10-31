// Liberação da recarga do Atualizar com "Bloquear ao sair do app" (v2.34.1): o prazo curto vai da
// marca ao começo da página nova; um limite largo cobre a abertura até a decisão, que no celular
// leva segundos.
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

const constant = (name) => Number(source.match(new RegExp(`const ${name} = (\\d+);`))[1]);
const ctx = vm.createContext({ Date });
vm.runInContext(`const SECURITY_UPDATE_RELOAD_MS = ${constant('SECURITY_UPDATE_RELOAD_MS')}, SECURITY_UPDATE_RELOAD_BOOT_MS = ${constant('SECURITY_UPDATE_RELOAD_BOOT_MS')};`, ctx);
vm.runInContext(extract('isUpdateReloadOf'), ctx);
const { isUpdateReloadOf } = ctx;
const mark = 1_800_000_000_000;

test('a recarga que começou logo depois da marca vale mesmo com a abertura lenta', () => {
  assert.equal(isUpdateReloadOf(mark, mark + 3, mark + 1200), true);
  assert.equal(isUpdateReloadOf(mark, mark + 3, mark + 25000), true, 'abertura de 25 s no celular');
  assert.equal(isUpdateReloadOf(mark, mark + 2500, mark + 9000), true, 'página refeita pelo Service Worker');
});

test('sem marca, outra abertura ou fora dos limites, não vale', () => {
  assert.equal(isUpdateReloadOf(0, mark, mark), false, 'sem marca');
  assert.equal(isUpdateReloadOf(mark, mark + 10000, mark + 10500), false, 'página começou 10 s depois: não é a recarga');
  assert.equal(isUpdateReloadOf(mark, mark - 5000, mark + 500), false, 'página começou antes da marca');
  assert.equal(isUpdateReloadOf(mark, mark + 3, mark + 30000), false, 'decisão depois de 30 s');
  assert.equal(isUpdateReloadOf(mark, mark + 3, mark - 1), false, 'relógio voltou');
});
