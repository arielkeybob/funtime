import { loadFirestore } from "./firestore-db.js";
import { readSharePayload } from "./share-payload.js";

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
  const unsubscribers = new Map(); // ownerUid -> cancelar
  const attachedShareId = new Map(); // ownerUid -> shareId em escuta agora
  const entries = new Map(); // ownerUid -> retrato mais recente

  function load() {
    return loadFirestore({ app, importModule });
  }

  function report(error) {
    onStatusChange?.({ state: "error", error });
  }

  function emit() {
    onChange?.([...entries.values()]);
  }

  function detach(ownerUid) {
    unsubscribers.get(ownerUid)?.();
    unsubscribers.delete(ownerUid);
    attachedShareId.delete(ownerUid);
    if (entries.delete(ownerUid)) emit();
  }

  async function attach(ownerUid, shareId) {
    const { firestore, db } = await load();
    if (stopped) return;

    const unsubscribe = firestore.onSnapshot(
      firestore.doc(db, "shares", shareId),
      (snapshot) => {
        if (stopped) return;

        if (!snapshot.exists()) { entries.delete(ownerUid); emit(); return; }

        const resultado = readSharePayload(snapshot.data(), now());
        if (!resultado.ok) { entries.delete(ownerUid); emit(); return; }

        entries.set(ownerUid, {
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
        entries.delete(ownerUid);
        emit();
        if (error?.code !== "permission-denied") report(error);
      }
    );

    unsubscribers.set(ownerUid, unsubscribe);
  }

  // `sources` é a lista de pareamentos, na mesma forma que share-writer.js produz
  // (precisa só de `otherUid` e `sharedWithMe`). Reconecta quando o ponteiro muda,
  // desliga quando some — sem nunca escrever nada em lugar nenhum.
  function setSources(sources) {
    const desejado = new Map((Array.isArray(sources) ? sources : [])
      .filter((par) => par.sharedWithMe)
      .map((par) => [par.otherUid, par.sharedWithMe]));

    for (const ownerUid of [...attachedShareId.keys()]) {
      if (attachedShareId.get(ownerUid) !== desejado.get(ownerUid)) detach(ownerUid);
    }

    for (const [ownerUid, shareId] of desejado) {
      if (attachedShareId.get(ownerUid) !== shareId) {
        attachedShareId.set(ownerUid, shareId);
        attach(ownerUid, shareId);
      }
    }
  }

  function start() {
    stopped = false;
  }

  function stop() {
    stopped = true;
    for (const ownerUid of [...unsubscribers.keys()]) detach(ownerUid);
  }

  return { start, stop, setSources };
}
