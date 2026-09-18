import { formatPairingCode, normalizePairingCode, liveFormatPairingCode } from "../data/share-codes.js";
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
export function createShareUI({ nodes, getShareWriter, showToast, now = () => Date.now() }) {
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
  let codigoAtual = null;
  let contagem = null;

  function erro(mensagem) {
    nodes.pairingError.textContent = mensagem || "";
    nodes.pairingError.hidden = !mensagem;
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
    erro("");
    const code = normalizePairingCode(nodes.pairingCodeInput.value);
    if (!code) { erro(MOTIVOS.invalid); return; }

    nodes.pairingRedeem.disabled = true;
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
      nodes.pairingRedeem.disabled = false;
    }
  }

  async function desfazer(pairId, alias) {
    const certeza = window.confirm(`Desfazer amizade com ${alias || "essa pessoa"}? Qualquer compartilhamento em andamento com ela é encerrado.`);
    if (!certeza) return;

    try {
      await shareWriter.removePairing(pairId);
      showToast("Amizade desfeita.");
      closeSharedDetail();
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

  function renderPeople() {
    if (!nodes.sharingPeople) return;
    nodes.sharingPeople.replaceChildren();

    if (!pairings.length) {
      const vazio = document.createElement("p");
      vazio.className = "sharing-empty";
      vazio.textContent = "Nenhum amigo ainda.";
      nodes.sharingPeople.append(vazio);
      return;
    }

    for (const par of pairings) {
      const item = document.createElement("div");
      item.className = "sharing-person";

      const cabecalho = document.createElement("div");
      cabecalho.className = "sharing-person-head";
      const nome = document.createElement("strong");
      nome.textContent = par.alias || "Sem apelido";
      const estado = document.createElement("span");
      estado.className = "sharing-person-state";
      estado.textContent = estadoDe(par);
      cabecalho.append(nome, estado);

      const acoes = document.createElement("div");
      acoes.className = "sharing-person-actions";
      acoes.append(botao("Desfazer amizade", () => desfazer(par.pairId, par.alias)));

      item.append(cabecalho, acoes);
      nodes.sharingPeople.append(item);
    }
  }

  // Três estados, na ordem em que o roadmap pediu para não mentir sobre estar "ao
  // vivo": cache offline > desatualizado (mais de 5 min sem confirmação do
  // servidor) > atualizado. `fromCache` vem do metadata do SDK, não do relógio.
  function freshnessLabel(entry) {
    if (entry.fromCache) return `Sem conexão · mostrando o que chegou às ${formatClock(entry.receivedAtMs)}`;
    if (entry.view.updatedAtMs == null) return "Atualizado agora";
    if (now() - entry.view.updatedAtMs > 5 * 60 * 1000) return `Pode estar desatualizado · última atualização ${formatClock(entry.view.updatedAtMs)}`;
    return "Atualizado agora";
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
    const { view } = entry;

    const estado = document.createElement("p");
    estado.className = "sharing-person-state";
    estado.textContent = freshnessLabel(entry);
    container.append(estado);

    const periodo = document.createElement("p");
    periodo.className = "settings-description";
    periodo.textContent = `${view.occasion.name} · desde ${formatClock(view.occasion.startedAt)}`;
    if (view.occasion.endedAt != null) periodo.textContent += ` até ${formatClock(view.occasion.endedAt)}`;
    container.append(periodo);

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

    const lista = document.createElement("div");
    lista.className = "shared-entry-events";
    for (const dose of [...view.events].reverse()) {
      const linha = document.createElement("p");
      linha.className = "shared-entry-event";
      linha.textContent = `${formatClock(dose.consumedAt)} · ${dose.drinkIcon} ${dose.drinkName} · ${formatHistoryElapsed(dose.consumedAt, now())}`;
      lista.append(linha);
    }
    container.append(lista);
    return container;
  }

  // Corpo de "você compartilha com ela" — cada evento ativo, com um jeito de parar.
  function renderCompartilhandoPanel(otherUid) {
    const container = document.createElement("div");
    const ativos = compartilhandoSharesFor(otherUid);

    if (!ativos.length) {
      const vazio = document.createElement("p");
      vazio.className = "settings-description";
      vazio.textContent = "Nenhum compartilhamento ativo com essa pessoa agora.";
      container.append(vazio);
      return container;
    }

    for (const share of ativos) {
      const linha = document.createElement("div");
      linha.className = "sharing-person-head";
      const nome = document.createElement("strong");
      nome.textContent = share.occasionName || "Evento";
      linha.append(nome, botao("Parar de compartilhar", () => pararCompartilhamento(share.shareId), "danger-button"));
      container.append(linha);
    }
    return container;
  }

  // Sem nenhum dos dois lados ativo: só quando viraram amigos, ou o estado bruto do
  // pareamento para o raro caso legado que ainda não nasceu aceito pelos dois.
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

  // Só mostra abas quando os dois lados estão ativos ao mesmo tempo — senão, mostra
  // direto o que houver (ou o estado default, sem nada ativo).
  function renderDetailBody() {
    if (!nodes.sharedDetailBody || !detalheAberto) return;
    const par = pairings.find((item) => item.otherUid === detalheAberto);
    if (!par) return;

    const vendo = vendoEntryFor(detalheAberto);
    const compartilhando = compartilhandoSharesFor(detalheAberto).length > 0;
    const ambos = Boolean(vendo) && compartilhando;

    if (nodes.sharedDetailTabs) nodes.sharedDetailTabs.hidden = !ambos;
    if (ambos) {
      nodes.sharedDetailTabVendo?.setAttribute("aria-pressed", String(detalheAba === "vendo"));
      nodes.sharedDetailTabCompartilhando?.setAttribute("aria-pressed", String(detalheAba === "compartilhando"));
    }

    let conteudo;
    if (ambos) conteudo = detalheAba === "compartilhando" ? renderCompartilhandoPanel(detalheAberto) : renderVendoPanel(vendo);
    else if (vendo) conteudo = renderVendoPanel(vendo);
    else if (compartilhando) conteudo = renderCompartilhandoPanel(detalheAberto);
    else conteudo = renderDetailDefault(par);

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

  function unfriendFromDetail() {
    if (!detalheAberto) return;
    const par = pairings.find((item) => item.otherUid === detalheAberto);
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

      if (vendo) {
        const dot = document.createElement("span");
        dot.className = "share-status-dot share-status-dot--incoming";
        avatar.append(dot);
      }
      if (compartilhando) {
        const dot = document.createElement("span");
        dot.className = "share-status-dot share-status-dot--outgoing";
        avatar.append(dot);
      }

      const nome = document.createElement("span");
      nome.className = "share-person-name";
      nome.textContent = par.alias || "Sem apelido";

      botaoPessoa.append(avatar, nome);
      nodes.friendsGrid.append(botaoPessoa);
    }

    // O detalhe aberto também precisa refletir dado novo chegando, ou sumir se a
    // amizade acabou enquanto a pessoa olhava.
    if (detalheAberto) {
      const aindaExiste = pairings.some((item) => item.otherUid === detalheAberto);
      if (aindaExiste) renderDetailBody();
      else { closeSharedDetail(); showToast("Essa amizade foi desfeita."); }
    }
  }

  function setSharedEntries(lista) {
    sharedEntries = Array.isArray(lista) ? lista : [];
    if (nodes.homeShared) {
      const conectado = pairings.some((par) => par.acceptedByMe && par.acceptedByOther);
      nodes.homeShared.hidden = sharedEntries.length === 0 && !conectado;
      nodes.homeShared.textContent = sharedEntries.length === 1
        ? `👀 ${sharedEntries[0].view.ownerAlias || "Alguém"} está compartilhando ›`
        : sharedEntries.length > 1
          ? `👀 ${sharedEntries.length} pessoas compartilhando ›`
          : "👥 Amigos ›";
    }
    renderFriends();
  }

  function setPairings(lista) {
    pairings = Array.isArray(lista) ? lista : [];
    renderPeople();
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

  function renderShareOccasionPeople() {
    if (!nodes.shareOccasionGrid || !occasionAberta) return;
    nodes.shareOccasionGrid.replaceChildren();

    // Só quem aceitou dos dois lados pode receber um compartilhamento — estar numa
    // lista de pedidos pendentes não é a mesma coisa que estar conectado.
    const conectados = [...pairings]
      .filter((par) => par.acceptedByMe && par.acceptedByOther)
      .sort((a, b) => (a.alias || "").localeCompare(b.alias || "", "pt-BR"));

    const semNinguem = conectados.length === 0;
    if (nodes.shareOccasionEmpty) nodes.shareOccasionEmpty.hidden = !semNinguem;
    nodes.shareOccasionGrid.hidden = semNinguem;
    if (nodes.shareOccasionConfirm) nodes.shareOccasionConfirm.hidden = semNinguem;
    if (nodes.shareOccasionStopAll) {
      nodes.shareOccasionStopAll.hidden = activeViewersFor(occasionAberta.item.id).size === 0;
    }

    for (const par of conectados) {
      const botaoPessoa = document.createElement("button");
      botaoPessoa.type = "button";
      botaoPessoa.className = "share-person";
      botaoPessoa.setAttribute("aria-pressed", String(occasionAberta.selecionados.has(par.otherUid)));
      botaoPessoa.addEventListener("click", () => {
        if (occasionAberta.selecionados.has(par.otherUid)) occasionAberta.selecionados.delete(par.otherUid);
        else occasionAberta.selecionados.add(par.otherUid);
        renderShareOccasionPeople();
      });

      const avatar = document.createElement("span");
      avatar.className = "share-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = initial(par.alias);

      const nome = document.createElement("span");
      nome.className = "share-person-name";
      nome.textContent = par.alias || "Sem apelido";

      botaoPessoa.append(avatar, nome);
      nodes.shareOccasionGrid.append(botaoPessoa);
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
    codigoAtual = null;
    pararContagem();
    if (!nodes.pairingDialog.open) nodes.pairingDialog.showModal();

    // Pré-preenche com o apelido já salvo — o campo não pergunta de novo a cada
    // pareamento, só permite trocar (e trocar propaga para quem já está conectado).
    try { nodes.pairingAlias.value = await shareWriter.getGlobalAlias(); }
    catch { /* sem apelido salvo ainda, ou falha ao buscar: campo fica em branco */ }
  }

  async function salvarApelido() {
    try {
      await shareWriter.setGlobalAlias(nodes.pairingAlias.value);
      showToast("Apelido atualizado para quem você já adicionou.");
    } catch (falha) {
      console.error("Falha ao salvar o apelido.", falha);
      showToast("Não foi possível salvar agora.");
    }
  }

  function closePairingDialog() {
    pararContagem();
    // O código continua válido no servidor até vencer; cancelar aqui evita deixar
    // código ativo que ninguém mais vai usar.
    if (codigoAtual) shareWriter.cancelPairingCode(codigoAtual.code).catch(() => {});
    codigoAtual = null;
    if (nodes.pairingDialog.open) nodes.pairingDialog.close();
  }

  function wire() {
    nodes.sharingConnect?.addEventListener("click", openPairingDialog);
    nodes.pairingAliasSave?.addEventListener("click", salvarApelido);
    nodes.pairingGenerate?.addEventListener("click", gerarCodigo);
    nodes.pairingRedeem?.addEventListener("click", usarCodigo);
    // Formata enquanto digita: acaba com a dúvida de precisar ou não do traço — o
    // campo já mostra o formato certo a cada tecla.
    nodes.pairingCodeInput?.addEventListener("input", () => {
      nodes.pairingCodeInput.value = liveFormatPairingCode(nodes.pairingCodeInput.value);
    });
    nodes.pairingClose?.addEventListener("click", closePairingDialog);
    nodes.pairingDone?.addEventListener("click", closePairingDialog);
    nodes.closeShareOccasion?.addEventListener("click", closeShareOccasionDialog);
    nodes.shareOccasionConfirm?.addEventListener("click", confirmShareOccasion);
    nodes.shareOccasionStopAll?.addEventListener("click", stopAllForOccasion);
    nodes.closeSharedDetail?.addEventListener("click", closeSharedDetail);
    nodes.sharedDetailClose?.addEventListener("click", closeSharedDetail);
    nodes.sharedDetailUnfriend?.addEventListener("click", unfriendFromDetail);
    nodes.sharedDetailTabVendo?.addEventListener("click", () => { detalheAba = "vendo"; renderDetailBody(); });
    nodes.sharedDetailTabCompartilhando?.addEventListener("click", () => { detalheAba = "compartilhando"; renderDetailBody(); });

    // O carimbo de frescor ("atualizado agora" → "desatualizado") muda só com o
    // relógio passando, sem nenhum dado novo chegar — por isso reavalia sozinho.
    // Reescrever com os mesmos nós é barato; sem entradas, não faz nada.
    setInterval(() => { if (sharedEntries.length) renderFriends(); }, 30000);
  }

  return {
    wire, setPairings, openPairingDialog, closePairingDialog, renderPeople,
    setShares, openShareOccasionDialog, closeShareOccasionDialog,
    setSharedEntries, renderFriends,
  };
}
