import {
  diffAppData, emptyTouched, isEmptyDiff, mergeRemote, mergeTouched, noteTouched, syncedBaseline, OCCASION_WINDOW_MARGIN_MS,
} from "./sync-merge.js";
import { BATCH_LIMIT, chunk, loadFirestore } from "./firestore-db.js";

const PUSH_DEBOUNCE_MS = 800;
const DAY_MS = 24 * 60 * 60 * 1000;
const COLLECTIONS = ["drinks", "events", "occasions"];
// Cada escuta alimenta uma coleção; as ocasiões têm duas com janela (recentes e agendadas).
const COLLECTION_OF = { drinks: "drinks", events: "events", occasions: "occasions", "occasions-pending": "occasions" };

// `windowDays` (docs/specs/0024): escutar só o histórico recente, em vez da coleção inteira
// a cada abertura — o Firestore cobra uma leitura por documento. Sem ele, escuta tudo,
// como antes. `fullSync` guarda, fora deste módulo, se este aparelho já baixou o histórico
// completo (`isDone`/`markDone`); sem esse download único, a janela esconderia o passado.
export function createFirestoreSync({
  app, uid, account, onRemoteUpdate, onStatusChange,
  windowDays = null, fullSync = null, now = () => Date.now(),
  importModule = (url) => import(url),
  schedule = setTimeout, cancel = clearTimeout,
}) {
  let latest = null;
  let lastPushed = null;
  // Antes do primeiro retrato completo da nuvem, `lastPushed` é só o ponto de partida dos
  // envios deste aparelho, não o que a nuvem tem: doses feitas sem conexão antes de a
  // sincronização começar nunca subiram. Tomá-las por enviadas fazia o primeiro retrato
  // apagá-las como se fossem exclusão feita em outro aparelho.
  let synced = false;
  // O que mudou aqui e ainda não foi entregue ao Firestore; vence qualquer retrato.
  let touched = emptyTouched();
  // Conta as bases calculadas a partir de retratos: um envio que termina depois de uma
  // delas não pode trocá-la pelo que tinha antes.
  let generation = 0;
  let timer = null;
  let stopped = false;
  let windowStart = null;
  let expectedSeeds = COLLECTIONS.length + 1;
  let backfillStarted = false;
  let needsBackfill = false;
  const unsubscribers = [];
  const seeded = new Set();
  const parts = new Map();
  const remote = { drinks: [], events: [], occasions: [], preferences: null, drinkOrder: null };

  function load() {
    return loadFirestore({ app, importModule });
  }

  function report(error) {
    onStatusChange?.({ state: "error", error });
  }

  function collectRemote(name) {
    const byId = new Map();
    for (const [key, records] of parts) {
      if (COLLECTION_OF[key] !== name) continue;
      for (const record of records) byId.set(String(record.id), record);
    }
    return [...byId.values()];
  }

  function emitRemote() {
    // Espera o primeiro retrato de todas as escutas e do meta antes de aplicar, senão a
    // interface pisca com um conjunto pela metade.
    if (stopped || seeded.size < expectedSeeds) return;

    // No primeiro retrato é união: o que só existe aqui fica e sobe.
    const merged = mergeRemote({ local: latest, remote, lastPushed: synced ? lastPushed : null, windowStart, touched });
    latest = merged;
    // A partir daqui o servidor já conhece tudo que está em `remote`; só o que existe
    // apenas neste aparelho precisa subir (caso do primeiro login).
    lastPushed = syncedBaseline({ merged, remote, windowStart, touched });
    synced = true;
    generation += 1;
    onRemoteUpdate(merged);
    scheduleFlush();
    backfillHistory().catch(report);
  }

  // Uma vez por aparelho e conta: baixa do servidor o histórico que a janela deixa de fora
  // e une com o que há aqui (sobe o que só existe neste aparelho, traz o que só existe na
  // nuvem). É o que faz um aparelho novo ter o histórico todo sem "carregar mais" e o que
  // impede a janela de esconder dados que nunca subiram. Só depois disso a janela vale.
  // Falhou (sem internet)? Não marca como feito e tenta de novo na próxima abertura.
  async function backfillHistory() {
    if (!needsBackfill || backfillStarted) return;
    backfillStarted = true;

    const { firestore, db } = await load();
    const [events, occasions] = await Promise.all(["events", "occasions"].map((name) => (
      firestore.getDocsFromServer(firestore.collection(db, "users", uid, name))
    )));
    if (stopped) return;

    const full = {
      ...remote,
      events: events.docs.map((entry) => entry.data()),
      occasions: occasions.docs.map((entry) => entry.data()),
    };
    // Sem `lastPushed`: união pura, nenhum lado é descartado (mesma regra do primeiro
    // login). Um registro antigo só daqui não pode ser tomado por exclusão em outro lugar.
    const merged = mergeRemote({ local: latest, remote: full, lastPushed: null, touched });
    latest = merged;
    lastPushed = syncedBaseline({ merged, remote: full, touched });
    generation += 1;
    onRemoteUpdate(merged);

    await flush();
    if (!stopped) fullSync.markDone();
  }

  function scheduleFlush() {
    if (stopped) return;
    if (timer) cancel(timer);
    timer = schedule(() => { timer = null; flush().catch(report); }, PUSH_DEBOUNCE_MS);
  }

  function scheduleSyncPush(previous, next) {
    noteTouched(touched, previous, next);
    if (lastPushed === null) lastPushed = previous;
    latest = next;
    scheduleFlush();
  }

  async function flush() {
    if (timer) { cancel(timer); timer = null; }
    // Sem ponto de partida (nenhuma mudança e nenhum retrato ainda), comparar com nada
    // subiria o histórico inteiro; o primeiro retrato agenda o envio.
    if (stopped || !latest || lastPushed === null) return;

    const { firestore, db } = await load();
    if (stopped) return;
    const diff = diffAppData(lastPushed, latest);
    if (isEmptyDiff(diff)) {
      // Nada pendente: o que foi mudado aqui já é o que a nuvem tem.
      touched = emptyTouched();
      return;
    }

    const pushing = latest;
    const startedAt = generation;
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

    const batches = chunk(writes, BATCH_LIMIT).map((group) => {
      const batch = firestore.writeBatch(db);
      for (const apply of group) apply(batch);
      return batch;
    });
    // Entregue ao Firestore, a mudança já aparece nos retratos (ele aplica a própria fila
    // antes de o servidor confirmar) e deixa de precisar vencer. Todos os lotes são
    // entregues de uma vez por isso. Se a gravação falhar, as mudanças voltam a valer.
    const sent = touched;
    touched = emptyTouched();
    try {
      await Promise.all(batches.map((batch) => batch.commit()));
    } catch (error) {
      touched = mergeTouched(touched, sent);
      throw error;
    }

    if (generation === startedAt) lastPushed = pushing;
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
    backfillStarted = false;

    const { firestore, db } = await load();
    // Identificar a conta é secundário: falhar aqui não pode impedir a sincronização.
    await recordAccount(firestore, db).catch(report);

    // Com janela só vale depois do download completo; antes disso não há o que esconder
    // de ninguém, e a escuta recente segue funcionando enquanto o histórico não chega.
    windowStart = windowDays ? now() - windowDays * DAY_MS : null;
    needsBackfill = windowStart !== null && Boolean(fullSync) && !fullSync.isDone();

    const collectionRef = (name) => firestore.collection(db, "users", uid, name);
    const listen = (key, target) => {
      unsubscribers.push(firestore.onSnapshot(target, (snapshot) => {
        parts.set(key, snapshot.docs.map((entry) => entry.data()));
        remote[COLLECTION_OF[key]] = collectRemote(COLLECTION_OF[key]);
        seeded.add(key);
        emitRemote();
      }, report));
    };

    listen("drinks", collectionRef("drinks"));
    if (windowStart === null) {
      listen("events", collectionRef("events"));
      listen("occasions", collectionRef("occasions"));
      expectedSeeds = COLLECTIONS.length + 1;
    } else {
      // Consultas de um campo só: usam o índice automático, sem `firestore.indexes.json`.
      listen("events", firestore.query(collectionRef("events"), firestore.where("consumedAt", ">=", windowStart)));
      listen("occasions", firestore.query(
        collectionRef("occasions"), firestore.where("startedAt", ">=", windowStart - OCCASION_WINDOW_MARGIN_MS),
      ));
      // Agendado e ainda não iniciado não tem `startedAt` de data: a consulta acima o perderia.
      listen("occasions-pending", firestore.query(collectionRef("occasions"), firestore.where("startedAt", "==", null)));
      expectedSeeds = COLLECTIONS.length + 2;
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
    parts.clear();
    windowStart = null;
    needsBackfill = false;
    latest = null;
    lastPushed = null;
    synced = false;
    touched = emptyTouched();
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
