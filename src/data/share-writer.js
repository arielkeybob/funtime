import { loadFirestore } from "./firestore-db.js";
import { buildPairId, generatePairingCode, otherUidOf } from "./share-codes.js";

export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

// Lado de quem convida e de quem compartilha. Escreve; o lado que só lê é
// src/data/shared-view.js. Ver docs/specs/0023.
export function createShareWriter({
  app, uid, importModule, onPairingsChange, onStatusChange,
  now = () => Date.now(), generateCode = generatePairingCode,
}) {
  let stopped = false;
  const unsubscribers = [];

  function load() {
    return loadFirestore({ app, importModule });
  }

  function report(error) {
    onStatusChange?.({ state: "error", error });
  }

  // O documento do par é o mesmo para os dois lados, calculado sem combinar nada.
  function pairingsOf(snapshot) {
    return snapshot.docs.map((entry) => {
      const data = entry.data();
      const other = otherUidOf(data.uids, uid);
      return {
        pairId: entry.id,
        otherUid: other,
        alias: data.aliases?.[other] ?? "",
        myAlias: data.aliases?.[uid] ?? "",
        acceptedByMe: (data.acceptedBy || []).includes(uid),
        acceptedByOther: (data.acceptedBy || []).includes(other),
        createdByMe: data.createdBy === uid,
        // Ponteiro publicado por quem compartilha: é assim que o outro lado
        // descobre o documento, sem precisar adivinhar nem varrer a coleção.
        sharedWithMe: data.sharing?.[other] ?? null,
        sharingWithOther: data.sharing?.[uid] ?? null,
      };
    });
  }

  async function createPairingCode() {
    const { firestore, db } = await load();
    const code = generateCode();
    const expiresAt = firestore.Timestamp.fromMillis(now() + PAIRING_CODE_TTL_MS);

    await firestore.setDoc(firestore.doc(db, "pairingCodes", code), {
      ownerUid: uid,
      createdAt: firestore.serverTimestamp(),
      expiresAt,
    });

    return { code, expiresAtMs: expiresAt.toMillis() };
  }

  async function cancelPairingCode(code) {
    const { firestore, db } = await load();
    await firestore.deleteDoc(firestore.doc(db, "pairingCodes", code));
  }

  // Quem digita o código é quem cria o pareamento — a posse do código é a prova que
  // a regra verifica. Aceitar é ato separado do outro lado.
  async function redeemPairingCode(code, myAlias) {
    const { firestore, db } = await load();
    const codeSnapshot = await firestore.getDoc(firestore.doc(db, "pairingCodes", code));

    if (!codeSnapshot.exists()) return { ok: false, reason: "not-found" };

    const ownerUid = codeSnapshot.data()?.ownerUid;
    if (!ownerUid) return { ok: false, reason: "not-found" };
    if (ownerUid === uid) return { ok: false, reason: "own-code" };

    const pairId = buildPairId(uid, ownerUid);
    const pairRef = firestore.doc(db, "pairings", pairId);

    // Já existir é normal: refazer o pareamento com alguém conhecido só reaceita.
    if ((await firestore.getDoc(pairRef)).exists()) {
      await acceptPairing(pairId, myAlias);
      return { ok: true, pairId, otherUid: ownerUid };
    }

    await firestore.setDoc(pairRef, {
      uids: [uid, ownerUid].sort(),
      createdBy: uid,
      createdAt: firestore.serverTimestamp(),
      viaCode: code,
      acceptedBy: [uid],
      aliases: { [uid]: String(myAlias ?? "") },
      sharing: {},
    });

    return { ok: true, pairId, otherUid: ownerUid };
  }

  async function acceptPairing(pairId, myAlias) {
    const { firestore, db } = await load();
    const patch = { acceptedBy: firestore.arrayUnion(uid) };
    if (myAlias !== undefined) patch[`aliases.${uid}`] = String(myAlias ?? "");

    await firestore.updateDoc(firestore.doc(db, "pairings", pairId), patch);
  }

  async function setAlias(pairId, myAlias) {
    const { firestore, db } = await load();
    await firestore.updateDoc(firestore.doc(db, "pairings", pairId), {
      [`aliases.${uid}`]: String(myAlias ?? ""),
    });
  }

  async function removePairing(pairId) {
    const { firestore, db } = await load();
    await firestore.deleteDoc(firestore.doc(db, "pairings", pairId));
  }

  // Os códigos vencidos já são ilegíveis pela regra; apagar é só higiene, e é a
  // única limpeza sob nosso controle — o plano gratuito não tem Cloud Functions.
  async function cleanupExpiredCodes() {
    const { firestore, db } = await load();
    const mine = await firestore.getDocs(firestore.query(
      firestore.collection(db, "pairingCodes"),
      firestore.where("ownerUid", "==", uid)
    ));

    const limit = now();
    for (const entry of mine.docs) {
      const expiresAt = entry.data()?.expiresAt;
      const expiresAtMs = typeof expiresAt?.toMillis === "function" ? expiresAt.toMillis() : 0;
      if (expiresAtMs <= limit) await firestore.deleteDoc(entry.ref).catch(report);
    }
  }

  async function start() {
    stopped = false;
    const { firestore, db } = await load();

    unsubscribers.push(firestore.onSnapshot(
      firestore.query(firestore.collection(db, "pairings"), firestore.where("uids", "array-contains", uid)),
      (snapshot) => { if (!stopped) onPairingsChange?.(pairingsOf(snapshot)); },
      report
    ));

    await cleanupExpiredCodes().catch(report);
  }

  function stop() {
    stopped = true;
    while (unsubscribers.length) unsubscribers.pop()?.();
  }

  return {
    start, stop,
    createPairingCode, cancelPairingCode, redeemPairingCode,
    acceptPairing, setAlias, removePairing,
  };
}
