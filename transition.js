/* Contrato de posse dos dados entre instalações na mesma origem. Ver TRANSITION-V2.md. */
"use strict";
globalThis.FunTimeTransition = (() => {
  const ownerKey = "funtime-installation-owner-v1";
  const writerLock = "funtime-app-writer-v1";
  const targetPath = "/funtime/";
  const releasePath = "/funtime/transition.json";
  const transitionProtocol = 1;
  function targetUrl(origin) {
    const base = new URL(origin);
    const target = new URL(targetPath, base);
    if (target.origin !== base.origin || !["http:", "https:"].includes(target.protocol)) {
      throw new Error("O endereço da nova versão não é válido.");
    }
    return target;
  }
  function readOwner(storage, origin) {
    const raw = storage.getItem(ownerKey);
    if (raw === null) return null; // Nenhum anúncio nem desativação antes da v2 assumir.
    let record;
    try { record = JSON.parse(raw); } catch { /* Falha fechada abaixo. */ }
    if (!record || record.version !== 1 || record.generation !== 2 || record.targetPath !== targetPath ||
        !Number.isFinite(record.claimedAt) || record.claimedAt <= 0 ||
        !Number.isInteger(record.dataVersion) || record.dataVersion < 9) {
      throw new Error("Não foi possível verificar a transição do app. Os dados foram preservados.");
    }
    const target = targetUrl(origin);
    return { ...record, url: target.href };
  }
  function parseRelease(record, origin) {
    if (!record || record.version !== 1 || record.generation !== 2 || record.status !== "ready" ||
        record.targetPath !== targetPath || record.transitionProtocol !== transitionProtocol ||
        typeof record.appVersion !== "string" || !/^2\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(record.appVersion) ||
        !Number.isFinite(record.publishedAt) || record.publishedAt <= 0 ||
        !Number.isInteger(record.dataVersion) || record.dataVersion < 9) return null;
    return { ...record, url: targetUrl(origin).href };
  }
  async function discoverRelease(fetcher, origin, signal) {
    const expected = new URL(releasePath, origin);
    try {
      const response = await fetcher(expected.href, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal
      });
      if (!response.ok || response.url !== expected.href || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "")) return null;
      return parseRelease(await response.json(), origin);
    } catch {
      return null; // Offline, ausente ou inválido: a v1 continua funcionando sem anunciar a v2.
    }
  }
  // A v1 apenas lê esse registro; sua escrita pertence à entrega e validação da v2.
  return { ownerKey, writerLock, targetPath, releasePath, transitionProtocol, readOwner, parseRelease, discoverRelease };
})();
