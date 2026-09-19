const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diffAppData, isEmptyDiff, mergeRemote } = require('../src/data/sync-merge.js');

const base = (overrides = {}) => ({
  drinks: [], events: [], occasions: [], preferences: { cleanInterface: true }, ...overrides,
});

test('diffAppData marca registro novo como upsert', () => {
  const diff = diffAppData(base(), base({ drinks: [{ id: 'a', name: 'Café' }] }));
  assert.deepEqual(diff.drinks.upserted, [{ id: 'a', name: 'Café' }]);
  assert.deepEqual(diff.drinks.removed, []);
});

test('diffAppData marca registro alterado como upsert', () => {
  const previous = base({ drinks: [{ id: 'a', name: 'Café' }] });
  const next = base({ drinks: [{ id: 'a', name: 'Chá' }] });
  assert.deepEqual(diffAppData(previous, next).drinks.upserted, [{ id: 'a', name: 'Chá' }]);
});

test('diffAppData marca registro removido', () => {
  const previous = base({ events: [{ id: 'e1' }, { id: 'e2' }] });
  const next = base({ events: [{ id: 'e1' }] });
  const diff = diffAppData(previous, next);
  assert.deepEqual(diff.events.removed, ['e2']);
  assert.deepEqual(diff.events.upserted, []);
});

test('diffAppData ignora diferença só de ordem das chaves do objeto', () => {
  const previous = base({ drinks: [{ id: 'a', name: 'Café', icon: '☕' }] });
  const next = base({ drinks: [{ icon: '☕', name: 'Café', id: 'a' }] });
  assert.ok(isEmptyDiff(diffAppData(previous, next)));
});

test('diffAppData detecta mudança de preferências no meta', () => {
  const next = base({ preferences: { cleanInterface: false } });
  assert.equal(diffAppData(base(), next).metaChanged, true);
});

test('diffAppData detecta reordenação de bebidas no meta', () => {
  const previous = base({ drinks: [{ id: 'a' }, { id: 'b' }] });
  const next = base({ drinks: [{ id: 'b' }, { id: 'a' }] });
  const diff = diffAppData(previous, next);
  assert.equal(diff.metaChanged, true);
  assert.deepEqual(diff.drinks.upserted, [], 'reordenar não reescreve os documentos');
});

test('isEmptyDiff é verdadeiro quando nada mudou', () => {
  const data = base({ drinks: [{ id: 'a' }] });
  assert.ok(isEmptyDiff(diffAppData(data, data)));
});

test('mergeRemote: versão remota vence para id presente nos dois lados', () => {
  const merged = mergeRemote({
    local: base({ drinks: [{ id: 'a', name: 'local' }] }),
    remote: { drinks: [{ id: 'a', name: 'remoto' }], events: [], occasions: [] },
    lastPushed: { drinks: [{ id: 'a', name: 'local' }], events: [], occasions: [] },
  });
  assert.deepEqual(merged.drinks, [{ id: 'a', name: 'remoto' }]);
});

test('mergeRemote preserva registro local que ainda não foi enviado', () => {
  const merged = mergeRemote({
    local: base({ events: [{ id: 'novo' }] }),
    remote: { drinks: [], events: [], occasions: [] },
    lastPushed: { drinks: [], events: [], occasions: [] },
  });
  assert.deepEqual(merged.events, [{ id: 'novo' }]);
});

test('mergeRemote remove registro já enviado que sumiu do remoto (exclusão em outro aparelho)', () => {
  const merged = mergeRemote({
    local: base({ events: [{ id: 'e1' }, { id: 'e2' }] }),
    remote: { drinks: [], events: [{ id: 'e1' }], occasions: [] },
    lastPushed: { drinks: [], events: [{ id: 'e1' }, { id: 'e2' }], occasions: [] },
  });
  assert.deepEqual(merged.events, [{ id: 'e1' }]);
});

test('mergeRemote traz registro que só existe no remoto', () => {
  const merged = mergeRemote({
    local: base(),
    remote: { drinks: [], events: [{ id: 'deOutroAparelho' }], occasions: [] },
    lastPushed: null,
  });
  assert.deepEqual(merged.events, [{ id: 'deOutroAparelho' }]);
});

test('mergeRemote aplica a ordem de bebidas definida no remoto', () => {
  const merged = mergeRemote({
    local: base({ drinks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
    remote: { drinks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], events: [], occasions: [], drinkOrder: ['c', 'a', 'b'] },
    lastPushed: null,
  });
  assert.deepEqual(merged.drinks.map((drink) => drink.id), ['c', 'a', 'b']);
});

test('mergeRemote mantém preferências locais quando a nuvem ainda não tem meta', () => {
  const merged = mergeRemote({
    local: base({ preferences: { cleanInterface: false } }),
    remote: { drinks: [], events: [], occasions: [], preferences: null },
    lastPushed: null,
  });
  assert.deepEqual(merged.preferences, { cleanInterface: false });
});

// --- Janela de sincronização (docs/specs/0024) --------------------------------------
const { isOutsideWindow, syncedBaseline, OCCASION_WINDOW_MARGIN_MS } = require('../src/data/sync-merge.js');

const CORTE = 1_000_000_000_000;
const ANTIGO = CORTE - 1000;
const RECENTE = CORTE + 1000;

test('janela: sem corte nada é antigo (modo de sempre)', () => {
  assert.equal(isOutsideWindow('events', { consumedAt: 1 }, null), false);
  assert.equal(isOutsideWindow('occasions', { startedAt: 1 }, undefined), false);
});

test('janela: dose é antiga só se anterior ao corte; agendado sem início nunca é', () => {
  assert.equal(isOutsideWindow('events', { consumedAt: ANTIGO }, CORTE), true);
  assert.equal(isOutsideWindow('events', { consumedAt: RECENTE }, CORTE), false);
  assert.equal(isOutsideWindow('events', {}, CORTE), false, 'sem horário não dá para dizer que é antigo');
  assert.equal(isOutsideWindow('occasions', { startedAt: null, scheduledStartAt: 1 }, CORTE), false);
  assert.equal(isOutsideWindow('drinks', { id: 'a' }, CORTE), false, 'bebidas nunca entram na janela');
});

test('janela: ocasião que começou logo antes do corte ainda conta como recente (margem)', () => {
  assert.equal(isOutsideWindow('occasions', { startedAt: CORTE - OCCASION_WINDOW_MARGIN_MS + 1 }, CORTE), false);
  assert.equal(isOutsideWindow('occasions', { startedAt: CORTE - OCCASION_WINDOW_MARGIN_MS - 1 }, CORTE), true);
});

test('janela: dose antiga só daqui, ausente do remoto, é mantida — não é exclusão', () => {
  const merged = mergeRemote({
    local: base({ events: [{ id: 'velho', consumedAt: ANTIGO }, { id: 'novo', consumedAt: RECENTE }] }),
    remote: { drinks: [], events: [{ id: 'novo', consumedAt: RECENTE }], occasions: [] },
    // O velho consta como já enviado: sem a janela isto seria lido como exclusão em outro aparelho.
    lastPushed: { drinks: [], events: [{ id: 'velho', consumedAt: ANTIGO }, { id: 'novo', consumedAt: RECENTE }], occasions: [] },
    windowStart: CORTE,
  });
  assert.deepEqual(merged.events.map((e) => e.id), ['velho', 'novo']);
});

test('janela: dose recente já enviada que sumiu do remoto continua sendo exclusão em outro aparelho', () => {
  const merged = mergeRemote({
    local: base({ events: [{ id: 'apagada', consumedAt: RECENTE }] }),
    remote: { drinks: [], events: [], occasions: [] },
    lastPushed: { drinks: [], events: [{ id: 'apagada', consumedAt: RECENTE }], occasions: [] },
    windowStart: CORTE,
  });
  assert.deepEqual(merged.events, []);
});

test('janela: ocasião antiga é mantida e agendada que sumiu do remoto é excluída', () => {
  const merged = mergeRemote({
    local: base({ occasions: [
      { id: 'velha', startedAt: CORTE - OCCASION_WINDOW_MARGIN_MS * 4, endedAt: ANTIGO },
      { id: 'agendada', startedAt: null, scheduledStartAt: RECENTE },
    ] }),
    remote: { drinks: [], events: [], occasions: [] },
    lastPushed: { drinks: [], events: [], occasions: [
      { id: 'velha', startedAt: CORTE - OCCASION_WINDOW_MARGIN_MS * 4, endedAt: ANTIGO },
      { id: 'agendada', startedAt: null, scheduledStartAt: RECENTE },
    ] },
    windowStart: CORTE,
  });
  assert.deepEqual(merged.occasions.map((o) => o.id), ['velha']);
});

test('janela: a base já enviada inclui o antigo local, senão cada abertura o reescreveria', () => {
  const merged = base({ events: [{ id: 'velho', consumedAt: ANTIGO }, { id: 'novo', consumedAt: RECENTE }] });
  const remote = { drinks: [], events: [{ id: 'novo', consumedAt: RECENTE }], occasions: [], preferences: null };

  const baseline = syncedBaseline({ merged, remote, windowStart: CORTE });
  assert.deepEqual(baseline.events.map((e) => e.id).sort(), ['novo', 'velho']);
  assert.ok(isEmptyDiff(diffAppData(baseline, { ...merged, preferences: null })), 'nada a enviar');
});

test('janela: dose antiga criada agora (retroativa) não está na base e sobe', () => {
  const remote = { drinks: [], events: [], occasions: [], preferences: null };
  const baseline = syncedBaseline({ merged: base(), remote, windowStart: CORTE });
  const diff = diffAppData(baseline, base({ events: [{ id: 'retro', consumedAt: ANTIGO }] }));
  assert.deepEqual(diff.events.upserted.map((e) => e.id), ['retro']);
});

test('janela: apagar uma dose antiga local vira exclusão na nuvem', () => {
  const merged = base({ events: [{ id: 'velho', consumedAt: ANTIGO }] });
  const remote = { drinks: [], events: [], occasions: [], preferences: null };
  const baseline = syncedBaseline({ merged, remote, windowStart: CORTE });
  assert.deepEqual(diffAppData(baseline, base()).events.removed, ['velho']);
});

test('sem janela a base é exatamente o remoto (comportamento de sempre)', () => {
  const merged = base({ events: [{ id: 'so-local', consumedAt: ANTIGO }] });
  const remote = { drinks: [], events: [{ id: 'r', consumedAt: 1 }], occasions: [], preferences: null };
  assert.deepEqual(syncedBaseline({ merged, remote }).events, remote.events);
});

// --- Ordem das bebidas não pode gerar regravação em ciclo ---------------------------
test('ordem: a base já enviada segue a ordem da pessoa, não a dos ids que o Firestore devolve', () => {
  // O Firestore entrega por id (d1, d2, d3); a pessoa arrastou para d3, d1, d2.
  const remote = {
    drinks: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }], events: [], occasions: [],
    preferences: { cleanInterface: true }, drinkOrder: ['d3', 'd1', 'd2'],
  };
  const merged = mergeRemote({ local: base({ drinks: [{ id: 'd3' }, { id: 'd1' }, { id: 'd2' }] }), remote, lastPushed: null });
  assert.deepEqual(merged.drinks.map((d) => d.id), ['d3', 'd1', 'd2']);

  const baseline = syncedBaseline({ merged, remote });
  assert.deepEqual(baseline.drinks.map((d) => d.id), ['d3', 'd1', 'd2']);
  assert.equal(diffAppData(baseline, merged).metaChanged, false, 'nada mudou: o meta não pode ser regravado');
});

test('ordem: reordenar de verdade continua marcando o meta', () => {
  const remote = { drinks: [{ id: 'd1' }, { id: 'd2' }], events: [], occasions: [], preferences: null, drinkOrder: ['d1', 'd2'] };
  const baseline = syncedBaseline({ merged: base(), remote });
  assert.equal(diffAppData(baseline, base({ preferences: null, drinks: [{ id: 'd2' }, { id: 'd1' }] })).metaChanged, true);
});
