import { formatPairingCode, normalizePairingCode, liveFormatPairingCode, buildPairingQrPayload, parsePairingQrPayload } from "../data/share-codes.js";
import { renderQrDataUrl, cameraAvailable, startScanner } from "./qr.js";
import { formatClock, formatDate, formatHistoryElapsed } from "../format/datetime.js";

const MOTIVOS = {
  "not-found": "Código não encontrado ou já vencido. Peça um novo.",
  "own-code": "Esse é o seu próprio código. Quem digita é a outra pessoa.",
  invalid: "Código inválido. Confira as letras e os números.",
};

// Interface do pareamento. Recebe nós do DOM e o escritor por parâmetro; não conhece
// `state` nem `localStorage`. Ver docs/specs/0023.
// `getShareWriter` em vez do escritor direto porque ele só existe enquanto há conta
// conectada: a interface é montada uma vez, o escritor vai e volta com o login.
export function createShareUI({
  nodes, getShareWriter, showToast, now = () => Date.now(),
  // Ponte com o app (que tem `state`): situação dos eventos, iniciar evento já com
  // alguém marcado e levar até a configuração de eventos.
  getEventsContext = () => ({ eventsEnabled: false, active: [] }),
  startEventWith = () => {},
  openEventsSetting = () => {},
}) {
  const shareWriter = new Proxy({}, {
    get: (alvo, metodo) => (...args) => {
      const writer = getShareWriter();
      if (!writer) return Promise.reject(new Error("Sem conta conectada."));
      return writer[metodo](...args);
    },
  });
  let pairings = [];
  let shares = [];
  let sharedEntries = [];
  let occasionAberta = null;
  let detalheAberto = null;
  let detalheAba = "vendo";
  let friendInfoAberto = null;
  let codigoAtual = null;
  let contagem = null;
  let apelidoSalvo = "";
  let pararLeitura = null;
  let resgatando = false;

  function erro(mensagem) {
    nodes.pairingError.textContent = mensagem || "";
    nodes.pairingError.hidden = !mensagem;
  }

  function limparQr() {
    if (nodes.pairingQr) { nodes.pairingQr.hidden = true; nodes.pairingQr.removeAttribute("src"); }
  }

  function pararContagem() {
    if (contagem) { clearInterval(contagem); contagem = null; }
  }

  function mostrarContagem() {
    if (!codigoAtual) {
      nodes.pairingCodeCountdown.textContent = "";
      return;
    }

    const restante = Math.max(0, codigoAtual.expiresAtMs - now());
    if (restante === 0) {
      codigoAtual = null;
      pararContagem();
      nodes.pairingCodeDisplay.textContent = "— — —";
      limparQr();
      nodes.pairingCodeCountdown.textContent = "O código venceu. Gere outro.";
      return;
    }

    const minutos = Math.floor(restante / 60000);
    const segundos = Math.floor((restante % 60000) / 1000);
    nodes.pairingCodeCountdown.textContent = `Vale por mais ${minutos}:${String(segundos).padStart(2, "0")}`;
  }

  async function gerarCodigo() {
    erro("");
    nodes.pairingGenerate.disabled = true;
    try {
      codigoAtual = await shareWriter.createPairingCode();
      nodes.pairingCodeDisplay.textContent = formatPairingCode(codigoAtual.code);
      renderQrDataUrl(buildPairingQrPayload(codigoAtual.code)).then((url) => {
        if (nodes.pairingQr && codigoAtual) { nodes.pairingQr.src = url; nodes.pairingQr.hidden = false; }
      }).catch((falha) => console.error("Falha ao desenhar o QR.", falha));
      pararContagem();
      mostrarContagem();
      contagem = setInterval(mostrarContagem, 1000);
    } catch (falha) {
      console.error("Falha ao gerar código de pareamento.", falha);
      erro("Não foi possível gerar o código agora.");
    } finally {
      nodes.pairingGenerate.disabled = false;
    }
  }

  // Conecta na hora, sem segunda tela: mostrar o código já foi o consentimento de
  // quem gerou, digitá-lo é o de quem recebeu. Nenhum passo de aceite separado.
  async function usarCodigo() {
    if (resgatando) return;
    erro("");
    const code = normalizePairingCode(nodes.pairingCodeInput.value);
    if (!code) { erro(MOTIVOS.invalid); return; }

    resgatando = true;
    pararLeituraCamera();
    try {
      // Salva e propaga antes: o apelido é único para todas as conexões, não um por
      // pareamento — se o campo foi editado agora, todo mundo já conectado também
      // recebe a mudança, não só esta pessoa nova.
      const apelido = await shareWriter.setGlobalAlias(nodes.pairingAlias.value);
      const resultado = await shareWriter.redeemPairingCode(code, apelido);
      if (!resultado.ok) { erro(MOTIVOS[resultado.reason] || MOTIVOS.invalid); return; }

      nodes.pairingCodeInput.value = "";
      showToast("Agora vocês são amigos! Isso não mostra nada — compartilhar é por evento.");
      closePairingDialog();
    } catch (falha) {
      console.error("Falha ao usar o código de pareamento.", falha);
      erro("Não foi possível conectar agora.");
    } finally {
      resgatando = false;
    }
  }

  // Câmera só liga por toque e apaga ao ler, cancelar, fechar o diálogo ou sair do app.
  function pararLeituraCamera() {
    if (pararLeitura) { pararLeitura(); pararLeitura = null; }
    if (nodes.pairingScanner) nodes.pairingScanner.hidden = true;
    if (nodes.pairingScan) nodes.pairingScan.hidden = !cameraAvailable();
  }

  async function lerComCamera() {
    erro("");
    if (!cameraAvailable() || pararLeitura) return;
    nodes.pairingScan.hidden = true;
    nodes.pairingScanner.hidden = false;
    let encerrar = null;
    try {
      encerrar = await startScanner(nodes.pairingVideo, (texto) => {
        const code = parsePairingQrPayload(texto);
        if (!code) { erro("Esse QR não é de um código do FunTime."); return; }
        nodes.pairingCodeInput.value = liveFormatPairingCode(code);
        usarCodigo();
      });
      pararLeitura = encerrar;
    } catch (falha) {
      console.error("Falha ao abrir a câmera.", falha);
      pararLeituraCamera();
      erro(falha?.name === "NotAllowedError"
        ? "Câmera bloqueada. Digite o código."
        : "Não foi possível abrir a câmera. Digite o código.");
    }
  }

  async function desfazer(pairId, alias) {
    const certeza = window.confirm(`Desfazer amizade com ${alias || "essa pessoa"}? Qualquer compartilhamento em andamento com ela é encerrado.`);
    if (!certeza) return;

    try {
      await shareWriter.removePairing(pairId);
      showToast("Amizade desfeita.");
      closeSharedDetail();
      closeFriendInfo();
    } catch (falha) {
      console.error("Falha ao desfazer o pareamento.", falha);
      showToast("Não foi possível desfazer agora.");
    }
  }

  function botao(rotulo, aoClicar, classe = "settings-secondary-button") {
    const elemento = document.createElement("button");
    elemento.type = "button";
    elemento.className = classe;
    elemento.textContent = rotulo;
    elemento.addEventListener("click", aoClicar);
    return elemento;
  }

  // Toda conexão nasce aceita pelos dois lados (nenhuma segunda tela de aceite) —
  // os dois primeiros estados abaixo só existiriam num pareamento de antes dessa
  // simplificação; ficam como fallback informativo, sem ação associada.
  function estadoDe(par) {
    if (par.acceptedByMe && par.acceptedByOther) return "Conectado";
    if (par.acceptedByMe) return "Aguardando a outra pessoa";
    return "Quer se conectar com você";
  }

  // Dois eixos honestos, sem alarme: se o aparelho está sem internet (navigator.onLine),
  // se a leitura ainda é a cópia local (fromCache, típico ao abrir a tela, antes do
  // servidor responder) e há quanto tempo a outra pessoa enviou algo. Quem não anotou
  // nada não envia nada, então "última atualização" antiga não significa problema.
  function freshnessLabel(entry) {
    const enviado = entry.view.updatedAtMs;
    const ultima = enviado != null ? ` · última atualização dela às ${formatClock(enviado)}` : "";
    if (globalThis.navigator?.onLine === false) return `Sem internet neste aparelho${ultima}`;
    if (entry.fromCache) return "Atualizando…";
    if (enviado == null || now() - enviado <= 5 * 60 * 1000) return "Atualizado agora";
    return `Atualizado agora${ultima}`;
  }

  function vendoEntryFor(otherUid) {
    return sharedEntries.find((item) => item.ownerUid === otherUid) ?? null;
  }

  function compartilhandoSharesFor(otherUid) {
    return shares.filter((share) => share.viewerUid === otherUid);
  }

  // Corpo de "ela compartilha com você" — o mesmo conteúdo que antes ficava sempre
  // visível no cartão: período, carimbo de frescor, totais e a lista cronológica.
  function renderVendoPanel(entry) {
    const container = document.createElement("div");
    if (!entry) {
      const vazio = document.createElement("p");
      vazio.className = "settings-description";
      vazio.textContent = "Ela não está compartilhando nada com você agora.";
      container.append(vazio);
      return container;
    }
    const { view } = entry;

    const estado = document.createElement("p");
    estado.className = "sharing-person-state";
    estado.textContent = freshnessLabel(entry);
    container.append(estado);

    const titulo = document.createElement("strong");
    titulo.className = "share-vendo-title";
    titulo.textContent = view.occasion.name || "Evento";
    const periodo = document.createElement("p");
    periodo.className = "settings-description";
    const inicio = new Date(view.occasion.startedAt);
    const dia = dayLabel(view.occasion.startedAt);
    const quando = dia === "Hoje" ? "hoje" : dia === "Ontem" ? "ontem" : `em ${dia}`;
    periodo.textContent = `Começou ${quando} às ${formatClock(inicio)}`;
    if (view.occasion.endedAt != null) periodo.textContent += ` · terminou às ${formatClock(view.occasion.endedAt)}`;
    container.append(titulo, periodo);

    for (const total of view.totals) {
      const linha = document.createElement("p");
      linha.className = "occasion-count";
      linha.textContent = `${total.icon} ${total.name} · ${total.count} registro(s)`;
      container.append(linha);
    }

    if (view.truncated) {
      const aviso = document.createElement("p");
      aviso.className = "settings-description";
      aviso.textContent = `Mostrando os registros mais recentes de ${view.eventCount} no total.`;
      container.append(aviso);
    }

    if (!view.events.length) {
      const vazio = document.createElement("p");
      vazio.className = "settings-description";
      vazio.textContent = `${view.ownerAlias || "Essa pessoa"} ainda não registrou nada neste evento.`;
      container.append(vazio);
      return container;
    }

    container.append(renderDoseTimeline(view.events));
    return container;
  }

  function dayLabel(timestamp) {
    const date = new Date(timestamp);
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const today = new Date(now()); today.setHours(0, 0, 0, 0);
    const difference = Math.round((today.getTime() - start.getTime()) / 86400000);
    if (difference === 0) return "Hoje";
    if (difference === 1) return "Ontem";
    const options = date.getFullYear() === new Date(now()).getFullYear()
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" };
    return new Intl.DateTimeFormat("pt-BR", options).format(date);
  }

  // Mesma linha do tempo do Histórico (dia, hora, cartão com ícone e nome), só leitura
  // e mais recente primeiro — reaproveita as classes .history-* do app.
  function renderDoseTimeline(events) {
    const lista = document.createElement("div");
    let timeline = null;
    let diaAtual = null;

    for (const dose of [...events].reverse()) {
      const dia = dayLabel(dose.consumedAt);
      if (dia !== diaAtual) {
        const secao = document.createElement("section");
        secao.className = "history-day";
        const titulo = document.createElement("h2");
        titulo.className = "history-day-title";
        titulo.textContent = dia;
        timeline = document.createElement("div");
        timeline.className = "history-timeline";
        secao.append(titulo, timeline);
        lista.append(secao);
        diaAtual = dia;
      }

      const linha = document.createElement("div");
      linha.className = "history-event";
      const marcador = document.createElement("span");
      marcador.className = "history-marker";
      marcador.setAttribute("aria-hidden", "true");
      const hora = document.createElement("span");
      hora.className = "history-event-time";
      hora.textContent = formatClock(dose.consumedAt);

      const corpo = document.createElement("span");
      corpo.className = "history-event-body";
      const cabecalho = document.createElement("span");
      cabecalho.className = "history-event-heading";
      const icone = document.createElement("span");
      icone.className = "history-event-icon";
      icone.setAttribute("aria-hidden", "true");
      icone.textContent = dose.drinkIcon;
      const identidade = document.createElement("span");
      identidade.className = "history-event-identity";
      const nome = document.createElement("strong");
      nome.textContent = dose.drinkName;
      identidade.append(nome);
      const horaMovel = document.createElement("span");
      horaMovel.className = "history-event-mobile-time";
      horaMovel.textContent = formatClock(dose.consumedAt);
      cabecalho.append(icone, identidade, horaMovel);

      const decorrido = document.createElement("span");
      decorrido.className = "history-event-elapsed is-after-interval";
      decorrido.textContent = formatHistoryElapsed(dose.consumedAt, now());
      corpo.append(cabecalho, decorrido);

      linha.append(marcador, hora, corpo);
      timeline.append(linha);
    }
    return lista;
  }

  // Corpo de "você compartilha com ela": o que já está sendo enviado (com "Parar") e,
  // logo abaixo, o que dá para começar a enviar. Compartilhar é sempre de um evento,
  // então sem "Usar eventos" ligado só resta avisar e levar até a configuração.
  function renderCompartilhandoPanel(otherUid) {
    const container = document.createElement("div");
    container.className = "share-panel";
    const ativos = compartilhandoSharesFor(otherUid);

    for (const share of ativos) {
      container.append(linhaEvento(share.occasionName || "Evento", "Ao vivo para essa pessoa",
        botao("Parar", () => pararCompartilhamento(share.shareId), "share-stop-button")));
    }

    const contexto = getEventsContext();
    if (!contexto.eventsEnabled) {
      const aviso = document.createElement("div");
      aviso.className = "share-notice";
      const texto = document.createElement("p");
      texto.className = "settings-description";
      texto.textContent = "Para compartilhar, o recurso Eventos precisa estar ativo: o compartilhamento é sempre de um evento.";
      aviso.append(texto, botao("Ativar em Configurações", () => { closeSharedDetail(); openEventsSetting(); }));
      container.append(aviso);
      return container;
    }

    const jaEnviando = new Set(ativos.map((share) => share.occasionId));
    const disponiveis = contexto.active.filter(({ item }) => !jaEnviando.has(item.id));
    for (const { item, events } of disponiveis) {
      container.append(linhaEvento(item.name || "Evento", "Em andamento · não compartilhado",
        botao("Compartilhar", () => startSharesFor(item, events, [otherUid]), "share-start-button")));
    }

    if (!contexto.active.length) {
      const semEvento = document.createElement("div");
      semEvento.className = "share-notice";
      const texto = document.createElement("p");
      texto.className = "settings-description";
      texto.textContent = "Nenhum evento em andamento.";
      semEvento.append(texto, botao("Iniciar evento e compartilhar", () => { closeSharedDetail(); startEventWith(otherUid); }, "share-start-button"));
      container.append(semEvento);
    }
    return container;
  }

  function linhaEvento(titulo, subtitulo, acao) {
    const linha = document.createElement("div");
    linha.className = "share-active-row";
    const texto = document.createElement("div");
    texto.className = "share-active-text";
    const nome = document.createElement("strong");
    nome.textContent = titulo;
    const estado = document.createElement("span");
    estado.textContent = subtitulo;
    texto.append(nome, estado);
    linha.append(texto, acao);
    return linha;
  }

  // Sem nenhum dos dois lados ativo: só quando viraram amigos, ou o estado bruto do
  // pareamento para o raro caso legado que ainda não nasceu aceito pelos dois. Mora
  // na tela "Sobre o amigo" (openFriendInfo), não no diálogo de detalhe principal.
  function renderDetailDefault(par) {
    const container = document.createElement("div");
    const info = document.createElement("p");
    info.className = "settings-description";
    info.textContent = par.acceptedByMe && par.acceptedByOther
      ? (par.createdAt != null ? `Amigos desde ${formatDate(par.createdAt)}.` : "Vocês são amigos.")
      : estadoDe(par);
    container.append(info);
    return container;
  }

  // As duas abas ficam sempre visíveis — cada painel já sabe virar "vazio" sozinho
  // quando não há nada daquele lado.
  function renderDetailBody() {
    if (!nodes.sharedDetailBody || !detalheAberto) return;
    const par = pairings.find((item) => item.otherUid === detalheAberto);
    if (!par) return;

    nodes.sharedDetailTabVendo?.setAttribute("aria-pressed", String(detalheAba === "vendo"));
    nodes.sharedDetailTabCompartilhando?.setAttribute("aria-pressed", String(detalheAba === "compartilhando"));

    const conteudo = detalheAba === "compartilhando"
      ? renderCompartilhandoPanel(detalheAberto)
      : renderVendoPanel(vendoEntryFor(detalheAberto));

    nodes.sharedDetailBody.replaceChildren(conteudo);
  }

  function openFriendDetail(pairId) {
    const par = pairings.find((item) => item.pairId === pairId);
    if (!par) return;
    detalheAberto = par.otherUid;
    detalheAba = "vendo";
    if (nodes.sharedDetailTitle) nodes.sharedDetailTitle.textContent = par.alias || "Alguém";
    renderDetailBody();
    if (!nodes.sharedDetailDialog.open) nodes.sharedDetailDialog.showModal();
  }

  function closeSharedDetail() {
    detalheAberto = null;
    if (nodes.sharedDetailDialog?.open) nodes.sharedDetailDialog.close();
  }

  async function pararCompartilhamento(shareId) {
    try {
      await shareWriter.stopShare(shareId);
      showToast("Compartilhamento encerrado.");
    } catch (falha) {
      console.error("Falha ao parar o compartilhamento.", falha);
      showToast("Não foi possível parar agora.");
    }
  }

  // "Sobre o amigo": tela separada e menos chamativa, alcançada pelo ícone "i" no
  // diálogo de detalhe — é onde "Desfazer amizade" mora agora, para não ser confundido
  // com um botão de parar compartilhamento. Pode crescer com mais informações depois.
  function renderFriendInfoBody(par) {
    if (!nodes.friendInfoBody) return;
    nodes.friendInfoBody.replaceChildren(renderDetailDefault(par));
  }

  function openFriendInfo() {
    if (!detalheAberto) return;
    const par = pairings.find((item) => item.otherUid === detalheAberto);
    if (!par) return;
    closeSharedDetail();
    friendInfoAberto = par.otherUid;
    if (nodes.friendInfoTitle) nodes.friendInfoTitle.textContent = par.alias || "Alguém";
    renderFriendInfoBody(par);
    if (!nodes.friendInfoDialog.open) nodes.friendInfoDialog.showModal();
  }

  function closeFriendInfo() {
    friendInfoAberto = null;
    if (nodes.friendInfoDialog?.open) nodes.friendInfoDialog.close();
  }

  function unfriendFromInfo() {
    if (!friendInfoAberto) return;
    const par = pairings.find((item) => item.otherUid === friendInfoAberto);
    if (par) desfazer(par.pairId, par.alias);
  }

  // Grade única: cada amigo é um avatar com a inicial e o nome, mais até duas
  // bolinhas no canto — verde quando ela compartilha com você agora, azul quando
  // você compartilha com ela agora (as duas podem aparecer juntas). O histórico
  // completo só aparece ao tocar (openFriendDetail).
  function renderFriends() {
    if (!nodes.friendsGrid) return;
    nodes.friendsGrid.replaceChildren();
    if (nodes.friendsEmpty) nodes.friendsEmpty.hidden = pairings.length > 0;

    for (const par of [...pairings].sort((a, b) => (a.alias || "").localeCompare(b.alias || "", "pt-BR"))) {
      const vendo = Boolean(vendoEntryFor(par.otherUid));
      const compartilhando = compartilhandoSharesFor(par.otherUid).length > 0;

      const botaoPessoa = document.createElement("button");
      botaoPessoa.type = "button";
      botaoPessoa.className = "share-person";
      botaoPessoa.addEventListener("click", () => openFriendDetail(par.pairId));

      const partesEstado = [];
      if (vendo) partesEstado.push("compartilhando com você agora");
      if (compartilhando) partesEstado.push("você está compartilhando com essa pessoa");
      botaoPessoa.setAttribute("aria-label", `${par.alias || "Amigo"}${partesEstado.length ? " · " + partesEstado.join(" · ") : ""}`);

      const avatar = document.createElement("span");
      avatar.className = "share-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = initial(par.alias);

      // Selos de mesma forma e tamanho, com a seta apontando o sentido: ↙ verde é
      // ela compartilhando com você, ↗ azul é você compartilhando com ela.
      if (vendo) {
        const selo = document.createElement("span");
        selo.className = "share-badge share-badge--incoming";
        selo.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17 7 7 17M15 17H7V9"/></svg>';
        avatar.append(selo);
      }
      if (compartilhando) {
        const selo = document.createElement("span");
        selo.className = "share-badge share-badge--outgoing";
        selo.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>';
        avatar.append(selo);
      }

      const nome = document.createElement("span");
      nome.className = "share-person-name";
      nome.textContent = par.alias || "Sem apelido";

      botaoPessoa.append(avatar, nome);
      nodes.friendsGrid.append(botaoPessoa);
    }

    // O detalhe aberto (e a tela "Sobre o amigo") também precisam refletir dado novo
    // chegando, ou sumir se a amizade acabou enquanto a pessoa olhava.
    if (detalheAberto) {
      const aindaExiste = pairings.some((item) => item.otherUid === detalheAberto);
      if (aindaExiste) renderDetailBody();
      else { closeSharedDetail(); showToast("Essa amizade foi desfeita."); }
    }
    if (friendInfoAberto) {
      const par = pairings.find((item) => item.otherUid === friendInfoAberto);
      if (par) renderFriendInfoBody(par);
      else { closeFriendInfo(); showToast("Essa amizade foi desfeita."); }
    }
  }

  // A visibilidade do próprio botão (logado ou não) é responsabilidade de quem monta
  // a tela (app.js, junto do resto do estado de login) — aqui só a bolinha, que
  // depende de ter alguém compartilhando com você agora.
  function setSharedEntries(lista) {
    sharedEntries = Array.isArray(lista) ? lista : [];
    if (nodes.homeFriendsDot) nodes.homeFriendsDot.hidden = sharedEntries.length === 0;
    renderFriends();
  }

  function setPairings(lista) {
    pairings = Array.isArray(lista) ? lista : [];
    if (nodes.shareOccasionDialog?.open) renderShareOccasionPeople();
    // O botão da Home também depende de haver amigo, não só de share ativo.
    setSharedEntries(sharedEntries);
  }

  function setShares(lista) {
    shares = Array.isArray(lista) ? lista : [];
    if (nodes.shareOccasionDialog?.open) renderShareOccasionPeople();
    renderFriends();
  }

  // Quem já está vendo este evento, agora — é o ponto de partida da seleção: abrir
  // o diálogo já mostra marcado quem já recebe, como um "enviar para" já preenchido.
  function activeViewersFor(occasionId) {
    return new Set(shares.filter((share) => share.occasionId === occasionId).map((share) => share.viewerUid));
  }

  function initial(alias) {
    const primeiro = [...String(alias || "")].find((char) => char.trim());
    return (primeiro || "?").toLocaleUpperCase("pt-BR");
  }

  // Grade de seleção reaproveitada em dois pontos: o diálogo "Compartilhar evento" e
  // o formulário de criar evento. Só quem aceitou dos dois lados pode receber um
  // compartilhamento — estar numa lista de pedidos pendentes não é a mesma coisa que
  // estar conectado. Devolve `true` se não há ninguém para mostrar.
  function renderFriendPicker(gridNode, emptyNode, selecionados, onToggle) {
    if (!gridNode) return true;
    gridNode.replaceChildren();

    const conectados = [...pairings]
      .filter((par) => par.acceptedByMe && par.acceptedByOther)
      .sort((a, b) => (a.alias || "").localeCompare(b.alias || "", "pt-BR"));

    const semNinguem = conectados.length === 0;
    if (emptyNode) emptyNode.hidden = !semNinguem;
    gridNode.hidden = semNinguem;

    for (const par of conectados) {
      const botaoPessoa = document.createElement("button");
      botaoPessoa.type = "button";
      botaoPessoa.className = "share-person";
      botaoPessoa.setAttribute("aria-pressed", String(selecionados.has(par.otherUid)));
      botaoPessoa.addEventListener("click", () => {
        if (selecionados.has(par.otherUid)) selecionados.delete(par.otherUid);
        else selecionados.add(par.otherUid);
        onToggle();
      });

      const avatar = document.createElement("span");
      avatar.className = "share-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = initial(par.alias);
      if (selecionados.has(par.otherUid)) {
        const selo = document.createElement("span");
        selo.className = "share-badge share-badge--outgoing";
        selo.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>';
        avatar.append(selo);
      }

      const nome = document.createElement("span");
      nome.className = "share-person-name";
      nome.textContent = par.alias || "Sem apelido";

      botaoPessoa.append(avatar, nome);
      gridNode.append(botaoPessoa);
    }

    return semNinguem;
  }

  function renderShareOccasionPeople() {
    if (!occasionAberta) return;
    const semNinguem = renderFriendPicker(nodes.shareOccasionGrid, nodes.shareOccasionEmpty, occasionAberta.selecionados, renderShareOccasionPeople);
    if (nodes.shareOccasionConfirm) nodes.shareOccasionConfirm.hidden = semNinguem;
    if (nodes.shareOccasionStopAll) {
      nodes.shareOccasionStopAll.hidden = activeViewersFor(occasionAberta.item.id).size === 0;
    }
  }

  // Picker embutido no formulário de criar evento — `selecionados` é o Set que
  // occasions-ui.js mantém e lê no submit; aqui só cuidamos da renderização.
  function renderOccasionSharePicker(selecionados) {
    renderFriendPicker(nodes.occasionShareGrid, nodes.occasionShareEmpty, selecionados, () => renderOccasionSharePicker(selecionados));
  }

  // Inicia compartilhamento com uma lista já pronta de pessoas — usado quando um
  // evento acabou de nascer (não há "diferença" possível: ainda não tinha share
  // nenhum). Mesmo laço de `confirmShareOccasion`, sem o lado de "parar".
  async function startSharesFor(item, events, otherUids) {
    if (!otherUids?.length) return;
    try {
      for (const otherUid of otherUids) {
        const par = pairings.find((p) => p.otherUid === otherUid);
        await shareWriter.startShare({ occasion: item, events, viewerUid: otherUid, ownerAlias: par?.myAlias || "Alguém" });
      }
      showToast(`Compartilhando com ${otherUids.length} pessoa(s).`);
    } catch (falha) {
      console.error("Falha ao iniciar o compartilhamento do evento novo.", falha);
      showToast("Evento criado, mas não foi possível compartilhar agora. Tente pelo detalhe do evento.");
    }
  }

  // Aplica de uma vez a diferença entre quem estava vendo e quem foi selecionado —
  // como um "enviar" de mensageiro, não um botão por pessoa.
  async function confirmShareOccasion() {
    if (!occasionAberta) return;
    const { item, events, selecionados } = occasionAberta;
    const antes = activeViewersFor(item.id);
    const paraComecar = [...selecionados].filter((otherUid) => !antes.has(otherUid));
    const paraParar = [...antes].filter((otherUid) => !selecionados.has(otherUid));

    if (!paraComecar.length && !paraParar.length) { closeShareOccasionDialog(); return; }

    try {
      for (const otherUid of paraComecar) {
        const par = pairings.find((item) => item.otherUid === otherUid);
        await shareWriter.startShare({ occasion: item, events, viewerUid: otherUid, ownerAlias: par?.myAlias || "Alguém" });
      }
      for (const otherUid of paraParar) {
        const ativo = shares.find((share) => share.viewerUid === otherUid && share.occasionId === item.id);
        if (ativo) await shareWriter.stopShare(ativo.shareId);
      }
      showToast(selecionados.size ? `Compartilhando com ${selecionados.size} pessoa(s).` : "Compartilhamento encerrado.");
      closeShareOccasionDialog();
    } catch (falha) {
      console.error("Falha ao atualizar o compartilhamento do evento.", falha);
      showToast("Não foi possível atualizar agora. Tente de novo.");
    }
  }

  async function stopAllForOccasion() {
    if (!occasionAberta) return;
    const ativos = shares.filter((share) => share.occasionId === occasionAberta.item.id);
    if (!ativos.length) return;
    if (!window.confirm(`Parar de compartilhar este evento com todo mundo (${ativos.length})?`)) return;

    try {
      for (const share of ativos) await shareWriter.stopShare(share.shareId);
      showToast("Compartilhamento encerrado com todos.");
      closeShareOccasionDialog();
    } catch (falha) {
      console.error("Falha ao parar todos os compartilhamentos do evento.", falha);
      showToast("Não foi possível parar agora.");
    }
  }

  // `item` é a ocasião (state.occasions), `events` já vem filtrado para ela — quem
  // chama (occasions-ui.js) tem `state`, este módulo não.
  function openShareOccasionDialog(item, events) {
    occasionAberta = { item, events, selecionados: activeViewersFor(item.id) };
    if (nodes.shareOccasionTitle) nodes.shareOccasionTitle.textContent = `Compartilhar "${item.name}"`;
    renderShareOccasionPeople();
    if (!nodes.shareOccasionDialog.open) nodes.shareOccasionDialog.showModal();
  }

  function closeShareOccasionDialog() {
    occasionAberta = null;
    if (nodes.shareOccasionDialog?.open) nodes.shareOccasionDialog.close();
  }

  async function openPairingDialog() {
    erro("");
    nodes.pairingCodeInput.value = "";
    nodes.pairingCodeDisplay.textContent = "— — —";
    nodes.pairingCodeCountdown.textContent = "";
    limparQr();
    pararLeituraCamera();
    codigoAtual = null;
    pararContagem();
    if (!nodes.pairingDialog.open) nodes.pairingDialog.showModal();

    // Pré-preenche com o apelido já salvo — o campo não pergunta de novo a cada
    // pareamento, só permite trocar (e trocar propaga para quem já está conectado).
    try { nodes.pairingAlias.value = await shareWriter.getGlobalAlias(); }
    catch { nodes.pairingAlias.value = ""; /* sem apelido salvo ainda, ou falha ao buscar */ }
    apelidoSalvo = nodes.pairingAlias.value;
    atualizarBotaoApelido();
  }

  // "Salvar" só faz sentido quando o campo difere do que já está salvo — do
  // contrário fica sempre ativo mesmo sem nada novo para gravar.
  function atualizarBotaoApelido() {
    if (nodes.pairingAliasSave) nodes.pairingAliasSave.disabled = nodes.pairingAlias.value === apelidoSalvo;
  }

  async function salvarApelido() {
    try {
      await shareWriter.setGlobalAlias(nodes.pairingAlias.value);
      apelidoSalvo = nodes.pairingAlias.value;
      atualizarBotaoApelido();
      showToast("Apelido atualizado para quem você já adicionou.");
    } catch (falha) {
      console.error("Falha ao salvar o apelido.", falha);
      showToast("Não foi possível salvar agora.");
    }
  }

  function closePairingDialog() {
    pararContagem();
    pararLeituraCamera();
    limparQr();
    // O código continua válido no servidor até vencer; cancelar aqui evita deixar
    // código ativo que ninguém mais vai usar.
    if (codigoAtual) shareWriter.cancelPairingCode(codigoAtual.code).catch(() => {});
    codigoAtual = null;
    if (nodes.pairingDialog.open) nodes.pairingDialog.close();
  }

  function wire() {
    nodes.friendsAdd?.addEventListener("click", openPairingDialog);
    nodes.pairingAliasSave?.addEventListener("click", salvarApelido);
    nodes.pairingAlias?.addEventListener("input", atualizarBotaoApelido);
    nodes.pairingGenerate?.addEventListener("click", gerarCodigo);
    nodes.pairingScan?.addEventListener("click", lerComCamera);
    nodes.pairingScanCancel?.addEventListener("click", pararLeituraCamera);
    if (nodes.pairingScan) nodes.pairingScan.hidden = !cameraAvailable();
    document.addEventListener("visibilitychange", () => { if (document.hidden) pararLeituraCamera(); });
    // Formata enquanto digita: acaba com a dúvida de precisar ou não do traço — o
    // campo já mostra o formato certo a cada tecla. Com os 6 caracteres válidos,
    // conecta sozinho: não há mais botão para tocar depois de digitar.
    nodes.pairingCodeInput?.addEventListener("input", () => {
      nodes.pairingCodeInput.value = liveFormatPairingCode(nodes.pairingCodeInput.value);
      if (normalizePairingCode(nodes.pairingCodeInput.value)) usarCodigo();
    });
    nodes.pairingClose?.addEventListener("click", closePairingDialog);
    nodes.pairingDone?.addEventListener("click", closePairingDialog);
    nodes.closeShareOccasion?.addEventListener("click", closeShareOccasionDialog);
    nodes.shareOccasionConfirm?.addEventListener("click", confirmShareOccasion);
    nodes.shareOccasionStopAll?.addEventListener("click", stopAllForOccasion);
    nodes.closeSharedDetail?.addEventListener("click", closeSharedDetail);
    nodes.sharedDetailClose?.addEventListener("click", closeSharedDetail);
    nodes.sharedDetailInfo?.addEventListener("click", openFriendInfo);
    nodes.sharedDetailTabVendo?.addEventListener("click", () => { detalheAba = "vendo"; renderDetailBody(); });
    nodes.sharedDetailTabCompartilhando?.addEventListener("click", () => { detalheAba = "compartilhando"; renderDetailBody(); });
    nodes.closeFriendInfo?.addEventListener("click", closeFriendInfo);
    nodes.friendInfoClose?.addEventListener("click", closeFriendInfo);
    nodes.friendInfoUnfriend?.addEventListener("click", unfriendFromInfo);

    // O carimbo de frescor ("atualizado agora" → "desatualizado") muda só com o
    // relógio passando, sem nenhum dado novo chegar — por isso reavalia sozinho.
    // Reescrever com os mesmos nós é barato; sem entradas, não faz nada.
    setInterval(() => { if (sharedEntries.length) renderFriends(); }, 30000);
  }

  return {
    wire, setPairings, openPairingDialog, closePairingDialog,
    setShares, openShareOccasionDialog, closeShareOccasionDialog,
    setSharedEntries, renderFriends, renderOccasionSharePicker, startSharesFor,
  };
}
