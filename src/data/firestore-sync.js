import { diffAppData, isEmptyDiff, mergeRemote } from "./sync-merge.js";

const SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0";
const PUSH_DEBOUNCE_MS = 800;
const BATCH_LIMIT = 450; // o Firestore aceita 500 operações por lote; sobra folga.
const COLLECTIONS = ["drinks", "events", "occasions"];

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function createFirestoreSync({
  app, uid, account, onRemoteUpdate, onStatusChange,
  importModule = (url) => import(url),
  schedule = setTimeout, cancel = clearTimeout,
}) {
  let ready = null;
  let latest = null;
  let lastPushed = null;
  let timer = null;
  let stopped = false;
  const unsubscribers = [];
  const seeded = new Set();
  const remote = { drinks: [], events: [], occasions: [], preferences: null, drinkOrder: null };

  // Cache persistente para a fila de escritas sobreviver ao fechamento do app: sem
  // ele, uma exclusão feita offline se perderia e o registro voltaria da nuvem na
  // próxima sincronização. Navegação privada e armazenamento bloqueado fazem isso
  // falhar — aí sincroniza sem fila persistente, que é melhor do que não sincronizar.
  function openDatabase(firestore) {
    try {
      return firestore.initializeFirestore(app, {
        localCache: firestore.persistentLocalCache({ tabManager: firestore.persistentMultipleTabManager() }),
      });
    } catch {
      return firestore.getFirestore(app);
    }
  }

  function load() {
    if (!ready) {
      ready = (async () => {
        const firestore = await importModule(`${SDK_BASE}/firebase-firestore.js`);
        return { firestore, db: openDatabase(firestore) };
      })();
    }

    return ready;
  }

  function report(error) {
    onStatusChange?.({ state: "error", error });
  }

  function emitRemote() {
    // Espera o primeiro retrato das três coleções e do meta antes de aplicar, senão a
    // interface pisca com um conjunto pela metade.
    if (stopped || seeded.size < COLLECTIONS.length + 1) return;

    const merged = mergeRemote({ local: latest, remote, lastPushed });
    latest = merged;
    // A partir daqui o servidor já conhece tudo que está em `remote`; só o que existe
    // apenas neste aparelho precisa subir (caso do primeiro login).
    lastPushed = {
      drinks: remote.drinks, events: remote.events,
      occasions: remote.occasions, preferences: remote.preferences,
    };
    onRemoteUpdate(merged);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (stopped) return;
    if (timer) cancel(timer);
    timer = schedule(() => { timer = null; flush().catch(report); }, PUSH_DEBOUNCE_MS);
  }

  function scheduleSyncPush(previous, next) {
    if (lastPushed === null) lastPushed = previous;
    latest = next;
    scheduleFlush();
  }

  async function flush() {
    if (timer) { cancel(timer); timer = null; }
    if (stopped || !latest) return;

    const diff = diffAppData(lastPushed, latest);
    if (isEmptyDiff(diff)) return;

    const pushing = latest;
    const { firestore, db } = await load();
    const writes = [];

    for (const name of COLLECTIONS) {
      for (const record of diff[name].upserted) {
        const ref = firestore.doc(db, "users", uid, name, String(record.id));
        writes.push((batch) => batch.set(ref, record));
      }
      for (const id of diff[name].removed) {
        const ref = firestore.doc(db, "users", uid, name, String(id));
        writes.push((batch) => batch.delete(ref));
      }
    }

    if (diff.metaChanged) {
      const ref = firestore.doc(db, "users", uid, "meta", "app");
      const meta = {
        preferences: pushing.preferences ?? null,
        drinkOrder: (pushing.drinks || []).map((drink) => String(drink.id)),
        syncedAt: firestore.serverTimestamp(),
      };
      writes.push((batch) => batch.set(ref, meta));
    }

    for (const group of chunk(writes, BATCH_LIMIT)) {
      const batch = firestore.writeBatch(db);
      for (const apply of group) apply(batch);
      await batch.commit();
    }

    lastPushed = pushing;
    onStatusChange?.({ state: "synced", lastSyncedAt: Date.now() });
  }

  // Identidade da conta num documento à parte, fora do fluxo de dados do app: serve
  // para reconhecer de quem é cada `uid` no console. Gravado com `merge` de propósito,
  // para anotações feitas à mão ali (um apelido, por exemplo) não serem apagadas.
  // Roda a cada abertura, então contas conectadas antes disto também são preenchidas.
  async function recordAccount(firestore, db) {
    if (!account) return;

    await firestore.setDoc(firestore.doc(db, "users", uid, "meta", "account"), {
      email: account.email ?? null,
      displayName: account.displayName ?? null,
      updatedAt: firestore.serverTimestamp(),
    }, { merge: true });
  }

  async function start(localData) {
    latest = localData;
    stopped = false;

    const { firestore, db } = await load();
    // Identificar a conta é secundário: falhar aqui não pode impedir a sincronização.
    await recordAccount(firestore, db).catch(report);

    for (const name of COLLECTIONS) {
      const reference = firestore.collection(db, "users", uid, name);
      unsubscribers.push(firestore.onSnapshot(reference, (snapshot) => {
        remote[name] = snapshot.docs.map((entry) => entry.data());
        seeded.add(name);
        emitRemote();
      }, report));
    }

    const metaReference = firestore.doc(db, "users", uid, "meta", "app");
    unsubscribers.push(firestore.onSnapshot(metaReference, (snapshot) => {
      const data = snapshot.data();
      remote.preferences = data?.preferences ?? null;
      remote.drinkOrder = data?.drinkOrder ?? null;
      seeded.add("meta");
      emitRemote();
    }, report));
  }

  function stop() {
    stopped = true;
    if (timer) { cancel(timer); timer = null; }
    while (unsubscribers.length) unsubscribers.pop()?.();
    seeded.clear();
    latest = null;
    lastPushed = null;
  }

  async function deleteCloudData() {
    const { firestore, db } = await load();
    // Para os listeners antes de apagar: um snapshot vazio chegando no meio da
    // exclusão faria o aparelho reenviar tudo que ainda tem localmente.
    stop();

    const references = [];
    for (const name of COLLECTIONS) {
      const snapshot = await firestore.getDocs(firestore.collection(db, "users", uid, name));
      for (const entry of snapshot.docs) references.push(entry.ref);
    }
    references.push(firestore.doc(db, "users", uid, "meta", "app"));

    for (const group of chunk(references, BATCH_LIMIT)) {
      const batch = firestore.writeBatch(db);
      for (const reference of group) batch.delete(reference);
      await batch.commit();
    }
  }

  return { start, stop, scheduleSyncPush, flushPendingWrites: flush, deleteCloudData };
}
