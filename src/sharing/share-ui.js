import { formatPairingCode, normalizePairingCode, pairingConfirmationCode } from "../data/share-codes.js";
import { formatClock, formatHistoryElapsed } from "../format/datetime.js";

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
  let codigoAtual = null;
  let contagem = null;
  let confirmando = null;

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

  async function usarCodigo() {
    erro("");
    const code = normalizePairingCode(nodes.pairingCodeInput.value);
    if (!code) { erro(MOTIVOS.invalid); return; }

    nodes.pairingRedeem.disabled = true;
    try {
      const resultado = await shareWriter.redeemPairingCode(code, nodes.pairingAlias.value.trim());
      if (!resultado.ok) { erro(MOTIVOS[resultado.reason] || MOTIVOS.invalid); return; }

      nodes.pairingCodeInput.value = "";
      showToast("Pedido enviado. A outra pessoa precisa aceitar no aparelho dela.");
      await abrirConfirmacao(resultado.pairId, { somenteConferir: true });
    } catch (falha) {
      console.error("Falha ao usar o código de pareamento.", falha);
      erro("Não foi possível conectar agora.");
    } finally {
      nodes.pairingRedeem.disabled = false;
    }
  }

  // O número é derivado do par e igual nos dois aparelhos: comparar em voz alta é o
  // que impede aceitar outra pessoa que tenha adivinhado um código ativo.
  async function abrirConfirmacao(pairId, { somenteConferir = false } = {}) {
    const par = pairings.find((item) => item.pairId === pairId);
    confirmando = { pairId, somenteConferir };

    nodes.pairingConfirmNumber.textContent = await pairingConfirmationCode(pairId);
    nodes.pairingConfirmWho.textContent = somenteConferir
      ? "Confira com a outra pessoa antes de ela aceitar."
      : `${par?.alias || "Alguém"} quer se conectar com você.`;
    nodes.pairingConfirmAccept.hidden = somenteConferir;
    if (!nodes.pairingConfirmDialog.open) nodes.pairingConfirmDialog.showModal();
  }

  async function aceitarConfirmacao() {
    if (!confirmando) return;
    const { pairId } = confirmando;
    confirmando = null;
    nodes.pairingConfirmDialog.close();

    try {
      await shareWriter.acceptPairing(pairId, nodes.pairingAlias.value.trim());
      showToast("Conectado. Estar conectado não mostra nada — compartilhar é por evento.");
    } catch (falha) {
      console.error("Falha ao aceitar o pareamento.", falha);
      showToast("Não foi possível aceitar agora.");
    }
  }

  async function desfazer(pairId, alias) {
    const certeza = window.confirm(`Desfazer a conexão com ${alias || "essa pessoa"}? Qualquer compartilhamento em andamento com ela é encerrado.`);
    if (!certeza) return;

    try {
      await shareWriter.removePairing(pairId);
      showToast("Conexão desfeita.");
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
      vazio.textContent = "Ninguém conectado ainda.";
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
      // Só aparece para aceitar quem ainda não aceitou — e sempre passando pela
      // conferência do número.
      if (!par.acceptedByMe) acoes.append(botao("Conferir e aceitar", () => abrirConfirmacao(par.pairId)));
      acoes.append(botao("Desfazer conexão", () => desfazer(par.pairId, par.alias)));

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

  // Preenche o corpo do diálogo de detalhe com o que antes ficava sempre visível
  // no cartão: período, carimbo de frescor, totais e a lista cronológica de doses.
  function renderSharedDetailBody(entry) {
    if (!nodes.sharedDetailBody) return;
    nodes.sharedDetailBody.replaceChildren();
    const { view } = entry;

    const estado = document.createElement("p");
    estado.className = "sharing-person-state";
    estado.textContent = freshnessLabel(entry);
    nodes.sharedDetailBody.append(estado);

    const periodo = document.createElement("p");
    periodo.className = "settings-description";
    periodo.textContent = `${view.occasion.name} · desde ${formatClock(view.occasion.startedAt)}`;
    if (view.occasion.endedAt != null) periodo.textContent += ` até ${formatClock(view.occasion.endedAt)}`;
    nodes.sharedDetailBody.append(periodo);

    for (const total of view.totals) {
      const linha = document.createElement("p");
      linha.className = "occasion-count";
      linha.textContent = `${total.icon} ${total.name} · ${total.count} registro(s)`;
      nodes.sharedDetailBody.append(linha);
    }

    if (view.truncated) {
      const aviso = document.createElement("p");
      aviso.className = "settings-description";
      aviso.textContent = `Mostrando os registros mais recentes de ${view.eventCount} no total.`;
      nodes.sharedDetailBody.append(aviso);
    }

    const lista = document.createElement("div");
    lista.className = "shared-entry-events";
    for (const dose of [...view.events].reverse()) {
      const linha = document.createElement("p");
      linha.className = "shared-entry-event";
      linha.textContent = `${formatClock(dose.consumedAt)} · ${dose.drinkIcon} ${dose.drinkName} · ${formatHistoryElapsed(dose.consumedAt, now())}`;
      lista.append(linha);
    }
    nodes.sharedDetailBody.append(lista);
  }

  function openSharedDetail(ownerUid) {
    const entry = sharedEntries.find((item) => item.ownerUid === ownerUid);
    if (!entry) return;
    detalheAberto = ownerUid;
    if (nodes.sharedDetailTitle) nodes.sharedDetailTitle.textContent = entry.view.ownerAlias || "Alguém";
    renderSharedDetailBody(entry);
    if (!nodes.sharedDetailDialog.open) nodes.sharedDetailDialog.showModal();
  }

  function closeSharedDetail() {
    detalheAberto = null;
    if (nodes.sharedDetailDialog?.open) nodes.sharedDetailDialog.close();
  }

  // Grade compacta em vez de cartões cheios: cada pessoa é só um avatar com a
  // inicial e o nome; o histórico completo só aparece ao tocar (openSharedDetail).
  function renderSharedEntries() {
    if (!nodes.sharedEntriesGrid) return;
    nodes.sharedEntriesGrid.replaceChildren();
    if (nodes.sharedEmptyState) nodes.sharedEmptyState.hidden = sharedEntries.length > 0;

    for (const entry of [...sharedEntries].sort((a, b) => (a.view.ownerAlias || "").localeCompare(b.view.ownerAlias || "", "pt-BR"))) {
      const botaoPessoa = document.createElement("button");
      botaoPessoa.type = "button";
      botaoPessoa.className = "share-person is-live";
      botaoPessoa.addEventListener("click", () => openSharedDetail(entry.ownerUid));

      const avatar = document.createElement("span");
      avatar.className = "share-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = initial(entry.view.ownerAlias);

      const nome = document.createElement("span");
      nome.className = "share-person-name";
      nome.textContent = entry.view.ownerAlias || "Alguém";

      botaoPessoa.append(avatar, nome);
      nodes.sharedEntriesGrid.append(botaoPessoa);
    }

    // O detalhe aberto também precisa refletir dado novo chegando, ou sumir se o
    // compartilhamento acabou enquanto a pessoa olhava.
    if (detalheAberto) {
      const aberto = sharedEntries.find((item) => item.ownerUid === detalheAberto);
      if (aberto) renderSharedDetailBody(aberto);
      else { closeSharedDetail(); showToast("Esse compartilhamento foi encerrado."); }
    }
  }

  // Lista informativa de conexões — sem ações aqui (gerenciar continua em
  // Configurações); é só para responder "com quem estou conectado", compacta.
  function renderSharedPairings() {
    if (!nodes.sharedPairingsGrid) return;
    nodes.sharedPairingsGrid.replaceChildren();
    if (nodes.sharedPairingsEmpty) nodes.sharedPairingsEmpty.hidden = pairings.length > 0;

    for (const par of [...pairings].sort((a, b) => (a.alias || "").localeCompare(b.alias || "", "pt-BR"))) {
      const item = document.createElement("div");
      item.className = "share-person";

      const avatar = document.createElement("span");
      avatar.className = "share-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = initial(par.alias);

      const nome = document.createElement("span");
      nome.className = "share-person-name";
      nome.textContent = par.alias || "Sem apelido";

      const estado = document.createElement("span");
      estado.className = "share-person-state-badge";
      estado.textContent = estadoDe(par);

      item.append(avatar, nome, estado);
      nodes.sharedPairingsGrid.append(item);
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
          : "👥 Pessoas conectadas ›";
    }
    renderSharedEntries();
  }

  function setPairings(lista) {
    pairings = Array.isArray(lista) ? lista : [];
    renderPeople();
    renderSharedPairings();
    if (nodes.shareOccasionDialog?.open) renderShareOccasionPeople();
    // O botão da Home também depende de haver conexão, não só de share ativo.
    setSharedEntries(sharedEntries);
  }

  function setShares(lista) {
    shares = Array.isArray(lista) ? lista : [];
    if (nodes.shareOccasionDialog?.open) renderShareOccasionPeople();
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

  function openPairingDialog() {
    erro("");
    nodes.pairingCodeInput.value = "";
    nodes.pairingCodeDisplay.textContent = "— — —";
    nodes.pairingCodeCountdown.textContent = "";
    codigoAtual = null;
    pararContagem();
    if (!nodes.pairingDialog.open) nodes.pairingDialog.showModal();
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
    nodes.pairingGenerate?.addEventListener("click", gerarCodigo);
    nodes.pairingRedeem?.addEventListener("click", usarCodigo);
    nodes.pairingClose?.addEventListener("click", closePairingDialog);
    nodes.pairingDone?.addEventListener("click", closePairingDialog);
    nodes.pairingConfirmAccept?.addEventListener("click", aceitarConfirmacao);
    nodes.pairingConfirmReject?.addEventListener("click", () => { confirmando = null; nodes.pairingConfirmDialog.close(); });
    nodes.pairingConfirmClose?.addEventListener("click", () => { confirmando = null; nodes.pairingConfirmDialog.close(); });
    nodes.closeShareOccasion?.addEventListener("click", closeShareOccasionDialog);
    nodes.shareOccasionConfirm?.addEventListener("click", confirmShareOccasion);
    nodes.shareOccasionStopAll?.addEventListener("click", stopAllForOccasion);
    nodes.closeSharedDetail?.addEventListener("click", closeSharedDetail);
    nodes.sharedDetailClose?.addEventListener("click", closeSharedDetail);

    // O carimbo de frescor ("atualizado agora" → "desatualizado") muda só com o
    // relógio passando, sem nenhum dado novo chegar — por isso reavalia sozinho.
    // Reescrever com os mesmos nós é barato; sem entradas, não faz nada.
    setInterval(() => { if (sharedEntries.length) renderSharedEntries(); }, 30000);
  }

  return {
    wire, setPairings, openPairingDialog, closePairingDialog, renderPeople,
    setShares, openShareOccasionDialog, closeShareOccasionDialog,
    setSharedEntries, renderSharedEntries,
  };
}
