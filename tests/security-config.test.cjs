const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const { derivePinHash, PIN_PBKDF2_ITERATIONS } = require('../src/security/pin-crypto.js');

function extract(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function context(extra = {}) {
  const ctx = vm.createContext({
    console, atob, btoa, derivePinHash, state: {},
    DATA_STORAGE_KEY: 'funtime-v1-data',
    SECURITY_STORAGE_KEY: 'funtime-security-v1',
    PIN_PBKDF2_ITERATIONS, PIN_LENGTH: 4, LEGACY_PIN_LENGTH: 6, SECURITY_CONFIG_VERSION: 3,
    ...extra,
  });
  for (const name of ['getDefaultSecurityConfig', 'validateStoredShape', 'loadSecurityConfig', 'getPinLockoutRemainingMs', 'bytesToBase64Url', 'base64UrlToBytes', 'equalBytes', 'verifyPin']) {
    vm.runInContext(extract(name), ctx);
  }
  return ctx;
}

// --- loadSecurityConfig ---
// app.js:575-614, sem teste unitário até aqui (só exercitado de passagem por
// testes de navegador). Rede de segurança para a extração planejada para
// src/security/config.js (spec 0020, Fase 9.2.5) - testa o comportamento ATUAL.

test('loadSecurityConfig: sem dado salvo retorna configuração padrão', () => {
  const c = context({ localStorage: { getItem: () => null } });
  const config = c.loadSecurityConfig();
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
  const c = context({ localStorage: { getItem: () => JSON.stringify(stored) } });
  const config = c.loadSecurityConfig();
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
  const c = context({ localStorage: { getItem: () => '{not-json' } });
  assert.throws(() => c.loadSecurityConfig(), /Não foi possível ler a proteção do app/);
});

test('loadSecurityConfig: versão antiga (<3) com relock de 60s migra para o novo padrão de 300s', () => {
  const stored = { version: 1, enabled: false, relockSeconds: 60 };
  const c = context({ localStorage: { getItem: () => JSON.stringify(stored) } });
  assert.equal(c.loadSecurityConfig().relockSeconds, 300);
});

// --- getPinLockoutRemainingMs ---
// app.js:1040-1042, sem teste unitário até aqui.

test('getPinLockoutRemainingMs: retorna o tempo restante até o fim do bloqueio', () => {
  const c = context({ state: { pinLockoutUntil: Date.now() + 5000 } });
  const remaining = c.getPinLockoutRemainingMs();
  assert.ok(remaining > 4000 && remaining <= 5000, `esperava ~5000ms, veio ${remaining}`);
});

test('getPinLockoutRemainingMs: bloqueio no passado (ou zerado) nunca retorna negativo', () => {
  const c = context({ state: { pinLockoutUntil: Date.now() - 5000 } });
  assert.equal(c.getPinLockoutRemainingMs(), 0);
  const c2 = context({ state: { pinLockoutUntil: 0 } });
  assert.equal(c2.getPinLockoutRemainingMs(), 0);
});

// --- verifyPin ---
// app.js:1058-1064, sem teste unitário até aqui - é o coração da verificação de
// PIN (deriva com o mesmo salt/iterações salvos e compara em tempo constante).

test('verifyPin: sem PIN configurado retorna false', async () => {
  const c = context({ state: { securityConfig: { pin: null } } });
  assert.equal(await c.verifyPin('1234'), false);
});

test('verifyPin: PIN correto retorna true', async () => {
  const salt = new Uint8Array([1, 2, 3, 4]);
  const hash = await derivePinHash('1234', salt, 1000);
  const c = context({
    state: { securityConfig: { pin: {
      salt: Buffer.from(salt).toString('base64url'),
      hash: Buffer.from(hash).toString('base64url'),
      iterations: 1000,
    } } },
  });
  assert.equal(await c.verifyPin('1234'), true);
});

test('verifyPin: PIN incorreto retorna false', async () => {
  const salt = new Uint8Array([1, 2, 3, 4]);
  const hash = await derivePinHash('1234', salt, 1000);
  const c = context({
    state: { securityConfig: { pin: {
      salt: Buffer.from(salt).toString('base64url'),
      hash: Buffer.from(hash).toString('base64url'),
      iterations: 1000,
    } } },
  });
  assert.equal(await c.verifyPin('9999'), false);
});
