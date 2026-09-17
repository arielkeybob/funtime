// Lógica pura da sincronização: o que mudou desde o último envio e como combinar o
// que veio de outro aparelho com o que existe aqui. Sem rede, sem DOM, sem Firestore.

function stableJson(value) {
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

function mergeCollection(localList, remoteList, pushedList) {
  const remoteById = indexById(remoteList);
  const pushedIds = new Set(idsOf(pushedList));
  const merged = [];
  const taken = new Set();

  for (const record of Array.isArray(localList) ? localList : []) {
    const id = String(record?.id);
    if (remoteById.has(id)) {
      merged.push(remoteById.get(id));
      taken.add(id);
    } else if (!pushedIds.has(id)) {
      // Criado neste aparelho e ainda não enviado: manter. Se já tivesse sido
      // enviado e sumisse do remoto, seria exclusão feita em outro aparelho.
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

export function mergeRemote({ local, remote, lastPushed }) {
  return {
    drinks: sortByOrder(mergeCollection(local?.drinks, remote?.drinks, lastPushed?.drinks), remote?.drinkOrder),
    events: mergeCollection(local?.events, remote?.events, lastPushed?.events),
    occasions: mergeCollection(local?.occasions, remote?.occasions, lastPushed?.occasions),
    preferences: remote?.preferences ?? local?.preferences,
  };
}
