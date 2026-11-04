// Lógica pura da sincronização: o que mudou desde o último envio e como combinar o
// que veio de outro aparelho com o que existe aqui. Sem rede, sem DOM, sem Firestore.

export function stableJson(value) {
  return JSON.stringify(value, (key, entry) => (
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.keys(entry).sort().map((name) => [name, entry[name]]))
      : entry
  ));
}

function indexById(list) {
  return new Map((Array.isArray(list) ? list : []).filter((record) => record?.id).map((record) => [String(record.id), record]));
}

function idsOf(list) {
  return (Array.isArray(list) ? list : []).map((record) => String(record?.id));
}

const COLLECTION_NAMES = ["drinks", "events", "occasions"];

function diffCollection(previousList, nextList) {
  const previousById = indexById(previousList);
  const nextById = indexById(nextList);
  const upserted = [];
  const removed = [];

  for (const [id, record] of nextById) {
    const before = previousById.get(id);
    // Registro intocado costuma ser o mesmo objeto: dispensa serializar o histórico inteiro.
    if (!before || (before !== record && stableJson(before) !== stableJson(record))) upserted.push(record);
  }

  for (const id of previousById.keys()) {
    if (!nextById.has(id)) removed.push(id);
  }

  return { upserted, removed };
}

export function diffAppData(previous, next) {
  return {
    drinks: diffCollection(previous?.drinks, next?.drinks),
    events: diffCollection(previous?.events, next?.events),
    occasions: diffCollection(previous?.occasions, next?.occasions),
    // A ordem das bebidas é definida pelo usuário (arrastar para reordenar) e viaja
    // no documento de meta, porque coleção do Firestore não preserva ordem.
    metaChanged: stableJson(previous?.preferences) !== stableJson(next?.preferences)
      || stableJson(idsOf(previous?.drinks)) !== stableJson(idsOf(next?.drinks)),
  };
}

export function isEmptyDiff(diff) {
  if (!diff || diff.metaChanged) return false;
  return COLLECTION_NAMES.every((name) => (
    !diff[name]?.upserted?.length && !diff[name]?.removed?.length
  ));
}

// O que mudou neste aparelho e ainda não foi entregue ao Firestore. Um retrato da nuvem
// não conhece essas mudanças, então elas vencem ao combinar. Por coleção, id → versão
// anterior do registro (nas exclusões, diz se era histórico antigo); `meta` marca mudança
// nas preferências ou na lista/ordem das bebidas.
export function emptyTouched() {
  return { drinks: new Map(), events: new Map(), occasions: new Map(), meta: false };
}

export function noteTouched(touched, previous, next) {
  const diff = diffAppData(previous, next);
  for (const name of COLLECTION_NAMES) {
    const before = indexById(previous?.[name]);
    const ids = [...diff[name].upserted.map((record) => String(record.id)), ...diff[name].removed];
    for (const id of ids) if (!touched[name].has(id)) touched[name].set(id, before.get(id) ?? null);
  }
  if (diff.metaChanged) touched.meta = true;
  return touched;
}

export function mergeTouched(into, from) {
  for (const name of COLLECTION_NAMES) {
    for (const [id, record] of from[name]) if (!into[name].has(id)) into[name].set(id, record);
  }
  into.meta = into.meta || from.meta;
  return into;
}

// Janela de sincronização (docs/specs/0024): o aparelho só escuta na nuvem o histórico
// recente. Um registro mais antigo que a janela NÃO estar no remoto não diz nada — ele
// simplesmente não foi consultado —, então nunca é tratado como exclusão nem reenviado.
export const OCCASION_WINDOW_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

// `windowStart` nulo é o modo de sempre: a coleção inteira é escutada e nada é "antigo".
// Eventos agendados que ainda não começaram (`startedAt` nulo) nunca são antigos; a
// margem cobre um evento que começou antes do corte mas ainda contém doses dentro dele.
export function isOutsideWindow(name, record, windowStart) {
  if (windowStart == null) return false;
  if (name === "events") return Number(record?.consumedAt) < windowStart;
  if (name === "occasions") return record?.startedAt != null && record.startedAt < windowStart - OCCASION_WINDOW_MARGIN_MS;
  return false;
}

function mergeCollection(localList, remoteList, pushedList, isOld = () => false, touched = new Map()) {
  const remoteById = indexById(remoteList);
  const pushedIds = new Set(idsOf(pushedList));
  const merged = [];
  const taken = new Set();

  for (const record of Array.isArray(localList) ? localList : []) {
    const id = String(record?.id);
    if (touched.has(id)) {
      // Mudou aqui e a nuvem ainda não sabe: vale a versão daqui.
      merged.push(record);
      taken.add(id);
    } else if (remoteById.has(id)) {
      merged.push(remoteById.get(id));
      taken.add(id);
    } else if (!pushedIds.has(id) || isOld(record)) {
      // Criado neste aparelho e ainda não enviado: manter. Se já tivesse sido
      // enviado e sumisse do remoto, seria exclusão feita em outro aparelho — a menos
      // que seja mais antigo que a janela, que o remoto nem chega a mostrar.
      merged.push(record);
      taken.add(id);
    }
  }

  for (const record of Array.isArray(remoteList) ? remoteList : []) {
    const id = String(record?.id);
    // Mudado aqui e ausente daqui é exclusão daqui que a nuvem ainda não recebeu.
    if (!taken.has(id) && !touched.has(id)) merged.push(record);
  }

  return merged;
}

function sortByOrder(records, order) {
  if (!Array.isArray(order) || !order.length) return records;
  const rank = new Map(order.map((id, index) => [String(id), index]));
  return [...records].sort((first, second) => (
    (rank.has(String(first.id)) ? rank.get(String(first.id)) : Number.MAX_SAFE_INTEGER)
    - (rank.has(String(second.id)) ? rank.get(String(second.id)) : Number.MAX_SAFE_INTEGER)
  ));
}

export function mergeRemote({ local, remote, lastPushed, windowStart = null, touched = null }) {
  const older = (name) => (record) => isOutsideWindow(name, record, windowStart);
  const changed = touched || emptyTouched();
  const drinks = mergeCollection(local?.drinks, remote?.drinks, lastPushed?.drinks, undefined, changed.drinks);
  return {
    // Ordem ou preferências mudadas aqui e ainda não enviadas valem sobre as da nuvem.
    drinks: changed.meta ? drinks : sortByOrder(drinks, remote?.drinkOrder),
    events: mergeCollection(local?.events, remote?.events, lastPushed?.events, older("events"), changed.events),
    occasions: mergeCollection(local?.occasions, remote?.occasions, lastPushed?.occasions, older("occasions"), changed.occasions),
    preferences: changed.meta ? local?.preferences : (remote?.preferences ?? local?.preferences),
  };
}

// O que o servidor já conhece, para o próximo envio mandar só o que mudou. Sem janela é
// exatamente o remoto. Com janela o remoto só traz o recente, então o que é mais antigo
// e existe aqui entra como "já enviado" — senão cada abertura reescreveria o histórico
// inteiro, trocando leituras poupadas por escritas.
export function syncedBaseline({ merged, remote, windowStart = null, touched = null }) {
  const changed = touched || emptyTouched();
  const withOlder = (name) => {
    const remoteList = Array.isArray(remote?.[name]) ? remote[name] : [];
    if (windowStart == null) return remoteList;

    const known = new Set(idsOf(remoteList));
    const present = new Set(idsOf(merged?.[name]));
    // Antigo e mudado aqui fica fora da base, para o envio levar a mudança.
    const older = (merged?.[name] || []).filter((record) => (
      record?.id && !known.has(String(record.id)) && !changed[name].has(String(record.id))
      && isOutsideWindow(name, record, windowStart)
    ));
    // Antigo e apagado aqui: a janela não o mostra, então entra na base para a exclusão subir.
    const removedOlder = [...changed[name]]
      .filter(([id, before]) => before && !known.has(id) && !present.has(id) && isOutsideWindow(name, before, windowStart))
      .map(([, before]) => before);
    const extra = [...older, ...removedOlder];
    return extra.length ? [...remoteList, ...extra] : remoteList;
  };

  return {
    // Na ordem que a pessoa definiu (`drinkOrder`), não na dos documentos: o Firestore
    // devolve por id. Comparada com a ordem do aparelho, a ordem dos ids parecia sempre
    // "mudou", `metaChanged` ficava verdadeiro, o meta era regravado, o eco da própria
    // gravação reiniciava tudo — cerca de uma escrita por segundo com o app aberto.
    drinks: sortByOrder(remote?.drinks ?? [], remote?.drinkOrder),
    events: withOlder("events"),
    occasions: withOlder("occasions"),
    preferences: remote?.preferences ?? null,
  };
}
