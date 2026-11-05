// Modo tester avançado (docs/specs/0035): registro de diagnóstico guardado só neste aparelho,
// desligado por padrão. Serve para descobrir depois por que a conta caiu ou um registro sumiu:
// isso acontece no celular de quem usa, e a evidência some antes de alguém olhar.
// Nunca recebe nome de bebida, e-mail, token nem conteúdo de registro; só tipos, contagens,
// códigos de erro e horários. Fica no localStorage, que sobrevive à limpeza que o Chrome faz
// sem espaço no aparelho, e fora do backup.
export const DIAGNOSTICS_STORAGE_KEY = "funtime-diagnostics-v1";
export const DIAGNOSTICS_MAX_ENTRIES = 1500;
const SAVE_DELAY_MS = 500;
const MAX_TEXT = 200;

// Rede de segurança contra conteúdo inesperado: só valores simples, textos curtos e no máximo
// um nível de objeto (contagens por coleção).
function cleanValue(value, depth) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) + "…" : value;
  if (depth < 1 && typeof value === "object" && !Array.isArray(value)) return cleanDetails(value, depth + 1);
  return undefined;
}

function cleanDetails(details, depth = 0) {
  const out = {};
  for (const [key, value] of Object.entries(details || {})) {
    const cleaned = cleanValue(value, depth);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

export function createDiagnosticsLog({
  storage, now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout, maxEntries = DIAGNOSTICS_MAX_ENTRIES,
} = {}) {
  let timer = null;
  let current = read();

  function read() {
    try {
      const saved = JSON.parse(storage.getItem(DIAGNOSTICS_STORAGE_KEY));
      if (saved?.enabled === true && Array.isArray(saved.entries)) {
        return { enabled: true, since: Number(saved.since) || now(), entries: saved.entries.slice(-maxEntries) };
      }
    } catch { /* registro ilegível ou armazenamento bloqueado: começa desligado */ }
    return { enabled: false, since: null, entries: [] };
  }

  function save() {
    if (timer) { cancel(timer); timer = null; }
    try {
      if (current.enabled) storage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(current));
      else storage.removeItem(DIAGNOSTICS_STORAGE_KEY);
    } catch {
      // Sem espaço: descarta a metade mais antiga e tenta uma vez. O diagnóstico nunca derruba o app.
      current.entries = current.entries.slice(Math.floor(current.entries.length / 2));
      try { storage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(current)); } catch { /* fica só na memória */ }
    }
  }

  function record(type, details) {
    if (!current.enabled) return;
    current.entries.push({ t: now(), type: String(type), ...cleanDetails(details) });
    if (current.entries.length > maxEntries) current.entries.splice(0, current.entries.length - maxEntries);
    if (!timer) timer = schedule(() => { timer = null; save(); }, SAVE_DELAY_MS);
  }

  function enable() {
    if (current.enabled) return;
    current = { enabled: true, since: now(), entries: [] };
    save();
  }

  // Desligar apaga: o registro só existe enquanto a pessoa quer testar.
  function disable() {
    current = { enabled: false, since: null, entries: [] };
    save();
  }

  function clear() {
    if (!current.enabled) return;
    current = { enabled: true, since: now(), entries: [] };
    save();
  }

  function report(extra = {}) {
    const iso = (ms) => new Date(ms).toISOString();
    return {
      type: "funtime-diagnostics",
      formatVersion: 1,
      createdAt: iso(now()),
      since: current.since ? iso(current.since) : null,
      ...cleanDetails(extra),
      events: current.entries.map(({ t, ...rest }) => ({ t: iso(t), ...rest })),
    };
  }

  return {
    isEnabled: () => current.enabled,
    count: () => current.entries.length,
    since: () => current.since,
    record, enable, disable, clear, report,
    // Só grava: desligado não há o que guardar, e apagar a chave aqui desfaria um registro que
    // outra abertura acabou de ligar. Apagar é papel de `disable`.
    flush: () => { if (current.enabled) save(); },
  };
}
