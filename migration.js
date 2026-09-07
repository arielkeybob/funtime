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
  async function fingerprint(raw) {
    if (raw === null) return null;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function hashes(values) {
    return Object.fromEntries(await Promise.all(Object.entries(values).map(async ([key, raw]) => [key, await fingerprint(raw)])));
  }
  async function compactV115(storage, previous, journal) {
    const validRaw = raw => raw === null || typeof raw === "string";
    if (!["prepared", "committed"].includes(journal.phase) || !object(journal.sources) || !object(journal.targets) ||
        oldKeys.some(key => !Object.hasOwn(journal.sources, key) || !validRaw(journal.sources[key])) ||
        pairs.some(([, key]) => !Object.hasOwn(journal.targets, key) || !validRaw(journal.targets[key]))) fail();
    const before = {};
    for (const old of oldKeys) {
      before[old] = storage.getItem(old);
      if (before[old] !== journal.sources[old] && !(journal.phase === "committed" && before[old] === null)) fail();
    }
    for (const [, key] of pairs) {
      before[key] = storage.getItem(key);
      validate(journal.targets[key], key);
      if (before[key] !== journal.targets[key] && !(journal.phase === "prepared" && before[key] === null)) fail();
    }
    const compact = { version: 2, phase: journal.phase, sources: await hashes(journal.sources), targets: await hashes(journal.targets) };
    if (storage.getItem(markerKey) !== previous || Object.entries(before).some(([key, raw]) => storage.getItem(key) !== raw)) fail();
    // Libera espaço ocupado pelo diário antigo sem apagar nenhuma origem ou destino.
    verifiedWrite(storage, markerKey, JSON.stringify(compact));
    return compact;
  }
  async function migrate(storage) {
    const previous = storage.getItem(markerKey);
    let journal = previous === null ? null : parse(previous);
    if (previous !== null && !object(journal)) fail();
    if (journal?.version === 1 && journal.phase === "done") {
      if (oldKeys.some(key => storage.getItem(key) !== null)) fail();
      for (const [, key] of pairs) validate(storage.getItem(key), key);
      if (storage.getItem(pairs[0][1]) === null) fail();
      return;
    }
    if (journal?.version === 1) journal = await compactV115(storage, previous, journal);
    if (journal && (journal.version !== 2 || !["prepared", "committed"].includes(journal.phase))) fail();
    if (!journal) {
      const sources = Object.fromEntries(oldKeys.map(key => [key, storage.getItem(key)]));
      const before = {}, targets = {};
      for (const [old, key] of pairs) {
        before[key] = storage.getItem(key);
        validate(sources[old], key);
        validate(before[key], key);
        if (sources[old] !== null && before[key] !== null && sources[old] !== before[key]) fail();
        targets[key] = before[key] ?? sources[old];
      }
      targets[pairs[0][1]] ??= fromLegacy(sources[legacyKey]);
      validate(targets[pairs[0][1]], pairs[0][1]);
      journal = { version: 2, phase: "prepared", sources: await hashes(sources), targets: await hashes(targets) };
      // Web Crypto é assíncrona. Confirmar que nada mudou durante o cálculo.
      if (storage.getItem(markerKey) !== previous || oldKeys.some(key => storage.getItem(key) !== sources[key]) ||
          pairs.some(([, key]) => storage.getItem(key) !== before[key])) fail();
      verifiedWrite(storage, markerKey, JSON.stringify(journal));
    }
    const validHash = value => value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
    if (!object(journal.sources) || !object(journal.targets) ||
        oldKeys.some(key => !Object.hasOwn(journal.sources, key) || !validHash(journal.sources[key])) ||
        pairs.some(([, key]) => !Object.hasOwn(journal.targets, key) || !validHash(journal.targets[key])) ||
        journal.targets[pairs[0][1]] === null) fail();
    for (const old of oldKeys) {
      const raw = storage.getItem(old);
      if (!(journal.phase === "committed" && raw === null) && await fingerprint(raw) !== journal.sources[old]) fail();
      if (storage.getItem(old) !== raw) fail();
    }
    for (const [old, key] of pairs) {
      const current = storage.getItem(key);
      let candidate = current;
      if (candidate === null && journal.phase === "prepared") {
        candidate = storage.getItem(old);
        if (candidate === null && key === pairs[0][1]) candidate = fromLegacy(storage.getItem(legacyKey));
      }
      validate(candidate, key);
      if (await fingerprint(candidate) !== journal.targets[key] || storage.getItem(key) !== current) fail();
      if (current === null && candidate !== null) verifiedWrite(storage, key, candidate);
    }
    journal.phase = "committed";
    verifiedWrite(storage, markerKey, JSON.stringify(journal));
    for (const old of oldKeys) {
      const raw = storage.getItem(old);
      if (raw !== null && await fingerprint(raw) !== journal.sources[old]) fail();
      if (storage.getItem(old) !== raw) fail();
      storage.removeItem(old);
      if (storage.getItem(old) !== null) throw new Error("Não foi possível concluir a limpeza da migração. Tente novamente.");
    }
    // O marcador final continua compatível com os leitores da v1.15.0.
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
