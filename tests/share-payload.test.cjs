const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSharePayload, readSharePayload, shareExpiresAtMs, SHARE_GRACE_MS } = require('../src/data/share-payload.js');

const HORA = 60 * 60 * 1000;
const ocasiao = (extra = {}) => ({ id: 'oc-1', name: 'Aniversário da Ju', startedAt: 1000, endedAt: null, ...extra });

const dose = (extra = {}) => ({
  id: 'ev-1', drinkId: 'drink-secreto-123', drinkName: 'Cerveja', drinkIcon: '🍺',
  consumedAt: 2000, occasionId: 'oc-1', intervalMinutes: 60, doseSize: null, ...extra,
});

const montar = (events, extra = {}) => buildSharePayload({
  occasion: ocasiao(), events, ownerUid: 'A', viewerUid: 'B', ownerAlias: 'Ariel', now: 5000, ...extra,
});

// A garantia central da funcionalidade: só as doses daquele evento saem, e sem os
// identificadores internos de quem compartilhou.
test('PRIVACIDADE: nenhum identificador interno atravessa', () => {
  const serializado = JSON.stringify(montar([dose()]));

  assert.ok(!serializado.includes('drink-secreto-123'), 'drinkId não pode sair');
  assert.ok(!serializado.includes('oc-1'), 'occasionId não pode sair');
});

test('PRIVACIDADE: doses de outras ocasiões nunca entram', () => {
  const payload = montar([
    dose({ id: 'ev-1' }),
    dose({ id: 'ev-2', occasionId: 'outra-ocasiao' }),
    dose({ id: 'ev-3', occasionId: null }),
  ]);

  assert.deepEqual(payload.events.map((item) => item.id), ['ev-1']);
  assert.equal(payload.eventCount, 1);
});

test('leva só os campos previstos da dose', () => {
  const payload = montar([dose({ countingStoppedAt: 4000 })]);

  assert.deepEqual(Object.keys(payload.events[0]).sort(), [
    'consumedAt', 'countingStoppedAt', 'doseSize', 'drinkIcon', 'drinkName', 'id', 'intervalMinutes',
  ]);
});

test('omite countingStoppedAt quando a contagem não foi interrompida', () => {
  assert.equal('countingStoppedAt' in montar([dose()]).events[0], false);
});

test('o evento vai sem o id da ocasião', () => {
  assert.deepEqual(Object.keys(montar([dose()]).occasion).sort(), ['endedAt', 'name', 'startedAt']);
});

test('ordena as doses por horário e resume por bebida', () => {
  const payload = montar([
    dose({ id: 'b', consumedAt: 3000, drinkName: 'Vinho' }),
    dose({ id: 'a', consumedAt: 2000, drinkName: 'Cerveja' }),
    dose({ id: 'c', consumedAt: 4000, drinkName: 'Cerveja' }),
  ]);

  assert.deepEqual(payload.events.map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(payload.totals, [
    { name: 'Cerveja', icon: '🍺', count: 2 },
    { name: 'Vinho', icon: '🍺', count: 1 },
  ]);
  assert.equal(payload.lastEventAt, 4000);
});

// Cortar é aceitável; cortar calado não é.
test('ao cortar, mantém as mais recentes e diz quantas existem', () => {
  const doses = Array.from({ length: 5 }, (unused, index) => dose({ id: `ev-${index}`, consumedAt: 2000 + index }));
  const payload = montar(doses, { maxEvents: 3 });

  assert.deepEqual(payload.events.map((item) => item.id), ['ev-2', 'ev-3', 'ev-4']);
  assert.equal(payload.truncated, true);
  assert.equal(payload.eventCount, 5, 'o total verdadeiro continua visível');
});

test('sem corte, truncated é falso', () => {
  assert.equal(montar([dose()]).truncated, false);
});

test('prazo: 24h após o fim do evento', () => {
  assert.equal(shareExpiresAtMs(ocasiao({ endedAt: 10 * HORA })), 10 * HORA + SHARE_GRACE_MS);
});

test('prazo: evento aberto expira 24h após o limite de 48h', () => {
  assert.equal(shareExpiresAtMs(ocasiao({ startedAt: 0, endedAt: null })), 48 * HORA + SHARE_GRACE_MS);
});

test('prazo: encerrar o evento mais cedo aproxima o vencimento', () => {
  const aberto = shareExpiresAtMs(ocasiao({ startedAt: 0, endedAt: null }));
  const encerrado = shareExpiresAtMs(ocasiao({ startedAt: 0, endedAt: 2 * HORA }));

  assert.ok(encerrado < aberto);
});

test('leitura aceita um payload íntegro dentro do prazo', () => {
  const payload = montar([dose()]);
  const resultado = readSharePayload({ ...payload, expiresAt: { toMillis: () => 99999 } }, 5000);

  assert.equal(resultado.ok, true);
  assert.equal(resultado.view.ownerAlias, 'Ariel');
  assert.equal(resultado.view.events.length, 1);
});

test('leitura recusa payload vencido', () => {
  const payload = montar([dose()]);
  const resultado = readSharePayload({ ...payload, expiresAt: { toMillis: () => 1000 } }, 5000);

  assert.deepEqual(resultado, { ok: false, reason: 'expired' });
});

test('leitura falha fechada em payload quebrado', () => {
  const base = { ...montar([dose()]), expiresAt: { toMillis: () => 99999 } };

  assert.equal(readSharePayload(null, 5000).reason, 'malformed');
  assert.equal(readSharePayload({}, 5000).reason, 'malformed');
  assert.equal(readSharePayload({ ...base, expiresAt: undefined, expiresAtMs: undefined }, 5000).reason, 'malformed');
  assert.equal(readSharePayload({ ...base, occasion: undefined }, 5000).reason, 'malformed');
  assert.equal(readSharePayload({ ...base, events: 'nada disso' }, 5000).reason, 'malformed');
});

test('leitura descarta doses quebradas sem derrubar a tela', () => {
  const base = { ...montar([dose()]), expiresAt: { toMillis: () => 99999 } };
  const resultado = readSharePayload({ ...base, events: [...base.events, { id: 'x' }, null] }, 5000);

  assert.equal(resultado.ok, true);
  assert.equal(resultado.view.events.length, 1);
});
