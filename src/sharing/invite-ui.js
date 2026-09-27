import { renderFriendGrid, rosterStatus } from "./friend-grid.js";
import { formatAgendaDateTime, formatClock, formatDate } from "../format/datetime.js";
import { eventEndMs } from "../data/shared-event.js";

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
  // Quantos convites pedem atenção no ícone de Amigos: só quando a aba Eventos não existe (Eventos
  // desligado, o padrão do app) e a tela Amigos é o único lugar do convite.
  onAttentionChange = () => {},
  // Com Eventos ligado o convite mora na aba Eventos; a tela Amigos só o mostra como reserva.
  getEventsEnabled = () => false,
  // Avisa que a lista de convites foi redesenhada (a aba Eventos decide se mostra o grupo).
  onInvitesRendered = () => {},
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

  // Envelope: o mesmo desenho da marca de "convidado" no avatar (friend-grid.js).
  const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>';

  const atencao = () => (getEventsEnabled() ? 0 : invites.length);

  // Convite sem resposta não fica guardado depois que o evento acaba (o fim informado ou, sem fim,
  // 48h depois do início) nem depois de vencer. A mesma regra do módulo da nuvem.
  const convitePendente = (convite) => convite.expiresAtMs > now() && eventEndMs(convite) > now();

  // Convite de evento que já começou (o caso comum de "Iniciar agora" do organizador) diz
  // "começou às 17:11", não uma data futura que já passou.
  function quandoConvite(convite) {
    if (convite.startAt <= now()) {
      const hoje = new Date(now()).toDateString() === new Date(convite.startAt).toDateString();
      return hoje ? `começou às ${formatClock(convite.startAt)}` : `começou ${formatAgendaDateTime(convite.startAt, now())}`;
    }
    return formatAgendaDateTime(convite.startAt, now());
  }

  function mostrarErro(elemento, mensagem) {
    elemento.textContent = mensagem || "";
    elemento.hidden = !mensagem;
  }

  // Uma linha por convite, com a resposta ao alcance de um toque. O cabeçalho abre a folha de
  // detalhes (quem mais vai). `div`, não `button`: botões aninhados não são HTML válido.
  function linhaConvite(convite) {
    const nomeEvento = convite.name || "Evento";
    const linha = document.createElement("div");
    linha.className = "agenda-row invite-row";

    const cabeca = document.createElement("button");
    cabeca.type = "button";
    cabeca.className = "invite-row-head";
    const titulo = document.createElement("span");
    titulo.className = "invite-row-title";
    titulo.innerHTML = ENVELOPE;
    const nome = document.createElement("strong");
    nome.textContent = nomeEvento;
    titulo.append(nome);
    const sub = document.createElement("span");
    sub.className = "invite-row-sub";
    sub.textContent = `de ${aliasDe(convite.hostUid) || "Alguém"} · ${quandoConvite(convite)}`;
    cabeca.append(titulo, sub);
    cabeca.addEventListener("click", () => abrirFolha(convite.eventId));

    const erro = document.createElement("p");
    erro.className = "invite-row-error";
    erro.setAttribute("role", "alert");
    erro.hidden = true;

    const acoes = document.createElement("div");
    acoes.className = "invite-row-actions";
    const vou = document.createElement("button");
    vou.type = "button";
    vou.className = "primary-button";
    vou.textContent = "Vou";
    vou.setAttribute("aria-label", `Vou ao evento ${nomeEvento}`);
    vou.addEventListener("click", () => aceitar(convite, (mensagem) => mostrarErro(erro, mensagem)));
    const naoVou = document.createElement("button");
    naoVou.type = "button";
    naoVou.className = "secondary-button";
    naoVou.textContent = "Não vou";
    naoVou.setAttribute("aria-label", `Não vou ao evento ${nomeEvento}`);
    naoVou.addEventListener("click", () => recusar(convite, (mensagem) => mostrarErro(erro, mensagem)));
    acoes.append(vou, naoVou);

    linha.append(cabeca, acoes, erro);
    return linha;
  }

  // O consentimento fica visível uma vez por lista, porque "Vou" em um toque dispensa abrir a folha.
  function avisoConsentimento() {
    const aviso = document.createElement("p");
    aviso.className = "settings-description invite-consent";
    aviso.textContent = "Ir a um evento não mostra suas doses a ninguém.";
    return aviso;
  }

  // O convite mora na aba Eventos (grupo no topo de Próximos); a tela Amigos só o mostra como
  // reserva, quando Eventos está desligado e a aba nem existe. Um ponto no menu de baixo avisa
  // sem abrir nada.
  function renderInvites() {
    const ordenados = [...invites].sort((a, b) => a.startAt - b.startAt);
    const listas = [
      [nodes.friendsInvites, nodes.friendsInvitesList, !getEventsEnabled()],
      // Em Eventos, quem decide se o grupo aparece é a aba ativa (occasions-ui.js): aqui só o conteúdo.
      [nodes.occasionInvites, nodes.occasionInvitesList, null],
    ];

    for (const [secao, lista, visivel] of listas) {
      if (!secao || !lista) continue;
      if (visivel !== null) secao.hidden = !(visivel && ordenados.length > 0);
      lista.replaceChildren();
      if (!ordenados.length) continue;
      lista.append(avisoConsentimento());
      for (const convite of ordenados) lista.append(linhaConvite(convite));
    }

    if (nodes.navOccasionDot) nodes.navOccasionDot.hidden = invites.length === 0;
    onInvitesRendered(invites.length);
  }

  // Eventos foi ligado ou desligado: o convite muda de lugar (Eventos ⇄ Amigos).
  function refresh() {
    renderInvites();
    onAttentionChange(atencao());
  }

  function setInvites(lista) {
    invites = (Array.isArray(lista) ? lista : []).filter(convitePendente);
    renderInvites();
    onAttentionChange(atencao());
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

  // Uma resposta por vez: trava os botões da folha e das linhas enquanto a nuvem responde.
  function travar(sim) {
    respondendo = sim;
    for (const botao of [nodes.inviteSheetAccept, nodes.inviteSheetDecline]) if (botao) botao.disabled = sim;
    for (const lista of [nodes.friendsInvitesList, nodes.occasionInvitesList]) {
      lista?.querySelectorAll(".invite-row-actions button").forEach((botao) => { botao.disabled = sim; });
    }
  }

  // `aoErro` diz onde mostrar o motivo: na folha (padrão) ou dentro da própria linha.
  async function aceitar(convite, aoErro = erroFolha) {
    if (!convite || respondendo) return;
    aoErro("");
    travar(true);
    try {
      const resultado = await acceptInvite(convite);
      if (resultado?.ok) { if (sheetAberta === convite.eventId) fecharFolha(); return; }
      aoErro(resultado?.message || MOTIVOS[resultado?.reason] || MOTIVOS["not-found"]);
    } catch (falha) {
      console.error("Falha ao aceitar o convite.", falha);
      aoErro("Não foi possível aceitar agora. Tente de novo.");
    } finally {
      travar(false);
    }
  }

  async function recusar(convite, aoErro = erroFolha) {
    if (!convite || respondendo) return;
    aoErro("");
    travar(true);
    try {
      await declineInvite(convite);
      if (sheetAberta === convite.eventId) fecharFolha();
      showToast("Convite descartado. Quem convidou não é avisado.");
    } catch (falha) {
      console.error("Falha ao recusar o convite.", falha);
      aoErro("Não foi possível descartar agora. Tente de novo.");
    } finally {
      travar(false);
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
    nodes.inviteSheetAccept?.addEventListener("click", () => aceitar(invites.find((item) => item.eventId === sheetAberta)));
    nodes.inviteSheetDecline?.addEventListener("click", () => recusar(invites.find((item) => item.eventId === sheetAberta)));
    nodes.closeEventInvite?.addEventListener("click", closeInviteDialog);
    nodes.eventInviteCancel?.addEventListener("click", closeInviteDialog);
    nodes.eventInviteConfirm?.addEventListener("click", confirmarDialogo);
    // Um convite que vence sozinho some da lista sem esperar um dado novo.
    setInterval(() => {
      const antes = invites.length;
      invites = invites.filter(convitePendente);
      if (invites.length !== antes) { renderInvites(); onAttentionChange(atencao()); }
    }, 30000);
  }

  return {
    wire, setPairings, setInvites, setEvents, rosterFor, openInviteDialog, closeInviteDialog,
    refresh, aliasOf: aliasDe, pendingCount: () => invites.length,
  };
}
