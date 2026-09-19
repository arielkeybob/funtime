import { renderFriendGrid, rosterStatus } from "./friend-grid.js";
import { formatClock, formatDate } from "../format/datetime.js";

const MOTIVOS = {
  cancelled: "O organizador cancelou este evento.",
  over: "Esse evento já terminou.",
  "not-found": "Esse convite não está mais disponível.",
};

const quando = (ms) => `${formatDate(ms)} às ${formatClock(ms)}`;

// Interface do convite a evento (docs/specs/0025): o cartão de convites recebidos, a folha
// de aceite e a tela de convidados. Não conhece `state`, `localStorage` nem a nuvem — o app
// injeta o que fazer ao aceitar, recusar ou confirmar. Tudo fica atrás de um toque: nada
// aparece enquanto não há o que mostrar.
export function createInviteUI({
  nodes, showToast = () => {}, now = () => Date.now(),
  getMyUid = () => null,
  acceptInvite = async () => ({ ok: false, reason: "not-found" }),
  declineInvite = async () => {},
  onAttentionChange = () => {},
}) {
  let pairings = [];
  let invites = [];
  let events = [];
  let sheetAberta = null; // convite mostrado na folha
  let dialogo = null; // { occasion, selected, onConfirm }
  let respondendo = false;

  const aliasDe = (uid) => pairings.find((par) => par.otherUid === uid)?.alias || "";

  // O que se sabe do evento compartilhado ligado a uma ocasião: quem foi convidado e quem
  // confirmou. `null` = a ocasião não está ligada a nenhum (ou ainda não chegou nada).
  function rosterFor(sharedEventId) {
    if (!sharedEventId) return null;
    const view = events.find((item) => item.eventId === sharedEventId);
    if (!view) return null;
    if (view.gone) return { view, invited: new Set(), going: new Set(), gone: true };
    return { view, invited: new Set(view.invited), going: new Set(view.going), gone: false };
  }

  // ---- Convites recebidos ---------------------------------------------------

  function renderInvites() {
    if (!nodes.friendsInvites || !nodes.friendsInvitesList) return;
    nodes.friendsInvites.hidden = invites.length === 0;
    nodes.friendsInvitesList.replaceChildren();

    for (const convite of [...invites].sort((a, b) => a.startAt - b.startAt)) {
      const linha = document.createElement("button");
      linha.type = "button";
      linha.className = "agenda-row";
      const titulo = document.createElement("strong");
      titulo.textContent = convite.name || "Evento";
      const sub = document.createElement("span");
      sub.textContent = `${aliasDe(convite.hostUid) || "Alguém"} convidou você · ${quando(convite.startAt)}`;
      const seta = document.createElement("small");
      seta.textContent = "Ver convite ›";
      linha.append(titulo, sub, seta);
      linha.addEventListener("click", () => abrirFolha(convite.eventId));
      nodes.friendsInvitesList.append(linha);
    }
  }

  function setInvites(lista) {
    invites = Array.isArray(lista) ? lista : [];
    renderInvites();
    onAttentionChange(invites.length);
    if (sheetAberta) {
      const atual = invites.find((item) => item.eventId === sheetAberta);
      if (atual) renderFolha(atual);
      else fecharFolha();
    }
  }

  function erroFolha(mensagem) {
    if (!nodes.inviteSheetError) return;
    nodes.inviteSheetError.textContent = mensagem || "";
    nodes.inviteSheetError.hidden = !mensagem;
  }

  function renderFolha(convite) {
    nodes.inviteSheetTitle.textContent = convite.name || "Evento";
    const corpo = document.createElement("div");

    const quem = document.createElement("p");
    quem.textContent = `${aliasDe(convite.hostUid) || "Alguém"} convidou você.`;

    const periodo = document.createElement("p");
    periodo.className = "occasion-period";
    periodo.textContent = convite.endAt != null ? `${quando(convite.startAt)} — ${quando(convite.endAt)}` : quando(convite.startAt);

    const confirmados = convite.going.map(aliasDe).filter(Boolean);
    const amigos = document.createElement("p");
    amigos.className = "settings-description";
    amigos.textContent = confirmados.length ? `Amigos seus que vão: ${confirmados.join(", ")}.` : "Nenhum amigo seu confirmou ainda.";

    // Consentimento em linguagem simples: participar e mostrar doses são coisas separadas.
    // Sempre visível (não é `clean-optional`): é exatamente o momento em que a pessoa decide.
    const aviso = document.createElement("p");
    aviso.className = "settings-description";
    aviso.textContent = "Ir ao evento não mostra suas doses a ninguém. Você decide isso depois, pessoa por pessoa.";

    corpo.append(quem, periodo, amigos, aviso);
    nodes.inviteSheetBody.replaceChildren(corpo);
  }

  function abrirFolha(eventId) {
    const convite = invites.find((item) => item.eventId === eventId);
    if (!convite) return;
    sheetAberta = eventId;
    erroFolha("");
    renderFolha(convite);
    if (!nodes.inviteSheetDialog.open) nodes.inviteSheetDialog.showModal();
  }

  function fecharFolha() {
    sheetAberta = null;
    if (nodes.inviteSheetDialog?.open) nodes.inviteSheetDialog.close();
  }

  function travarFolha(travar) {
    respondendo = travar;
    if (nodes.inviteSheetAccept) nodes.inviteSheetAccept.disabled = travar;
    if (nodes.inviteSheetDecline) nodes.inviteSheetDecline.disabled = travar;
  }

  async function aceitar() {
    const convite = invites.find((item) => item.eventId === sheetAberta);
    if (!convite || respondendo) return;
    erroFolha("");
    travarFolha(true);
    try {
      const resultado = await acceptInvite(convite);
      if (resultado?.ok) { fecharFolha(); return; }
      erroFolha(resultado?.message || MOTIVOS[resultado?.reason] || MOTIVOS["not-found"]);
    } catch (falha) {
      console.error("Falha ao aceitar o convite.", falha);
      erroFolha("Não foi possível aceitar agora. Tente de novo.");
    } finally {
      travarFolha(false);
    }
  }

  async function recusar() {
    const convite = invites.find((item) => item.eventId === sheetAberta);
    if (!convite || respondendo) return;
    erroFolha("");
    travarFolha(true);
    try {
      await declineInvite(convite);
      fecharFolha();
      showToast("Convite descartado. Quem convidou não é avisado.");
    } catch (falha) {
      console.error("Falha ao recusar o convite.", falha);
      erroFolha("Não foi possível descartar agora. Tente de novo.");
    } finally {
      travarFolha(false);
    }
  }

  // ---- Tela de convidados ---------------------------------------------------

  // Quem organiza edita; quem foi convidado só olha (e só vê os PRÓPRIOS amigos, os demais
  // viram uma contagem). Marcas ✉/✔ só enquanto o evento não começou.
  function renderDialogo() {
    if (!dialogo) return;
    const { occasion, selected } = dialogo;
    const roster = rosterFor(occasion?.sharedEventId);
    const convidado = Boolean(roster && !roster.gone && roster.view.isHost === false) || Boolean(occasion?.sharedHostUid && occasion.sharedHostUid !== getMyUid());
    const marcas = !occasion || occasion.startedAt === null;

    nodes.eventInviteTitle.textContent = convidado ? "Quem vai" : "Convidados";
    if (nodes.eventInviteHint) nodes.eventInviteHint.hidden = convidado;
    nodes.eventInviteConfirm.hidden = convidado;
    nodes.eventInviteCancel.textContent = convidado ? "Fechar" : "Cancelar";

    let resto = 0;
    let aviso = "";
    if (convidado) {
      if (roster?.gone) aviso = "Você não está mais na lista de convidados deste evento.";
      else if (roster?.view.status === "cancelled") aviso = MOTIVOS.cancelled;
      else if (roster) {
        const conhecidos = new Set(pairings.filter((par) => par.acceptedByMe && par.acceptedByOther).map((par) => par.otherUid));
        const todos = new Set([...roster.invited, ...roster.going, roster.view.hostUid]);
        todos.delete(getMyUid());
        resto = [...todos].filter((uid) => !conhecidos.has(uid)).length;
      }
    }

    const semNinguem = renderFriendGrid({
      gridNode: nodes.eventInviteGrid, emptyNode: nodes.eventInviteEmpty, pairings, selected,
      onToggle: renderDialogo,
      readOnly: convidado,
      // Quem foi convidado só vê quem ele conhece e que está na lista.
      only: convidado ? (par) => roster?.invited.has(par.otherUid) || roster?.going.has(par.otherUid) || roster?.view.hostUid === par.otherUid : null,
      marks: marcas ? (par) => rosterStatus(par.otherUid, roster) : null,
    });

    if (convidado && semNinguem && nodes.eventInviteEmpty) {
      nodes.eventInviteEmpty.hidden = false;
      nodes.eventInviteEmpty.textContent = "Nenhum amigo seu está na lista.";
    } else if (nodes.eventInviteEmpty) {
      nodes.eventInviteEmpty.textContent = "Adicione um amigo primeiro, na tela Amigos.";
    }

    if (nodes.eventInviteInfo) {
      const partes = [aviso];
      if (resto > 0) partes.push(resto === 1 ? "Mais 1 pessoa que não é sua amiga está na lista." : `Mais ${resto} pessoas que não são suas amigas estão na lista.`);
      const texto = partes.filter(Boolean).join(" ").trim();
      nodes.eventInviteInfo.textContent = texto;
      nodes.eventInviteInfo.hidden = !texto;
    }
  }

  // `selected` é o conjunto de convidados a partir do qual o organizador edita (uma cópia:
  // Cancelar não muda nada). `onConfirm(conjunto)` recebe o resultado.
  function openInviteDialog({ occasion = null, selected = new Set(), onConfirm = () => {} } = {}) {
    dialogo = { occasion, selected: new Set(selected), onConfirm };
    renderDialogo();
    if (!nodes.eventInviteDialog.open) nodes.eventInviteDialog.showModal();
  }

  function closeInviteDialog() {
    dialogo = null;
    if (nodes.eventInviteDialog?.open) nodes.eventInviteDialog.close();
  }

  function confirmarDialogo() {
    if (!dialogo) return;
    const { selected, onConfirm } = dialogo;
    closeInviteDialog();
    onConfirm(new Set(selected));
  }

  function setPairings(lista) {
    pairings = Array.isArray(lista) ? lista : [];
    renderInvites();
    if (dialogo) renderDialogo();
    if (sheetAberta) {
      const convite = invites.find((item) => item.eventId === sheetAberta);
      if (convite) renderFolha(convite);
    }
  }

  function setEvents(lista) {
    events = Array.isArray(lista) ? lista : [];
    if (dialogo) renderDialogo();
  }

  function wire() {
    nodes.closeInviteSheet?.addEventListener("click", fecharFolha);
    nodes.inviteSheetAccept?.addEventListener("click", aceitar);
    nodes.inviteSheetDecline?.addEventListener("click", recusar);
    nodes.closeEventInvite?.addEventListener("click", closeInviteDialog);
    nodes.eventInviteCancel?.addEventListener("click", closeInviteDialog);
    nodes.eventInviteConfirm?.addEventListener("click", confirmarDialogo);
    // Um convite que vence sozinho some da lista sem esperar um dado novo.
    setInterval(() => {
      const antes = invites.length;
      invites = invites.filter((item) => item.expiresAtMs > now() && (item.endAt ?? Infinity) > now());
      if (invites.length !== antes) { renderInvites(); onAttentionChange(invites.length); }
    }, 30000);
  }

  return { wire, setPairings, setInvites, setEvents, rosterFor, openInviteDialog, closeInviteDialog };
}
