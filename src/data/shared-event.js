import { loadFirestore } from "./firestore-db.js";
import { buildPairId, pointerToList } from "./share-codes.js";
import { stableJson } from "./sync-merge.js";

// Evento compartilhado entre amigos (docs/specs/0025). Uma ficha pequena e só de leitura
// para quem é convidado, em sharedEvents/{eventId}: nome, horário, quem foi convidado e
// quem confirmou. NÃO carrega dose nenhuma — quem vê as doses de quem continua sendo
// share-writer.js, decisão separada, por pessoa.
//
// Quem aceita ganha uma ocasião local normal (a cópia é feita pelo app, que tem `state`);
// este módulo só fala com a nuvem e nunca toca `state` nem `localStorage`.
//
// As duas pontas vivem aqui porque compartilham o mesmo documento: o organizador escreve
// a ficha e `invited`; cada convidado escreve só a própria presença em `going`.

const GRACE_MS = 24 * 60 * 60 * 1000;
const OPEN_EVENT_MAX_MS = 48 * 60 * 60 * 1000; // espelha o encerramento forçado da ocasião
export const EVENT_MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000; // teto das regras (validExpiry)
const FICHA_PUSH_DEBOUNCE_MS = 800;
const DISMISSED_KEEP_MS = 400 * 24 * 60 * 60 * 1000;

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : []);
const unique = (list) => [...new Set(list)];

// O que sai do aparelho do organizador: só isto. Nada de dose, bebida, id da ocasião.
// (fim ?? início + 48h) + 24h — o mesmo raciocínio do prazo de `shares`, para uma
// ocasião esquecida aberta não virar convite eterno.
export function buildEventFicha(occasion) {
  const startAt = finite(occasion?.startedAt) ? occasion.startedAt : occasion?.scheduledStartAt;
  if (!finite(startAt)) return null;

  const endAt = finite(occasion.endedAt) ? occasion.endedAt : finite(occasion.scheduledEndAt) ? occasion.scheduledEndAt : null;
  return {
    name: String(occasion.name ?? "").slice(0, 80),
    startAt,
    endAt,
    timeZone: typeof occasion.timeZone === "string" ? occasion.timeZone : "",
    expiresAtMs: (endAt ?? startAt + OPEN_EVENT_MAX_MS) + GRACE_MS,
  };
}

const fichaKey = (ficha) => stableJson({
  name: ficha.name, startAt: ficha.startAt, endAt: ficha.endAt, timeZone: ficha.timeZone, expiresAtMs: ficha.expiresAtMs,
});

// Falha fechada: o que chega da nuvem não é confiável só por estar na nossa coleção.
export function readEventDoc(raw, eventId) {
  if (!raw || typeof raw !== "object" || typeof raw.hostUid !== "string" || !raw.hostUid) return null;
  if (!finite(raw.startAt)) return null;

  const expiresAtMs = typeof raw.expiresAt?.toMillis === "function" ? raw.expiresAt.toMillis() : raw.expiresAtMs;
  if (!finite(expiresAtMs)) return null;

  return {
    eventId: String(eventId),
    hostUid: raw.hostUid,
    name: String(raw.name ?? ""),
    startAt: raw.startAt,
    endAt: finite(raw.endAt) ? raw.endAt : null,
    timeZone: typeof raw.timeZone === "string" ? raw.timeZone : "",
    status: raw.status === "cancelled" ? "cancelled" : "active",
    invited: strings(raw.invited),
    going: strings(raw.going),
    expiresAtMs,
    updatedAtMs: typeof raw.updatedAt?.toMillis === "function" ? raw.updatedAt.toMillis() : null,
  };
}

export function createSharedEvents({
  app, uid, importModule, onEventsChange, onInvitesChange, onStatusChange,
  now = () => Date.now(), createEventId = () => crypto.randomUUID(),
  schedule = setTimeout, cancel = clearTimeout,
  // Quanto esperar a confirmação do servidor numa ação da pessoa (aceitar, sair).
  ackWaitMs = 6000,
}) {
  let stopped = false;
  const unsubscribers = [];
  // Meus eventos (consulta por hostUid). Guarda também os vencidos, até o sweep apagar.
  const hosted = new Map(); // eventId -> retrato
  // Eventos de outra pessoa a que estou ligado por uma ocasião local.
  const watched = new Map(); // eventId -> { hostUid, unsubscribe, view|null, gone }
  // Convites que ainda não aceitei nem recusei.
  const pendingInvites = new Map(); // eventId -> retrato
  const lastFicha = new Map(); // eventId -> retrato estável do que a nuvem já tem
  const fetching = new Set();
  let wantedInvites = new Map(); // eventId -> hostUid, do que os ponteiros dos amigos apontam
  let linked = new Map(); // eventId -> hostUid, das ocasiões locais ligadas a evento de OUTRO
  let dismissed = null; // eventId -> ms, carregado só quando aparece o primeiro convite
  let latestAppData = null;
  let fichaTimer = null;

  const load = () => loadFirestore({ app, importModule });
  const report = (error) => onStatusChange?.({ state: "error", error });
  const eventRef = (firestore, db, eventId) => firestore.doc(db, "sharedEvents", eventId);
  const pairRef = (firestore, db, otherUid) => firestore.doc(db, "pairings", buildPairId(uid, otherUid));

  function alive(view) {
    return view.expiresAtMs > now();
  }

  // Offline, o SDK só resolve uma escrita quando o servidor confirma. Esperar isso prenderia
  // quem tocou "Vou" ou "Sair" numa tela travada. A escrita continua na fila do SDK e segue
  // sozinha; uma negação que chegar dentro do prazo ainda vira erro para quem chamou.
  function waitAck(promessa) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve("queued"), ackWaitMs);
      promessa.then(() => { clearTimeout(timer); resolve("ack"); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }

  function emitEvents() {
    if (stopped) return;
    const meus = [...hosted.values()].filter(alive).map((view) => ({ ...view, isHost: true }));
    const deOutros = [...watched.entries()].map(([eventId, entry]) => (entry.view && alive(entry.view)
      ? { ...entry.view, isHost: false }
      : { eventId, hostUid: entry.hostUid, isHost: false, gone: true }));
    onEventsChange?.([...meus, ...deOutros]);
  }

  function emitInvites() {
    if (!stopped) onInvitesChange?.([...pendingInvites.values()]);
  }

  // ---- Organizador ----------------------------------------------------------

  // Cria a ficha SEM convidados: convidar é um passo por pessoa (as regras validam a
  // amizade de cada uma). Devolve o id, que o app grava na ocasião como vínculo.
  async function publishEvent(occasion) {
    const ficha = buildEventFicha(occasion);
    if (!ficha) return { ok: false, reason: "no-start" };
    if (ficha.expiresAtMs <= now()) return { ok: false, reason: "over" };
    if (ficha.expiresAtMs >= now() + EVENT_MAX_AHEAD_MS) return { ok: false, reason: "too-far" };

    const { firestore, db } = await load();
    const eventId = createEventId();
    await firestore.setDoc(eventRef(firestore, db, eventId), {
      hostUid: uid, name: ficha.name, startAt: ficha.startAt, endAt: ficha.endAt, timeZone: ficha.timeZone,
      status: "active", invited: [], going: [], schemaVersion: 1,
      createdAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp(),
      expiresAt: firestore.Timestamp.fromMillis(ficha.expiresAtMs),
    });

    lastFicha.set(eventId, fichaKey(ficha));
    hosted.set(eventId, { eventId, hostUid: uid, ...ficha, status: "active", invited: [], going: [], updatedAtMs: now() });
    emitEvents();
    return { ok: true, eventId };
  }

  // O ponteiro que o amigo lê: exatamente os eventos meus a que ele foi convidado e que
  // ainda valem. Só eu escrevo a minha chave, então reescrever a lista inteira é seguro.
  async function publishInvitePointer(otherUid) {
    const ids = [...hosted.values()]
      .filter((view) => view.status === "active" && alive(view) && view.invited.includes(otherUid))
      .map((view) => view.eventId);

    const { firestore, db } = await load();
    await firestore.updateDoc(pairRef(firestore, db, otherUid), { [`invites.${uid}`]: ids.length ? ids : null });
  }

  // Ordem que importa: primeiro o documento do evento, depois o ponteiro. Se fosse o
  // contrário, o amigo veria o ponteiro, tentaria ler e seria negado (escuta que morre).
  async function invite(eventId, otherUid) {
    const view = hosted.get(eventId);
    if (!view) throw new Error("Evento desconhecido.");
    if (view.invited.includes(otherUid)) return;

    const { firestore, db } = await load();
    await firestore.updateDoc(eventRef(firestore, db, eventId), {
      invited: firestore.arrayUnion(otherUid), updatedAt: firestore.serverTimestamp(),
    });
    view.invited = unique([...view.invited, otherUid]);
    await publishInvitePointer(otherUid);
    emitEvents();
  }

  // Convida vários, um por vez (cada convite prova a própria amizade nas regras). Uma
  // falha não impede as demais: devolve quem entrou e quem não.
  async function inviteMany(eventId, otherUids) {
    const invited = []; const failed = [];
    for (const otherUid of unique(otherUids)) {
      try { await invite(eventId, otherUid); invited.push(otherUid); }
      catch (error) { failed.push(otherUid); report(error); }
    }
    return { invited, failed };
  }

  // Retirar o convite leva a presença junto na mesma escrita: `going` só pode conter quem
  // está em `invited` (regra).
  async function uninvite(eventId, otherUid) {
    const view = hosted.get(eventId);
    if (!view) throw new Error("Evento desconhecido.");

    const { firestore, db } = await load();
    await firestore.updateDoc(eventRef(firestore, db, eventId), {
      invited: firestore.arrayRemove(otherUid), going: firestore.arrayRemove(otherUid), updatedAt: firestore.serverTimestamp(),
    });
    view.invited = view.invited.filter((item) => item !== otherUid);
    view.going = view.going.filter((item) => item !== otherUid);
    await publishInvitePointer(otherUid);
    emitEvents();
  }

  // Cancelar é um estado, não uma exclusão: apagar derrubaria a escuta de quem foi
  // convidado (permission-denied), e ele nunca saberia o que aconteceu (spec 0025).
  async function cancelEvent(eventId) {
    const view = hosted.get(eventId);
    if (!view || view.status === "cancelled") return;

    const { firestore, db } = await load();
    await firestore.updateDoc(eventRef(firestore, db, eventId), { status: "cancelled", updatedAt: firestore.serverTimestamp() });
    view.status = "cancelled";
    emitEvents();
  }

  // O que mudou na ocasião local (nome, horário, fim) vai para a ficha. Só regrava se a
  // ficha mudou de fato — todo commit do app passa por aqui e a maioria não mexe nela.
  function scheduleFichaPush(appData) {
    latestAppData = appData;
    if (!hosted.size) return;
    if (fichaTimer) cancel(fichaTimer);
    fichaTimer = schedule(() => { fichaTimer = null; flushFichaPushes().catch(report); }, FICHA_PUSH_DEBOUNCE_MS);
  }

  async function flushFichaPushes() {
    if (fichaTimer) { cancel(fichaTimer); fichaTimer = null; }
    if (!latestAppData || !hosted.size) return;

    const { firestore, db } = await load();
    for (const occasion of latestAppData.occasions || []) {
      if (occasion.sharedHostUid !== uid || !hosted.has(occasion.sharedEventId)) continue;

      // Só ausência não cancela nada: outro aparelho da mesma conta pode simplesmente
      // ainda não ter sincronizado esta ocasião. Cancelar é ato explícito (cancelEvent).
      const ficha = buildEventFicha(occasion);
      if (!ficha || ficha.expiresAtMs <= now() || ficha.expiresAtMs >= now() + EVENT_MAX_AHEAD_MS) continue;

      const eventId = occasion.sharedEventId;
      const key = fichaKey(ficha);
      if (lastFicha.get(eventId) === key) continue;

      lastFicha.set(eventId, key);
      await firestore.updateDoc(eventRef(firestore, db, eventId), {
        name: ficha.name, startAt: ficha.startAt, endAt: ficha.endAt, timeZone: ficha.timeZone,
        expiresAt: firestore.Timestamp.fromMillis(ficha.expiresAtMs), updatedAt: firestore.serverTimestamp(),
      }).then(() => {
        Object.assign(hosted.get(eventId) ?? {}, ficha);
        emitEvents();
      }).catch((error) => {
        if (lastFicha.get(eventId) === key) lastFicha.delete(eventId);
        report(error);
      });
    }
  }

  // Sem Cloud Functions, o vencimento é higiene do próprio organizador: apaga o que
  // passou do prazo e tira o evento do ponteiro de quem foi convidado.
  async function sweepExpired() {
    const vencidos = [...hosted.values()].filter((view) => !alive(view));
    if (!vencidos.length) return;

    const { firestore, db } = await load();
    const afetados = new Set();
    for (const view of vencidos) {
      await firestore.deleteDoc(eventRef(firestore, db, view.eventId)).catch(report);
      hosted.delete(view.eventId);
      lastFicha.delete(view.eventId);
      for (const otherUid of view.invited) afetados.add(otherUid);
    }
    for (const otherUid of afetados) await publishInvitePointer(otherUid).catch(() => { /* o pareamento pode ter sido desfeito */ });
    emitEvents();
  }

  function onHostedSnapshot(snapshot) {
    if (stopped) return;
    hosted.clear();
    const vistos = new Set();
    for (const entry of snapshot.docs) {
      const view = readEventDoc(entry.data(), entry.id);
      if (!view || view.hostUid !== uid) continue;
      hosted.set(view.eventId, view);
      vistos.add(view.eventId);
      // O documento lido é o retrato do que a nuvem tem: sem isto, a primeira gravação
      // depois de reabrir o app reenviaria uma ficha idêntica.
      lastFicha.set(view.eventId, fichaKey(view));
    }
    for (const eventId of [...lastFicha.keys()]) if (!vistos.has(eventId)) lastFicha.delete(eventId);
    emitEvents();
    sweepExpired().catch(report);
  }

  // ---- Convidado ------------------------------------------------------------

  async function ensureDismissed() {
    if (dismissed) return dismissed;
    const { firestore, db } = await load();
    const snapshot = await firestore.getDoc(firestore.doc(db, "users", uid, "meta", "sharedEvents"));
    const saved = snapshot.exists() ? (snapshot.data()?.dismissed || {}) : {};
    dismissed = new Map(Object.entries(saved).filter(([, at]) => finite(at)));
    return dismissed;
  }

  // Um `get` só por convite, não uma escuta: o convite pendente não muda a todo momento,
  // e cada escuta custaria uma leitura por reconexão. Quem aceita passa a ser escutado.
  async function fetchInvite(eventId, hostUid) {
    if (fetching.has(eventId)) return;
    fetching.add(eventId);
    try {
      if ((await ensureDismissed()).has(eventId)) return;

      const { firestore, db } = await load();
      // A regra lê resource.data: documento inexistente é negado e o SDK REJEITA em vez de
      // devolver exists()==false (spec 0023, v2.3.2). Aqui, negado é "não há convite".
      let snapshot;
      try { snapshot = await firestore.getDoc(eventRef(firestore, db, eventId)); } catch { return; }
      if (!snapshot.exists()) return;

      const view = readEventDoc(snapshot.data(), eventId);
      // O ponteiro é escrito pelo amigo: ele poderia apontar para o evento de qualquer
      // pessoa. Só vale se o organizador do documento é quem publicou o ponteiro.
      if (!view || view.hostUid !== hostUid) return;
      if (view.status !== "active" || !alive(view) || (view.endAt ?? Infinity) <= now()) return;
      if (!wantedInvites.has(eventId) || linked.has(eventId)) return;

      pendingInvites.set(eventId, view);
      emitInvites();
    } catch (error) {
      report(error);
    } finally {
      fetching.delete(eventId);
    }
  }

  // Recebe a mesma lista de pareamentos que share-writer.js já produz (só precisa de
  // `otherUid`, os dois aceites e `invitesFromOther`): nenhuma escuta nova.
  function setPairings(lista) {
    wantedInvites = new Map();
    for (const par of Array.isArray(lista) ? lista : []) {
      if (!par.acceptedByMe || !par.acceptedByOther) continue;
      for (const eventId of pointerToList(par.invitesFromOther)) wantedInvites.set(eventId, par.otherUid);
    }

    let mudou = false;
    for (const eventId of [...pendingInvites.keys()]) {
      if (!wantedInvites.has(eventId)) { pendingInvites.delete(eventId); mudou = true; }
    }
    if (mudou) emitInvites();

    for (const [eventId, hostUid] of wantedInvites) {
      if (pendingInvites.has(eventId) || linked.has(eventId)) continue;
      fetchInvite(eventId, hostUid);
    }
  }

  async function attach(eventId, hostUid) {
    const { firestore, db } = await load();
    const entry = watched.get(eventId);
    if (stopped || !entry) return;

    entry.unsubscribe = firestore.onSnapshot(
      eventRef(firestore, db, eventId),
      (snapshot) => {
        if (stopped) return;
        const view = snapshot.exists() ? readEventDoc(snapshot.data(), eventId) : null;
        entry.view = view && view.hostUid === hostUid ? view : null;
        entry.gone = !entry.view;
        emitEvents();
      },
      (error) => {
        // Negado é o caminho normal quando o convite é retirado ou vence: reflete no
        // estado, não é erro para reportar. A escuta já morreu; recomeça só se relinkar.
        entry.view = null; entry.gone = true;
        emitEvents();
        if (error?.code !== "permission-denied") report(error);
      }
    );
  }

  function detach(eventId) {
    const entry = watched.get(eventId);
    entry?.unsubscribe?.();
    watched.delete(eventId);
  }

  // Ocasiões locais ligadas a evento de OUTRA pessoa: são as únicas escutadas. Os meus
  // eventos vêm da consulta por hostUid. `list` = [{ eventId, hostUid }].
  function setLinked(lista) {
    linked = new Map();
    for (const item of Array.isArray(lista) ? lista : []) {
      if (item?.eventId && item.hostUid && item.hostUid !== uid) linked.set(item.eventId, item.hostUid);
    }

    for (const eventId of [...watched.keys()]) if (!linked.has(eventId)) detach(eventId);
    let mudouConvites = false;
    for (const eventId of linked.keys()) {
      if (pendingInvites.delete(eventId)) mudouConvites = true;
    }
    for (const [eventId, hostUid] of linked) {
      if (watched.has(eventId)) continue;
      watched.set(eventId, { hostUid, unsubscribe: null, view: null, gone: false });
      attach(eventId, hostUid).catch(report);
    }
    if (mudouConvites) emitInvites();
    emitEvents();
  }

  // Confirma presença. Relê o documento antes: o convite pode ter sido cancelado ou o
  // horário ter mudado desde que o retrato pendente foi lido, e é isto que vira a ocasião.
  async function accept(eventId) {
    const { firestore, db } = await load();
    let snapshot;
    try { snapshot = await firestore.getDoc(eventRef(firestore, db, eventId)); } catch { return { ok: false, reason: "not-found" }; }
    if (!snapshot.exists()) return { ok: false, reason: "not-found" };

    const view = readEventDoc(snapshot.data(), eventId);
    if (!view || view.hostUid === uid) return { ok: false, reason: "not-found" };
    if (view.status === "cancelled") return { ok: false, reason: "cancelled" };
    if (!alive(view) || (view.endAt ?? Infinity) <= now()) return { ok: false, reason: "over" };

    try {
      await waitAck(firestore.updateDoc(eventRef(firestore, db, eventId), { going: firestore.arrayUnion(uid) }));
    } catch (error) {
      if (error?.code === "permission-denied") return { ok: false, reason: "not-found" };
      throw error;
    }

    pendingInvites.delete(eventId);
    emitInvites();
    return { ok: true, event: { ...view, going: unique([...view.going, uid]) } };
  }

  // Recusar não escreve nada no documento do evento: recusa e "sem resposta" ficam
  // indistinguíveis para o organizador (sem pressão social). Só lembro, na minha conta,
  // para o convite não voltar a aparecer.
  async function decline(eventId) {
    const mapa = await ensureDismissed();
    mapa.set(eventId, now());
    pendingInvites.delete(eventId);
    emitInvites();

    const limite = now() - DISMISSED_KEEP_MS;
    const { firestore, db } = await load();
    await firestore.setDoc(firestore.doc(db, "users", uid, "meta", "sharedEvents"), {
      dismissed: Object.fromEntries([...mapa].filter(([, at]) => at >= limite)),
    });
  }

  // Sair: retira só a minha presença. Se o convite já foi retirado ou venceu, a regra
  // nega e não há o que desfazer — o resultado é o mesmo.
  async function leave(eventId) {
    detach(eventId);
    const { firestore, db } = await load();
    try {
      await waitAck(firestore.updateDoc(eventRef(firestore, db, eventId), { going: firestore.arrayRemove(uid) }));
    } catch (error) {
      if (error?.code !== "permission-denied") throw error;
    }
    emitEvents();
  }

  // "Apagar dados na nuvem": sem isto, meus eventos ficariam legíveis por quem convidei e
  // minha presença continuaria listada nos dos outros. Melhor esforço, item por item.
  async function deleteAllMyData({ joinedEventIds = [] } = {}) {
    const { firestore, db } = await load();

    const meus = await firestore.getDocs(firestore.query(firestore.collection(db, "sharedEvents"), firestore.where("hostUid", "==", uid)));
    const convidados = new Set();
    for (const entry of meus.docs) {
      for (const otherUid of strings(entry.data()?.invited)) convidados.add(otherUid);
      await firestore.deleteDoc(entry.ref).catch(report);
    }
    for (const otherUid of convidados) {
      await firestore.updateDoc(pairRef(firestore, db, otherUid), { [`invites.${uid}`]: null }).catch(() => { /* pareamento já desfeito */ });
    }

    for (const eventId of joinedEventIds) await leave(eventId).catch(report);

    hosted.clear(); lastFicha.clear();
    await firestore.deleteDoc(firestore.doc(db, "users", uid, "meta", "sharedEvents")).catch(() => {});
    dismissed = new Map();
    emitEvents();
  }

  async function start() {
    stopped = false;
    const { firestore, db } = await load();
    unsubscribers.push(firestore.onSnapshot(
      firestore.query(firestore.collection(db, "sharedEvents"), firestore.where("hostUid", "==", uid)),
      onHostedSnapshot,
      report
    ));
  }

  function stop() {
    stopped = true;
    while (unsubscribers.length) unsubscribers.pop()?.();
    for (const eventId of [...watched.keys()]) detach(eventId);
    if (fichaTimer) { cancel(fichaTimer); fichaTimer = null; }
    hosted.clear(); pendingInvites.clear(); lastFicha.clear(); fetching.clear();
    wantedInvites = new Map(); linked = new Map(); dismissed = null; latestAppData = null;
  }

  return {
    start, stop,
    publishEvent, invite, inviteMany, uninvite, cancelEvent, scheduleFichaPush, flushFichaPushes, sweepExpired,
    setPairings, setLinked, accept, decline, leave, deleteAllMyData,
  };
}
