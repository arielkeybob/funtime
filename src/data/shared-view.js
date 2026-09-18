import { loadFirestore } from "./firestore-db.js";
import { readSharePayload } from "./share-payload.js";
import { pointerToList } from "./share-codes.js";

// Lado de quem recebe um compartilhamento. Só lê — nunca constrói `writeBatch`,
// `setDoc`, `updateDoc` nem `deleteDoc`. Ver docs/specs/0023.
//
// O convidado não tem `list` na coleção `shares` (regra deliberada, ver
// firestore.rules): o único jeito de descobrir um compartilhamento é o ponteiro
// `sharing[donoUid]` que o dono publica no próprio documento de pareamento, que o
// convidado já pode ler por ser um dos dois membros. `setSources` recebe a mesma
// lista de pareamentos que share-writer.js já produz.
export function createSharedView({ app, importModule, onChange, onStatusChange, now = () => Date.now() }) {
  let stopped = false;
  // Uma escuta por share (dono + shareId): a mesma pessoa pode ter mais de um evento
  // ao mesmo tempo — o novo ao vivo e o anterior ainda dentro das 24h.
  const unsubscribers = new Map(); // "dono:shareId" -> cancelar
  const owners = new Map(); // "dono:shareId" -> ownerUid
  const entries = new Map(); // "dono:shareId" -> retrato mais recente
  const keyOf = (ownerUid, shareId) => `${ownerUid}:${shareId}`;

  function load() {
    return loadFirestore({ app, importModule });
  }

  function report(error) {
    onStatusChange?.({ state: "error", error });
  }

  function emit() {
    onChange?.([...entries.values()]);
  }

  function detach(key) {
    unsubscribers.get(key)?.();
    unsubscribers.delete(key);
    owners.delete(key);
    if (entries.delete(key)) emit();
  }

  async function attach(ownerUid, shareId) {
    const key = keyOf(ownerUid, shareId);
    const { firestore, db } = await load();
    if (stopped || !owners.has(key)) return;

    const unsubscribe = firestore.onSnapshot(
      firestore.doc(db, "shares", shareId),
      // Sem isto o callback só roda quando o DADO muda: a leitura vinda do cache ficaria
      // marcada como "do cache" para sempre, mesmo depois de o servidor confirmar o mesmo dado.
      { includeMetadataChanges: true },
      (snapshot) => {
        if (stopped) return;

        if (!snapshot.exists()) { entries.delete(key); emit(); return; }

        const resultado = readSharePayload(snapshot.data(), now());
        if (!resultado.ok) { entries.delete(key); emit(); return; }

        entries.set(key, {
          ownerUid, shareId,
          view: resultado.view,
          // Cache do SDK, não do aparelho: é isso que diferencia "a nuvem confirmou
          // este dado" de "isto é o que sobrou de antes, sem internet agora".
          fromCache: snapshot.metadata.fromCache,
          receivedAtMs: now(),
        });
        emit();
      },
      (error) => {
        // Negado é o caminho normal quando o compartilhamento acaba (documento
        // apagado ou vencido) — reflete no estado, não é erro para reportar.
        entries.delete(key);
        emit();
        if (error?.code !== "permission-denied") report(error);
      }
    );

    unsubscribers.set(key, unsubscribe);
  }

  // `sources` é a lista de pareamentos, na mesma forma que share-writer.js produz
  // (precisa só de `otherUid` e `sharedWithMe`). Reconecta quando o ponteiro muda,
  // desliga quando some — sem nunca escrever nada em lugar nenhum.
  function setSources(sources) {
    const desejado = new Map();
    for (const par of Array.isArray(sources) ? sources : []) {
      for (const shareId of pointerToList(par.sharedWithMe)) desejado.set(keyOf(par.otherUid, shareId), { ownerUid: par.otherUid, shareId });
    }

    for (const key of [...owners.keys()]) {
      if (!desejado.has(key)) detach(key);
    }

    for (const [key, { ownerUid, shareId }] of desejado) {
      if (!owners.has(key)) {
        owners.set(key, ownerUid);
        attach(ownerUid, shareId);
      }
    }
  }

  function start() {
    stopped = false;
  }

  function stop() {
    stopped = true;
    for (const key of [...owners.keys()]) detach(key);
  }

  return { start, stop, setSources };
}
