import { loadFirestore, chunk, BATCH_LIMIT } from "./firestore-db.js";
import { buildPairId, generatePairingCode, otherUidOf, pointerToList, listToPointer } from "./share-codes.js";
import { buildSharePayload } from "./share-payload.js";
import { stableJson } from "./sync-merge.js";

export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const SHARE_PUSH_DEBOUNCE_MS = 800;

// Lado de quem convida e de quem compartilha. Escreve; o lado que só lê é
// src/data/shared-view.js. Ver docs/specs/0023.
export function createShareWriter({
  app, uid, importModule, onPairingsChange, onSharesChange, onStatusChange,
  now = () => Date.now(), generateCode = generatePairingCode,
  createShareId = () => crypto.randomUUID(),
  schedule = setTimeout, cancel = clearTimeout,
}) {
  let stopped = false;
  const unsubscribers = [];
  // shareId -> { occasionId, viewerUid, ownerAlias }. Nunca dado à nuvem tal qual —
  // é reconstruído de users/{uid}/meta/shares (área exclusiva do dono, já coberta
  // pela regra existente de spec 0022, sem precisar de regra nova) e da coleção
  // shares filtrada por ownerUid. O id da ocasião só existe aqui e naquele
  // documento próprio; nunca no documento que o convidado lê.
  const activeShares = new Map();
  // O que a nuvem já tem, para não regravar o que não mudou. Só em memória: cada
  // escrita aqui custa uma leitura em todo aparelho que escuta (spec 0025, Fase 0).
  // shareId -> retrato estável do último payload enviado a shares/{shareId}.
  const lastPushed = new Map();
  // shareId -> retrato estável da entrada já gravada em users/{uid}/meta/shares.
  const storedBookkeeping = new Map();
  let latestAppData = null;
  let sharePushTimer = null;

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
        createdAt: typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : null,
        // Ponteiro publicado por quem compartilha: é assim que o outro lado
        // descobre o documento, sem precisar adivinhar nem varrer a coleção.
        // Listas: pode haver mais de um evento ao mesmo tempo. Lê também o formato
        // antigo (um shareId ou null).
        sharedWithMe: pointerToList(data.sharing?.[other]),
        sharingWithOther: pointerToList(data.sharing?.[uid]),
        // Ponteiros de convite a evento compartilhado (spec 0025), mesmo desenho do
        // `sharing`: cada lado só escreve a própria chave. Pareamentos criados antes da
        // spec não têm o campo.
        invitesFromOther: pointerToList(data.invites?.[other]),
        invitesFromMe: pointerToList(data.invites?.[uid]),
        viaCode: data.viaCode ?? null,
      };
    });
  }

  // Ninguém redime o próprio código (a regra exige `ownerUid !== uid` na criação),
  // então um pareamento que EU não criei só pode ter nascido de um código MEU sendo
  // digitado por outra pessoa — por eliminação, não por o documento dizer isso.
  // Apagar aqui é o que torna o código de uso único na prática: sem Cloud Functions
  // não dá pra invalidar atomicamente no instante do resgate, mas isso fecha a
  // janela assim que este aparelho perceber o pareamento novo (tipicamente
  // segundos, via onSnapshot) — bem menor que os 5 minutos de validade do código.
  async function invalidateUsedCodes(paresAtuais) {
    const { firestore, db } = await load();
    for (const par of paresAtuais) {
      if (par.createdByMe || !par.viaCode) continue;
      await firestore.deleteDoc(firestore.doc(db, "pairingCodes", par.viaCode)).catch(() => {});
    }
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

    // A regra de `pairingCodes` lê `resource.data.expiresAt` para decidir se deixa
    // ler. Quando o documento não existe, `resource` é nulo e a regra nem consegue
    // avaliar essa condição — o Firestore nega o pedido inteiro em vez de responder
    // "não existe". Na prática, `getDoc` REJEITA (não resolve com exists()==false)
    // tanto para código inexistente quanto vencido, e os dois casos são o mesmo
    // "não encontrado" para quem está tentando usar o código.
    let codeSnapshot;
    try {
      codeSnapshot = await firestore.getDoc(firestore.doc(db, "pairingCodes", code));
    } catch {
      return { ok: false, reason: "not-found" };
    }
    if (!codeSnapshot.exists()) return { ok: false, reason: "not-found" };

    const ownerUid = codeSnapshot.data()?.ownerUid;
    if (!ownerUid) return { ok: false, reason: "not-found" };
    if (ownerUid === uid) return { ok: false, reason: "own-code" };

    const pairId = buildPairId(uid, ownerUid);
    const pairRef = firestore.doc(db, "pairings", pairId);

    // Mesma situação aqui: um pareamento novo — o caso mais comum, a primeira vez
    // que duas pessoas se conectam — ainda não existe, e a regra de `pairings`
    // também lê `resource.data.uids`, então nega pelo mesmo motivo. Isso não é uma
    // falha real: é exatamente o sinal de que precisa criar o pareamento agora.
    let jaExiste = false;
    try {
      jaExiste = (await firestore.getDoc(pairRef)).exists();
    } catch { /* ainda não existe: segue para criar */ }

    // Já existir é normal: já estar conectados só significa que não há nada a
    // fazer aqui (o `acceptPairing` cobre o caso raro de um pareamento antigo, de
    // antes desta simplificação, que ainda não tinha os dois lados aceitos).
    if (jaExiste) {
      await acceptPairing(pairId, myAlias);
      return { ok: true, pairId, otherUid: ownerUid };
    }

    // Nasce aceito pelos dois: mostrar o código já foi o consentimento de quem
    // gerou, digitá-lo é o de quem recebeu — sem tela de confirmação separada.
    // O apelido de quem gerou o código não entra aqui (quem resgata não tem
    // permissão de ler `users/{outro}/meta/account`); a própria pessoa preenche o
    // dela sozinha na próxima vez que seu aparelho perceber este pareamento — ver
    // `seedMissingAlias`.
    await firestore.setDoc(pairRef, {
      uids: [uid, ownerUid].sort(),
      createdBy: uid,
      createdAt: firestore.serverTimestamp(),
      viaCode: code,
      acceptedBy: [uid, ownerUid],
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

  // Cache em memória do apelido global: evita reler a cada pareamento novo que
  // aparece na escuta (seedMissingAlias roda a cada snapshot). `null` = ainda não
  // buscado nesta sessão; string vazia = buscado, mas a pessoa nunca salvou um.
  let cachedAlias = null;

  async function getGlobalAlias() {
    const { firestore, db } = await load();
    const snapshot = await firestore.getDoc(firestore.doc(db, "users", uid, "meta", "account"));
    cachedAlias = snapshot.exists() ? String(snapshot.data()?.shareAlias ?? "") : "";
    return cachedAlias;
  }

  async function ensureMyAlias() {
    if (cachedAlias === null) await getGlobalAlias();
    return cachedAlias;
  }

  // Quando alguém resgata meu código, o pareamento nasce sem o meu apelido — quem
  // resgatou não tem permissão de ler users/{eu}/meta/account para preenchê-lo.
  // Este aparelho é quem preenche sozinho, na primeira vez que perceber (via a
  // própria escuta de pareamentos) um pareamento onde meu apelido ainda falta.
  async function seedMissingAlias(pares) {
    const alias = await ensureMyAlias();
    if (!alias) return; // nada salvo ainda: não tem o que propagar

    const { firestore, db } = await load();
    for (const par of pares) {
      if (par.myAlias) continue;
      await firestore.updateDoc(
        firestore.doc(db, "pairings", par.pairId),
        { [`aliases.${uid}`]: alias }
      ).catch(() => {});
    }
  }

  // Um apelido só, não um por conexão: o valor canônico fica em users/{uid}/meta/account
  // (área já exclusiva do dono, spec 0022 — nenhuma regra nova precisa disso) e mudá-lo
  // aqui propaga para todo pareamento existente de uma vez, em vez de cada um guardar
  // um nome diferente.
  async function setGlobalAlias(alias) {
    const clean = String(alias ?? "").trim();
    const { firestore, db } = await load();

    await firestore.setDoc(firestore.doc(db, "users", uid, "meta", "account"), { shareAlias: clean }, { merge: true });

    const mine = await firestore.getDocs(firestore.query(
      firestore.collection(db, "pairings"),
      firestore.where("uids", "array-contains", uid)
    ));

    for (const group of chunk(mine.docs, BATCH_LIMIT)) {
      const batch = firestore.writeBatch(db);
      for (const entry of group) batch.update(entry.ref, { [`aliases.${uid}`]: clean });
      await batch.commit();
    }

    cachedAlias = clean;
    return clean;
  }

  async function removePairing(pairId) {
    // Revoga antes de desfazer: a regra de leitura do share não depende do
    // pareamento continuar existindo, então só apagar o pareamento deixaria a
    // pessoa enxergando o evento até o prazo natural de 24h — o oposto de
    // "revogação imediata". stopShare já apaga o documento e limpa o ponteiro.
    for (const [shareId, info] of [...activeShares]) {
      if (buildPairId(uid, info.viewerUid) === pairId) await stopShare(shareId);
    }

    const { firestore, db } = await load();
    await firestore.deleteDoc(firestore.doc(db, "pairings", pairId));
  }

  function sharesSnapshot() {
    return [...activeShares].map(([shareId, info]) => ({ shareId, ...info }));
  }

  // Grava só o que é novo ou mudou. O `merge` do Firestore junta os mapas, então uma
  // entrada que não vai no lote continua como estava — e é isso que permite a outro
  // aparelho da mesma conta ter começado um compartilhamento que este não conhece.
  async function saveShareBookkeeping() {
    const pending = {};
    for (const [shareId, info] of activeShares) {
      if (storedBookkeeping.get(shareId) !== stableJson(info)) pending[shareId] = info;
    }
    if (!Object.keys(pending).length) return;

    const { firestore, db } = await load();
    await firestore.setDoc(firestore.doc(db, "users", uid, "meta", "shares"), { active: pending }, { merge: true });
    for (const [shareId, info] of Object.entries(pending)) storedBookkeeping.set(shareId, stableJson(info));
  }

  function activeIdsFor(viewerUid) {
    return [...activeShares].filter(([, info]) => info.viewerUid === viewerUid).map(([shareId]) => shareId);
  }

  // Republica o ponteiro com exatamente os compartilhamentos ativos com essa pessoa.
  // O dono é o único escritor da própria chave e conhece todos os seus shares, então
  // reescrever a lista inteira é mais simples e seguro do que somar/retirar um id —
  // e parar UM evento nunca derruba os outros (antes zerava o ponteiro inteiro).
  async function publishPointer(viewerUid, ids = activeIdsFor(viewerUid)) {
    const { firestore, db } = await load();
    await firestore.updateDoc(
      firestore.doc(db, "pairings", buildPairId(uid, viewerUid)),
      { [`sharing.${uid}`]: listToPointer(ids) }
    );
  }

  async function republishPointer(viewerUid) {
    await publishPointer(viewerUid).catch(() => { /* o pareamento pode já ter sido desfeito */ });
  }

  // Começa a compartilhar um evento com alguém. `events` é só o retrato inicial —
  // atualizações seguintes vêm de scheduleSharePush, reconstruindo o payload a
  // partir do estado local corrente.
  async function startShare({ occasion, events, viewerUid, ownerAlias }) {
    const { firestore, db } = await load();
    const shareId = createShareId();
    const payload = buildSharePayload({ occasion, events, ownerUid: uid, viewerUid, ownerAlias, now: now() });

    await firestore.setDoc(firestore.doc(db, "shares", shareId), {
      ...payload,
      expiresAt: firestore.Timestamp.fromMillis(payload.expiresAtMs),
      updatedAt: firestore.serverTimestamp(),
    });
    lastPushed.set(shareId, stableJson(payload));

    await publishPointer(viewerUid, [...activeIdsFor(viewerUid), shareId]);

    activeShares.set(shareId, { occasionId: occasion.id, occasionName: occasion.name, viewerUid, ownerAlias, expiresAtMs: payload.expiresAtMs });
    await saveShareBookkeeping();
    onSharesChange?.(sharesSnapshot());
    return { shareId };
  }

  async function stopShare(shareId) {
    const info = activeShares.get(shareId);
    activeShares.delete(shareId);
    lastPushed.delete(shareId);
    storedBookkeeping.delete(shareId);
    await saveShareBookkeeping();
    onSharesChange?.(sharesSnapshot());

    const { firestore, db } = await load();
    await firestore.deleteDoc(firestore.doc(db, "shares", shareId)).catch(report);
    if (info) await republishPointer(info.viewerUid);
  }

  async function stopAllShares() {
    for (const shareId of [...activeShares.keys()]) await stopShare(shareId);
  }

  function scheduleSharePush(appData) {
    latestAppData = appData;
    if (!activeShares.size) return;
    if (sharePushTimer) cancel(sharePushTimer);
    sharePushTimer = schedule(() => { sharePushTimer = null; flushSharePushes().catch(report); }, SHARE_PUSH_DEBOUNCE_MS);
  }

  // Reconstrói o payload de cada compartilhamento ativo a partir do estado local
  // mais recente. Se a ocasião foi apagada, para de compartilhar em vez de mandar
  // um payload vazio ou desatualizado.
  async function flushSharePushes() {
    if (sharePushTimer) { cancel(sharePushTimer); sharePushTimer = null; }
    if (!latestAppData || !activeShares.size) return;

    const { firestore, db } = await load();
    for (const [shareId, info] of [...activeShares]) {
      const occasion = (latestAppData.occasions || []).find((item) => item.id === info.occasionId);
      if (!occasion) { await stopShare(shareId); continue; }

      const payload = buildSharePayload({
        occasion, events: latestAppData.events, ownerUid: uid,
        viewerUid: info.viewerUid, ownerAlias: info.ownerAlias, now: now(),
      });
      // O prazo anda junto do evento (fim + 24h): manter o valor local em dia.
      info.expiresAtMs = payload.expiresAtMs;

      // Todo commit do app passa por aqui (preferência, ordem de bebida, dose de outro
      // evento), mas na maioria deles este compartilhamento não mudou. Regravar custaria
      // uma escrita e uma leitura em cada aparelho que escuta, por nada. `updatedAt` fica
      // fora da comparação de propósito: a tela de quem vê mostra a hora do último envio
      // real, e silêncio não indica falha (spec 0023, v2.10.1).
      const key = stableJson(payload);
      if (lastPushed.get(shareId) === key) continue;

      // Marca antes de esperar: offline, o SDK enfileira a escrita e um segundo
      // commit idêntico não precisa enfileirar outra. Se falhar, desmarca para tentar de novo.
      lastPushed.set(shareId, key);
      await firestore.setDoc(firestore.doc(db, "shares", shareId), {
        ...payload,
        expiresAt: firestore.Timestamp.fromMillis(payload.expiresAtMs),
        updatedAt: firestore.serverTimestamp(),
      }).catch((error) => {
        if (lastPushed.get(shareId) === key) lastPushed.delete(shareId);
        report(error);
      });
    }
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

  // Reconstrói activeShares a cada abertura: apaga o que venceu (e limpa o
  // ponteiro no pareamento), e recupera o occasionId — que só existe em
  // users/{uid}/meta/shares — do que sobrou.
  async function rehydrateShares() {
    const { firestore, db } = await load();
    const bookkeepingSnap = await firestore.getDoc(firestore.doc(db, "users", uid, "meta", "shares"));
    const bookkeeping = bookkeepingSnap.exists() ? (bookkeepingSnap.data()?.active || {}) : {};

    const mine = await firestore.getDocs(firestore.query(
      firestore.collection(db, "shares"),
      firestore.where("ownerUid", "==", uid)
    ));

    const limit = now();
    activeShares.clear();
    lastPushed.clear();
    storedBookkeeping.clear();
    // O que já está gravado, para a próxima gravação pular o que não mudou.
    for (const [shareId, entry] of Object.entries(bookkeeping)) storedBookkeeping.set(shareId, stableJson(entry));
    const mexidas = new Set();

    for (const entry of mine.docs) {
      const data = entry.data();
      const expiresAtMs = typeof data?.expiresAt?.toMillis === "function" ? data.expiresAt.toMillis() : 0;

      if (expiresAtMs <= limit) {
        await firestore.deleteDoc(entry.ref).catch(report);
        if (data?.viewerUid) mexidas.add(data.viewerUid);
        continue;
      }

      const tracked = bookkeeping[entry.id];
      // Sem bookkeeping não há como saber a qual ocasião local isto pertence —
      // acontece só se o documento de bookkeeping se perdeu; mais seguro encerrar
      // do que compartilhar sem saber o que está sendo enviado.
      if (!tracked) { await firestore.deleteDoc(entry.ref).catch(report); if (data?.viewerUid) mexidas.add(data.viewerUid); continue; }

      activeShares.set(entry.id, { occasionId: tracked.occasionId, occasionName: data.occasion?.name ?? null, viewerUid: data.viewerUid, ownerAlias: data.ownerAlias, expiresAtMs });

      // O documento já lido é o retrato do último envio: sem os carimbos de tempo, é
      // exatamente o payload. Se divergir (versão antiga do formato), a próxima
      // gravação simplesmente acontece, que é o comportamento seguro.
      const enviado = { ...data };
      delete enviado.expiresAt;
      delete enviado.updatedAt;
      lastPushed.set(entry.id, stableJson(enviado));
    }

    // Só depois de reconstruir tudo: o ponteiro de quem perdeu algum share passa a
    // listar exatamente o que sobrou.
    for (const viewerUid of mexidas) await republishPointer(viewerUid);

    await saveShareBookkeeping().catch(report);
    onSharesChange?.(sharesSnapshot());
  }

  // Vencimento na hora certa, sem esperar reabrir o app: apaga do servidor o que já
  // passou do prazo e tira da lista local.
  async function sweepExpiredShares() {
    const limit = now();
    const vencidos = [...activeShares].filter(([, info]) => Number.isFinite(info.expiresAtMs) && info.expiresAtMs <= limit);
    for (const [shareId] of vencidos) await stopShare(shareId);
  }

  async function start() {
    stopped = false;
    const { firestore, db } = await load();

    unsubscribers.push(firestore.onSnapshot(
      firestore.query(firestore.collection(db, "pairings"), firestore.where("uids", "array-contains", uid)),
      (snapshot) => {
        if (stopped) return;
        const pares = pairingsOf(snapshot);
        onPairingsChange?.(pares);
        invalidateUsedCodes(pares).catch(report);
        seedMissingAlias(pares).catch(report);
      },
      report
    ));

    await rehydrateShares().catch(report);
    await cleanupExpiredCodes().catch(report);
  }

  // Usado por "apagar dados na nuvem": revoga cada compartilhamento ativo (apaga o
  // documento, não só para de escutar) e desfaz todos os pareamentos. Sem isto,
  // apagar os dados sincronizados deixaria em silêncio as doses do usuário
  // legíveis por quem estiver com um compartilhamento aberto.
  async function deleteAllSharingData() {
    await stopAllShares();

    const { firestore, db } = await load();
    const meus = await firestore.getDocs(firestore.query(
      firestore.collection(db, "pairings"),
      firestore.where("uids", "array-contains", uid)
    ));

    for (const entry of meus.docs) await firestore.deleteDoc(entry.ref).catch(report);
  }

  function stop() {
    stopped = true;
    while (unsubscribers.length) unsubscribers.pop()?.();
    if (sharePushTimer) { cancel(sharePushTimer); sharePushTimer = null; }
    activeShares.clear();
    lastPushed.clear();
    storedBookkeeping.clear();
    latestAppData = null;
    cachedAlias = null;
  }

  return {
    start, stop,
    createPairingCode, cancelPairingCode, redeemPairingCode,
    acceptPairing, setAlias, removePairing, getGlobalAlias, setGlobalAlias,
    startShare, stopShare, stopAllShares, scheduleSharePush, flushSharePushes,
    deleteAllSharingData, sweepExpiredShares,
  };
}
