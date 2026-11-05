// Sondas do modo tester (docs/specs/0035). Só observam e chamam `record`; nenhuma muda o que o
// app faz, e com o modo desligado não registram nada.

const AUTH_ROUTES = [
  [/identitytoolkit\.googleapis\.com\/v\d+\/accounts:lookup/, "accounts:lookup"],
  [/identitytoolkit\.googleapis\.com\/v\d+\/accounts:signInWithIdp/, "accounts:signInWithIdp"],
  [/securetoken\.googleapis\.com\/v\d+\/token/, "token"],
];

function authRoute(url) {
  return AUTH_ROUTES.find(([pattern]) => pattern.test(url))?.[1] ?? null;
}

// O Firebase só descarta a sessão guardada quando o servidor responde com erro (qualquer um que
// não seja de rede). A resposta dos servidores de login é o que diz por que a conta caiu. Guarda
// só a rota, o status e o código do erro ("TOKEN_EXPIRED"); nunca o pedido, o token ou a chave.
export function watchAuthRequests({ target = globalThis, record, isEnabled, now = () => Date.now() }) {
  const original = target.fetch;
  if (typeof original !== "function" || original.funtimeDiagnostics) return;

  const wrapped = async function fetchWithDiagnostics(...args) {
    const input = args[0];
    const route = isEnabled() ? authRoute(String(typeof input === "string" ? input : input?.url || "")) : null;
    if (!route) return original.apply(target, args);

    const started = now();
    try {
      const response = await original.apply(target, args);
      let erro = null;
      if (!response.ok) {
        try { erro = String((await response.clone().json())?.error?.message ?? "").split(" : ")[0] || null; }
        catch { erro = "resposta sem JSON"; }
      }
      record("conta.http", { rota: route, status: response.status, erro, ms: now() - started, online: target.navigator?.onLine });
      return response;
    } catch (error) {
      record("conta.http", { rota: route, falha: String(error?.message || error), ms: now() - started, online: target.navigator?.onLine });
      throw error;
    }
  };
  wrapped.funtimeDiagnostics = true;
  target.fetch = wrapped;
}

// O SDK guarda a sessão em `firebase:authUser:<apiKey>:<app>`. Registrada antes de o Firebase
// abrir, separa "o armazenamento perdeu a sessão" de "o Firebase a descartou".
export function hasStoredSession(storage) {
  try {
    for (let index = 0; index < storage.length; index += 1) {
      if (storage.key(index)?.startsWith("firebase:authUser:")) return true;
    }
  } catch { /* armazenamento bloqueado */ }
  return false;
}

// Retrato do armazenamento ao abrir: foi a falta de espaço que levou a cópia offline e a sessão
// no celular de 04/11/2026. Só leituras.
export async function describeEnvironment({ storage, nav = globalThis.navigator, cachesApi = globalThis.caches, idb = globalThis.indexedDB, perf = globalThis.performance }) {
  const env = {
    online: nav?.onLine,
    controladoPorSW: Boolean(nav?.serviceWorker?.controller),
    paginaDoSW: (perf?.getEntriesByType?.("navigation")?.[0]?.workerStart ?? 0) > 0,
    sessaoGuardada: hasStoredSession(storage),
  };
  try { env.persistente = await nav.storage.persisted(); } catch { /* sem API */ }
  try {
    const { usage, quota } = await nav.storage.estimate();
    env.usoMB = Math.round((usage / 1048576) * 100) / 100;
    env.cotaMB = Math.round(quota / 1048576);
  } catch { /* sem API */ }
  try {
    const bancos = (await idb.databases()).map((db) => db.name).filter((name) => /^(firebase|firestore)/.test(name));
    env.bancos = bancos.join(", ") || "nenhum";
  } catch { /* sem API */ }
  try { env.caches = (await cachesApi.keys()).join(", ") || "nenhum"; } catch { /* sem API */ }
  return env;
}

export function watchPageErrors({ target = globalThis, record }) {
  const file = (name) => String(name || "").split("/").pop().split("?")[0];
  target.addEventListener("error", (event) => {
    record("erro", { msg: event.message, arquivo: file(event.filename), linha: event.lineno });
  });
  target.addEventListener("unhandledrejection", (event) => {
    record("erro", { msg: String(event.reason?.message || event.reason), origem: "promessa" });
  });
}
