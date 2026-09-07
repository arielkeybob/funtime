/* Receptor v2: todas as operações de dados exigem o lock compartilhado do boot. */
"use strict";
globalThis.FunTimeReceiver = (() => {
  const dataKey = "funtime-v1-data";
  const trackedKeys = [dataKey, "funtime-security-v1", "funtime-terms-v1", "funtime-migration-v1",
    "balada-v1-data", "balada-v1-drinks", "intervalo-security-v1", "intervalo-terms-v1"];
  const fail = () => { throw new Error("Os dados mudaram ou não puderam ser verificados. Feche as outras janelas e tente novamente. Nada foi descartado."); };
  function inspect(storage, origin) {
    const owner = FunTimeTransition.readOwner(storage, origin);
    const values = Object.fromEntries(trackedKeys.map(key => [key, storage.getItem(key)]));
    if (owner && values[dataKey] === null) fail();
    const existing = Object.values(values).some(value => value !== null);
    if (existing && values[dataKey] === null && values['balada-v1-data'] === null &&
        values['balada-v1-drinks'] === null && values['funtime-migration-v1'] === null) fail();
    return {owner, existing, values};
  }
  function unchanged(storage, values) {
    if (Object.entries(values).some(([key, raw]) => storage.getItem(key) !== raw)) fail();
  }
  async function prepare(storage, origin) {
    await FunTimeMigration.migrate(storage);
    const snapshot = inspect(storage, origin);
    if (snapshot.values[dataKey] === null) fail();
    for (const key of [dataKey, "funtime-security-v1", "funtime-terms-v1"]) {
      FunTimeMigration.validate(snapshot.values[key], key);
    }
    return snapshot;
  }
  function claim(storage, origin, snapshot, now = Date.now()) {
    unchanged(storage, snapshot.values);
    const owner = FunTimeTransition.readOwner(storage, origin);
    if (owner) return owner;
    if (!Number.isFinite(now) || now <= 0) fail();
    const raw = JSON.stringify({version:1,generation:2,targetPath:'/funtime/',claimedAt:now,dataVersion:9});
    storage.setItem(FunTimeTransition.ownerKey, raw);
    if (storage.getItem(FunTimeTransition.ownerKey) !== raw) fail();
    return FunTimeTransition.readOwner(storage, origin);
  }
  async function verifyBridge(serviceWorker, origin, send, required) {
    const scope = new URL('/intervalo/', origin).href;
    const registration = await serviceWorker.getRegistration(scope);
    if (!registration || registration.scope !== scope) {
      if (required) throw new Error("Abra a versão anterior e atualize para v1.16 antes de transferir os dados. Depois volte ao FunTime 2.");
      return false;
    }
    const active = registration.active;
    if (!active) throw new Error("Abra e atualize a versão anterior para preparar a transferência.");
    const version = await send(active, 'GET_VERSION');
    if (version?.migrationProtocol !== 2 || version?.transitionProtocol !== 1) {
      throw new Error("A versão anterior precisa ser atualizada para v1.16. Abra o ícone antigo, toque em Atualizar e volte aqui.");
    }
    const proof = await send(active, 'FUNTIME_PREPARE');
    if (registration.active !== active || !proof?.ready || proof.protocol !== 2 || proof.transitionProtocol !== 1) {
      throw new Error("Não foi possível preparar todas as janelas antigas. Abra e atualize a versão anterior antes de continuar.");
    }
    return true;
  }
  return { dataKey, inspect, unchanged, prepare, claim, verifyBridge };
})();
