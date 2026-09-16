const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const { derivePinHash } = require('../src/security/pin-crypto.js');
const { createSecurityConfig } = require('../src/security/config.js');

function extract(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

// validateStoredShape/base64UrlToBytes/equalBytes continuam em app.js de propósito
// (spec 0020, 9.2.5 só move a fatia de config/verificação) - extraídas aqui de um
// vm.Context e emprestadas como dependência real do factory: mesma ponte já usada
// para os testes de drink-interactions/event-dialog (uma função criada num
// vm.Context continua chamável fora dele).
function pureDeps() {
  const ctx = vm.createContext({
    console, atob, btoa,
    DATA_STORAGE_KEY: 'funtime-v1-data',
    SECURITY_STORAGE_KEY: 'funtime-security-v1',
  });
  for (const name of ['validateStoredShape', 'base64UrlToBytes', 'equalBytes']) {
    vm.runInContext(extract(name), ctx);
  }
  return ctx;
}

function securityConfigInstance(overrides = {}) {
  const deps = pureDeps();
  return createSecurityConfig({
    state: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    securityStorageKey: 'funtime-security-v1',
    validateStoredShape: deps.validateStoredShape,
    base64UrlToBytes: deps.base64UrlToBytes,
    equalBytes: deps.equalBytes,
    ...overrides,
  });
}

// --- loadSecurityConfig ---

test('loadSecurityConfig: sem dado salvo retorna configuração padrão', () => {
  const sc = securityConfigInstance({ localStorage: { getItem: () => null } });
  const config = sc.loadSecurityConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.method, null);
  assert.equal(config.relockSeconds, 300);
  assert.equal(config.pin, null);
  assert.equal(config.webauthn, null);
});

test('loadSecurityConfig: carrega PIN salvo com salt/hash/iterações/tamanho', () => {
  const stored = {
    version: 3, enabled: true, method: 'pin', relockSeconds: 60, eventUnlockOccasionId: 'oc1',
    pin: { salt: 'AQID', hash: 'BAUG', iterations: 5000, length: 4 },
  };
  const sc = securityConfigInstance({ localStorage: { getItem: () => JSON.stringify(stored) } });
  const config = sc.loadSecurityConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.method, 'pin');
  assert.equal(config.relockSeconds, 60);
  assert.equal(config.eventUnlockOccasionId, 'oc1');
  assert.equal(config.pin.salt, 'AQID');
  assert.equal(config.pin.hash, 'BAUG');
  assert.equal(config.pin.iterations, 5000);
  assert.equal(config.pin.length, 4);
});

test('loadSecurityConfig: dado corrompido lança erro específico em vez de resetar silenciosamente', () => {
  const sc = securityConfigInstance({ localStorage: { getItem: () => '{not-json' } });
  assert.throws(() => sc.loadSecurityConfig(), /Não foi possível ler a proteção do app/);
});

test('loadSecurityConfig: versão antiga (<3) com relock de 60s migra para o novo padrão de 300s', () => {
  const stored = { version: 1, enabled: false, relockSeconds: 60 };
  const sc = securityConfigInstance({ localStorage: { getItem: () => JSON.stringify(stored) } });
  assert.equal(sc.loadSecurityConfig().relockSeconds, 300);
});

// --- getPinLockoutRemainingMs ---

test('getPinLockoutRemainingMs: retorna o tempo restante até o fim do bloqueio', () => {
  const sc = securityConfigInstance({ state: { pinLockoutUntil: Date.now() + 5000 } });
  const remaining = sc.getPinLockoutRemainingMs();
  assert.ok(remaining > 4000 && remaining <= 5000, `esperava ~5000ms, veio ${remaining}`);
});

test('getPinLockoutRemainingMs: bloqueio no passado (ou zerado) nunca retorna negativo', () => {
  const sc1 = securityConfigInstance({ state: { pinLockoutUntil: Date.now() - 5000 } });
  assert.equal(sc1.getPinLockoutRemainingMs(), 0);
  const sc2 = securityConfigInstance({ state: { pinLockoutUntil: 0 } });
  assert.equal(sc2.getPinLockoutRemainingMs(), 0);
});

// --- verifyPin ---

test('verifyPin: sem PIN configurado retorna false', async () => {
  const sc = securityConfigInstance({ state: { securityConfig: { pin: null } } });
  assert.equal(await sc.verifyPin('1234'), false);
});

test('verifyPin: PIN correto retorna true', async () => {
  const salt = new Uint8Array([1, 2, 3, 4]);
  const hash = await derivePinHash('1234', salt, 1000);
  const sc = securityConfigInstance({
    state: { securityConfig: { pin: {
      salt: Buffer.from(salt).toString('base64url'),
      hash: Buffer.from(hash).toString('base64url'),
      iterations: 1000,
    } } },
  });
  assert.equal(await sc.verifyPin('1234'), true);
});

test('verifyPin: PIN incorreto retorna false', async () => {
  const salt = new Uint8Array([1, 2, 3, 4]);
  const hash = await derivePinHash('1234', salt, 1000);
  const sc = securityConfigInstance({
    state: { securityConfig: { pin: {
      salt: Buffer.from(salt).toString('base64url'),
      hash: Buffer.from(hash).toString('base64url'),
      iterations: 1000,
    } } },
  });
  assert.equal(await sc.verifyPin('9999'), false);
});

// registerFailedPinAttempt(): único ponto que soma uma tentativa errada e decide
// o bloqueio temporário - app.js (tela de bloqueio) e reset.js (reautenticar
// para APAGAR TUDO) reimplementavam isso cada um a seu modo antes (spec 0021).
test('registerFailedPinAttempt: soma tentativas e só bloqueia ao atingir o limite (5)', () => {
  const state = { pinFailedAttempts: 0, pinLockoutUntil: 0 };
  const sc = securityConfigInstance({ state });
  for (let i = 1; i <= 4; i++) {
    assert.equal(sc.registerFailedPinAttempt(), false, `tentativa ${i} não deveria bloquear`);
    assert.equal(state.pinFailedAttempts, i);
    assert.equal(state.pinLockoutUntil, 0);
  }
  const before = Date.now();
  assert.equal(sc.registerFailedPinAttempt(), true, 'a 5ª tentativa bloqueia');
  assert.equal(state.pinFailedAttempts, 5);
  assert.ok(state.pinLockoutUntil >= before + 29000 && state.pinLockoutUntil <= Date.now() + 30000, 'bloqueio de ~30s a partir de agora');
});
test('registerFailedPinAttempt: tentativas de fluxos diferentes somam no mesmo contador', () => {
  // Comportamento existente e intencional: um único contador de tentativas
  // erradas por sessão (state.pinFailedAttempts), não um contador por fluxo -
  // errar na tela de bloqueio e depois tentar "Apagar tudo" (ou vice-versa) soma.
  const state = { pinFailedAttempts: 3, pinLockoutUntil: 0 };
  const sc = securityConfigInstance({ state });
  assert.equal(sc.registerFailedPinAttempt(), false);
  assert.equal(sc.registerFailedPinAttempt(), true);
  assert.equal(state.pinFailedAttempts, 5);
});
