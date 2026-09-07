/* Compatibilidade de armazenamento. Não exportar este diário em backups. */
"use strict";
globalThis.FunTimeMigration = (() => {
  const markerKey = "funtime-migration-v1";
  const pairs = [
    ["balada-v1-data", "funtime-v1-data"],
    ["intervalo-security-v1", "funtime-security-v1"],
    ["intervalo-terms-v1", "funtime-terms-v1"],
  ];
  const legacyKey = "balada-v1-drinks";
  const oldKeys = [...pairs.map(([old]) => old), legacyKey];
  const sessionPairs = [
    ["intervalo-security-session-v1", "funtime-security-session-v1"],
    ["intervalo-terms-draft-v1", "funtime-terms-draft-v1"],
    ["intervalo-restore-success-v1", "funtime-restore-success-v1"],
  ];
  const fail = () => { throw new Error("Há dados incompatíveis ou conflitantes. A migração foi interrompida para preservá-los."); };
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  function parse(raw) {
    try { return JSON.parse(raw); } catch { return fail(); }
  }
  function validate(raw, key) {
    if (raw === null) return;
    const value = parse(raw);
    if (!object(value)) fail();
    if (key === "funtime-v1-data") {
      if ((value.version !== undefined && (!Number.isInteger(value.version) || value.version < 1 || value.version > 9)) ||
          !Array.isArray(value.drinks) || !Array.isArray(value.events)) fail();
      const ids = new Set(), events = new Set();
      for (const drink of value.drinks) {
        if (!object(drink) || !drink.id || !drink.name || ids.has(String(drink.id))) fail();
        ids.add(String(drink.id));
      }
      for (const event of value.events) {
        if (!object(event) || !event.id || !event.drinkId ||
            !Number.isFinite(Number(event.consumedAt)) || events.has(String(event.id))) fail();
        events.add(String(event.id));
      }
    } else if (key === "funtime-security-v1") {
      if (typeof value.enabled !== "boolean") fail();
      if (value.enabled) {
        if (value.method === "pin") {
          if (!value.pin || typeof value.pin.salt !== "string" || !value.pin.salt ||
              typeof value.pin.hash !== "string" || !value.pin.hash) fail();
        } else if (value.method === "device") {
          if (!value.webauthn || typeof value.webauthn.credentialId !== "string" || !value.webauthn.credentialId ||
              typeof value.webauthn.publicKey !== "string" || !value.webauthn.publicKey) fail();
        } else fail();
      }
    } else if (key === "funtime-terms-v1") {
      if (value.termsAccepted !== true || typeof value.termsVersion !== "string" ||
          !Number.isFinite(value.termsAcceptedAt) || value.termsAcceptedAt <= 0) fail();
    }
  }
  function fromLegacy(raw) {
    const items = raw === null ? [] : parse(raw);
    if (!Array.isArray(items)) fail();
    const drinks = [], events = [], ids = new Set();
    for (const item of items) {
      if (!object(item) || !item.id || !item.name || ids.has(String(item.id))) fail();
      const id = String(item.id);
      ids.add(id);
      drinks.push({ ...item, id, askDoseSize: false });
      if (Number.isFinite(Number(item.lastConsumedAt)) && Number(item.lastConsumedAt) > 0) {
        events.push({ id: `legacy-${encodeURIComponent(id)}-${Number(item.lastConsumedAt)}`,
          drinkId: id, drinkName: String(item.name), drinkIcon: item.icon,
          consumedAt: Number(item.lastConsumedAt), intervalMinutes: item.intervalMinutes, doseSize: null });
      }
    }
    return JSON.stringify({ version: 9, drinks, events, preferences: { cleanInterface: true, countingMode: "countdown" } });
  }
  function verifiedWrite(storage, key, value) {
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error("Não foi possível verificar a gravação. Tente novamente.");
  }
  function migrate(storage) {
    const existing = storage.getItem(markerKey);
    let journal = existing === null ? null : parse(existing);
    if (journal && (journal.version !== 1 || !["prepared", "committed", "done"].includes(journal.phase))) fail();
    if (journal?.phase === "done") {
      // Nunca reaproveitar uma origem reaparecida: um cliente antigo pode ter escrito nela.
      if (oldKeys.some(key => storage.getItem(key) !== null)) fail();
      for (const [, key] of pairs) validate(storage.getItem(key), key);
      if (storage.getItem(pairs[0][1]) === null) fail();
      return;
    }
    if (!journal) {
      const sources = Object.fromEntries(oldKeys.map(key => [key, storage.getItem(key)]));
      const targets = {};
      for (const [old, key] of pairs) {
        const source = sources[old], target = storage.getItem(key);
        validate(source, key);
        validate(target, key);
        if (source !== null && target !== null && source !== target) fail();
        targets[key] = target ?? source;
      }
      if (targets[pairs[0][1]] === null) targets[pairs[0][1]] = fromLegacy(sources[legacyKey]);
      validate(targets[pairs[0][1]], pairs[0][1]);
      journal = { version: 1, phase: "prepared", sources, targets };
      verifiedWrite(storage, markerKey, JSON.stringify(journal));
    }
    if (!object(journal.sources) || !object(journal.targets) ||
        oldKeys.some(key => !(key in journal.sources))) fail();
    for (const [, key] of pairs) {
      if (!(key in journal.targets) || (journal.targets[key] !== null && typeof journal.targets[key] !== "string")) fail();
      validate(journal.targets[key], key);
    }
    for (const old of oldKeys) {
      const current = storage.getItem(old);
      if (current !== journal.sources[old] && !(journal.phase === "committed" && current === null)) fail();
    }
    for (const [, key] of pairs) {
      const target = storage.getItem(key), planned = journal.targets[key];
      if (target !== null && target !== planned) fail();
      if (journal.phase === "committed" && target !== planned) fail();
      if (target === null && planned !== null) verifiedWrite(storage, key, planned);
    }
    // Não apagar a origem antes de concluir e reler todos os destinos críticos.
    journal.phase = "committed";
    verifiedWrite(storage, markerKey, JSON.stringify(journal));
    for (const old of oldKeys) {
      if (storage.getItem(old) !== null && storage.getItem(old) !== journal.sources[old]) fail();
      storage.removeItem(old);
      if (storage.getItem(old) !== null) throw new Error("Não foi possível concluir a limpeza da migração. Tente novamente.");
    }
    verifiedWrite(storage, markerKey, JSON.stringify({ version: 1, phase: "done" }));
  }
  function migrateSession(storage) {
    for (const [old, key] of sessionPairs) {
      const source = storage.getItem(old), target = storage.getItem(key);
      if (target === null && source !== null) verifiedWrite(storage, key, source);
      storage.removeItem(old);
    }
  }
  return { migrate, migrateSession, validate, oldKeys, sessionPairs };
})();
