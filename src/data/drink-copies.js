import { loadFirestore } from "./firestore-db.js";
import { buildPairId } from "./share-codes.js";

// Copiar a lista de bebidas para um amigo (docs/specs/0032). Quem envia grava uma cópia
// em drinkCopies/{eu}_{amigo} e marca o horário do envio no próprio ponteiro do pareamento;
// quem recebe descobre pelo ponteiro (a escuta de pareamentos já existe) e só lê a cópia
// ao tocar em "Receber".
//
// Aplicar a cópia é com o app, que tem `state` e a prévia de importação: este módulo só
// fala com a nuvem e nunca toca `state` nem `localStorage`.

export const DRINK_COPY_TTL_MS = 24 * 60 * 60 * 1000;
export const DRINK_COPY_FORMAT_VERSION = 1;

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const millis = (value) => (typeof value?.toMillis === "function" ? value.toMillis() : null);

// O que sai do aparelho de quem envia: só isto. Sem o id local, sem dose, sem histórico.
export function buildDrinkCopyPayload(drinks) {
  return (Array.isArray(drinks) ? drinks : []).map((drink) => ({
    name: String(drink?.name ?? ""),
    icon: String(drink?.icon ?? ""),
    intervalMinutes: drink?.intervalMinutes,
    askDoseSize: Boolean(drink?.askDoseSize),
  }));
}

// Falha fechada: o que chega da nuvem não é confiável só por estar na nossa coleção. Cada
// bebida ainda passa pela validação de importação do app antes de qualquer prévia.
export function readDrinkCopy(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.fromUid !== "string" || !raw.fromUid || !Array.isArray(raw.drinks)) return null;
  if (raw.formatVersion !== DRINK_COPY_FORMAT_VERSION) return null;
  const expiresAtMs = millis(raw.expiresAt);
  if (!finite(expiresAtMs)) return null;
  return { fromUid: raw.fromUid, drinks: raw.drinks, expiresAtMs };
}

export function createDrinkCopies({
  app, uid, importModule, onIncomingChange, onStatusChange,
  now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout,
  // Quanto esperar a confirmação do servidor ao enviar.
  ackWaitMs = 6000,
}) {
  let stopped = false;
  let pairings = [];
  // fromUid -> sentAtMs da cópia já importada ou dispensada. Fica em users/{uid}/meta, para
  // os outros aparelhos da mesma conta também não mostrarem de novo. Carregado só quando
  // aparece a primeira cópia recebida.
  let handled = null;
  let loadingHandled = null;
  // Para quem eu tinha uma cópia válida, do último retrato dos pareamentos: se a amizade
  // some (desfeita por qualquer um dos dois), a cópia vai junto.
  let sentTo = new Set();
  const clearing = new Set();

  const load = () => loadFirestore({ app, importModule });
  const report = (error) => onStatusChange?.({ state: "error", error });
  const copyRef = (firestore, db, fromUid, toUid) => firestore.doc(db, "drinkCopies", `${fromUid}_${toUid}`);
  const pairRef = (firestore, db, otherUid) => firestore.doc(db, "pairings", buildPairId(uid, otherUid));
  const handledRef = (firestore, db) => firestore.doc(db, "users", uid, "meta", "drinkCopies");
  const valid = (sentAtMs) => finite(sentAtMs) && sentAtMs + DRINK_COPY_TTL_MS > now();

  // Offline, o SDK só resolve uma escrita quando o servidor confirma. A escrita continua na
  // fila e segue sozinha; `null` diz a quem chamou que ela ainda não foi confirmada.
  function withinAck(promessa) {
    return new Promise((resolve) => {
      const timer = schedule(() => resolve(null), ackWaitMs);
      promessa.then((valor) => { cancel(timer); resolve(valor); });
    });
  }

  function incoming() {
    if (!handled) return [];
    return pairings
      .filter((par) => valid(par.drinkCopyFromOther) && !(handled.get(par.otherUid) >= par.drinkCopyFromOther))
      .map((par) => ({
        fromUid: par.otherUid,
        sentAtMs: par.drinkCopyFromOther,
        expiresAtMs: par.drinkCopyFromOther + DRINK_COPY_TTL_MS,
      }));
  }

  // Só avisa quando a lista muda: `sweep` roda a cada minuto, e cada aviso redesenha a tela
  // de amigos (inclusive o detalhe aberto, que perderia o foco à toa).
  let lastEmitted = null;
  function emit() {
    if (stopped) return;
    const lista = incoming();
    const chave = JSON.stringify(lista);
    if (chave === lastEmitted) return;
    lastEmitted = chave;
    onIncomingChange?.(lista);
  }

  async function ensureHandled() {
    if (handled) return handled;
    loadingHandled ??= (async () => {
      const { firestore, db } = await load();
      const snapshot = await firestore.getDoc(handledRef(firestore, db));
      const saved = snapshot.exists() ? (snapshot.data()?.handled || {}) : {};
      handled = new Map(Object.entries(saved).filter(([, at]) => finite(at)));
      return handled;
    })().finally(() => { loadingHandled = null; });
    return loadingHandled;
  }

  // ---- Quem envia -----------------------------------------------------------

  // Um lote por amigo: cada cópia prova a própria amizade nas regras, e uma amizade desfeita
  // no meio do caminho não derruba os outros envios.
  async function send({ toUids, drinks }) {
    const payload = buildDrinkCopyPayload(drinks);
    if (!payload.length) throw new Error("Sem bebidas para copiar.");

    const { firestore, db } = await load();
    const sentAtMs = now();
    const expiresAt = firestore.Timestamp.fromMillis(sentAtMs + DRINK_COPY_TTL_MS);
    const alvos = [...new Set(toUids)].filter((toUid) => typeof toUid === "string" && toUid && toUid !== uid);

    const envios = alvos.map((toUid) => {
      const batch = firestore.writeBatch(db);
      // Mesmo id a cada envio: enviar de novo substitui a cópia anterior.
      batch.set(copyRef(firestore, db, uid, toUid), {
        fromUid: uid, toUid, drinks: payload, drinkCount: payload.length,
        formatVersion: DRINK_COPY_FORMAT_VERSION, createdAt: firestore.serverTimestamp(), expiresAt,
      });
      batch.update(pairRef(firestore, db, toUid), { [`drinkCopies.${uid}`]: sentAtMs });
      return batch.commit();
    });

    const resultados = await withinAck(Promise.allSettled(envios));
    if (!resultados) return { sentAtMs, state: "queued", failed: [] };
    const failed = alvos.filter((_, index) => resultados[index].status === "rejected");
    for (const [index, resultado] of resultados.entries()) {
      if (resultado.status === "rejected") report(resultado.reason);
      else sentTo.add(alvos[index]);
    }
    return { sentAtMs, state: "ack", failed };
  }

  // Cópia vencida: o servidor já não deixa ninguém ler; apagar e zerar o ponteiro é higiene,
  // e é a única limpeza sob nosso controle — o plano gratuito não tem Cloud Functions.
  async function clearExpiredPointers() {
    const vencidos = pairings.filter((par) => finite(par.drinkCopyFromMe) && !valid(par.drinkCopyFromMe) && !clearing.has(par.otherUid));
    if (!vencidos.length) return;
    const { firestore, db } = await load();
    for (const par of vencidos) {
      clearing.add(par.otherUid);
      await firestore.deleteDoc(copyRef(firestore, db, uid, par.otherUid)).catch(() => { /* já apagada por quem recebeu */ });
      await firestore.updateDoc(pairRef(firestore, db, par.otherUid), { [`drinkCopies.${uid}`]: null })
        .catch(() => { /* o pareamento pode já ter sido desfeito */ })
        .finally(() => clearing.delete(par.otherUid));
    }
  }

  // A regra de leitura de quem recebe não depende do pareamento continuar existindo: sem
  // isto, uma amizade desfeita deixaria a cópia legível até vencer.
  async function dropCopiesOfFormerFriends(atuais) {
    const ex = [...sentTo].filter((otherUid) => !atuais.has(otherUid));
    if (!ex.length) return;
    const { firestore, db } = await load();
    for (const otherUid of ex) {
      sentTo.delete(otherUid);
      await firestore.deleteDoc(copyRef(firestore, db, uid, otherUid)).catch(() => { /* já não existia */ });
    }
  }

  async function cleanupExpired() {
    const { firestore, db } = await load();
    const mine = await firestore.getDocs(firestore.query(
      firestore.collection(db, "drinkCopies"),
      firestore.where("fromUid", "==", uid)
    ));
    const limit = now();
    for (const entry of mine.docs) {
      const expiresAtMs = millis(entry.data()?.expiresAt);
      if (finite(expiresAtMs) && expiresAtMs > limit) continue;
      await firestore.deleteDoc(entry.ref).catch(report);
    }
  }

  // ---- Quem recebe ----------------------------------------------------------

  // A lista de pareamentos já carrega os dois ponteiros (`drinkCopyFromOther`/`FromMe`):
  // nenhuma escuta nova.
  function setPairings(lista) {
    pairings = Array.isArray(lista) ? lista : [];
    const atuais = new Set(pairings.map((par) => par.otherUid));
    dropCopiesOfFormerFriends(atuais).catch(report);
    sentTo = new Set(pairings.filter((par) => valid(par.drinkCopyFromMe)).map((par) => par.otherUid));

    if (pairings.some((par) => valid(par.drinkCopyFromOther))) ensureHandled().then(emit, report);
    else emit();
    clearExpiredPointers().catch(report);
  }

  // Chamado a cada minuto pelo app: uma cópia recebida que venceu sai da lista sem esperar
  // mudança no pareamento.
  function sweep() {
    emit();
    clearExpiredPointers().catch(report);
  }

  // Um `get` só, ao tocar em "Receber". A regra lê `resource.data`, então cópia vencida,
  // apagada ou inexistente é negada (o SDK rejeita, não devolve vazio): tudo isso é o mesmo
  // "não está mais disponível" para quem recebe. Sem conexão é outra coisa, e diz isso.
  async function fetchIncoming(fromUid) {
    const { firestore, db } = await load();
    let snapshot;
    try {
      snapshot = await firestore.getDoc(copyRef(firestore, db, fromUid, uid));
    } catch (error) {
      return { ok: false, reason: error?.code === "unavailable" ? "offline" : "gone" };
    }
    if (!snapshot.exists()) return { ok: false, reason: "gone" };
    const copy = readDrinkCopy(snapshot.data());
    if (!copy || copy.fromUid !== fromUid || copy.expiresAtMs <= now()) return { ok: false, reason: "gone" };
    return { ok: true, drinks: copy.drinks, expiresAtMs: copy.expiresAtMs };
  }

  // Importada ou dispensada: não aparece mais, aqui nem nos outros aparelhos da conta, e a
  // cópia sai do servidor na hora em vez de esperar vencer.
  async function markHandled(fromUid, sentAtMs) {
    const mapa = await ensureHandled().catch(() => (handled ??= new Map()));
    mapa.set(fromUid, sentAtMs);
    emit();

    const { firestore, db } = await load();
    // Só o que ainda pode reaparecer: um registro vencido não casa com ponteiro válido nenhum.
    const salvar = Object.fromEntries([...mapa].filter(([, at]) => valid(at)));
    await Promise.all([
      firestore.setDoc(handledRef(firestore, db), { handled: salvar }).catch(report),
      firestore.deleteDoc(copyRef(firestore, db, fromUid, uid)).catch(() => { /* já apagada ou vencida */ }),
    ]);
  }

  // "Apagar dados na nuvem": as cópias que enviei e o registro do que recebi. Os ponteiros
  // moram nos pareamentos, que essa mesma ação apaga logo depois.
  async function deleteAllMyData() {
    const { firestore, db } = await load();
    const mine = await firestore.getDocs(firestore.query(
      firestore.collection(db, "drinkCopies"),
      firestore.where("fromUid", "==", uid)
    ));
    for (const entry of mine.docs) await firestore.deleteDoc(entry.ref).catch(report);
    await firestore.deleteDoc(handledRef(firestore, db)).catch(() => {});
    sentTo = new Set();
    handled = new Map();
    emit();
  }

  async function start() {
    stopped = false;
    await cleanupExpired().catch(report);
  }

  function stop() {
    stopped = true;
    pairings = [];
    handled = null;
    loadingHandled = null;
    lastEmitted = null;
    sentTo = new Set();
    clearing.clear();
  }

  return { start, stop, send, setPairings, sweep, fetchIncoming, markHandled, deleteAllMyData };
}
