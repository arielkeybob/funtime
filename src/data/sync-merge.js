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

function diffCollection(previousList, nextList) {
  const previousById = indexById(previousList);
  const nextById = indexById(nextList);
  const upserted = [];
  const removed = [];

  for (const [id, record] of nextById) {
    const before = previousById.get(id);
    if (!before || stableJson(before) !== stableJson(record)) upserted.push(record);
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
  return ["drinks", "events", "occasions"].every((name) => (
    !diff[name]?.upserted?.length && !diff[name]?.removed?.length
  ));
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

function mergeCollection(localList, remoteList, pushedList, isOld = () => false) {
  const remoteById = indexById(remoteList);
  const pushedIds = new Set(idsOf(pushedList));
  const merged = [];
  const taken = new Set();

  for (const record of Array.isArray(localList) ? localList : []) {
    const id = String(record?.id);
    if (remoteById.has(id)) {
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
    if (!taken.has(id)) merged.push(record);
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

export function mergeRemote({ local, remote, lastPushed, windowStart = null }) {
  const older = (name) => (record) => isOutsideWindow(name, record, windowStart);
  return {
    drinks: sortByOrder(mergeCollection(local?.drinks, remote?.drinks, lastPushed?.drinks), remote?.drinkOrder),
    events: mergeCollection(local?.events, remote?.events, lastPushed?.events, older("events")),
    occasions: mergeCollection(local?.occasions, remote?.occasions, lastPushed?.occasions, older("occasions")),
    preferences: remote?.preferences ?? local?.preferences,
  };
}

// O que o servidor já conhece, para o próximo envio mandar só o que mudou. Sem janela é
// exatamente o remoto. Com janela o remoto só traz o recente, então o que é mais antigo
// e existe aqui entra como "já enviado" — senão cada abertura reescreveria o histórico
// inteiro, trocando leituras poupadas por escritas.
export function syncedBaseline({ merged, remote, windowStart = null }) {
  const withOlder = (name) => {
    const remoteList = Array.isArray(remote?.[name]) ? remote[name] : [];
    if (windowStart == null) return remoteList;

    const known = new Set(idsOf(remoteList));
    const older = (merged?.[name] || []).filter((record) => (
      record?.id && !known.has(String(record.id)) && isOutsideWindow(name, record, windowStart)
    ));
    return older.length ? [...remoteList, ...older] : remoteList;
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
