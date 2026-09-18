import { formatPairingCode, normalizePairingCode, pairingConfirmationCode } from "../data/share-codes.js";

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
  let occasionAberta = null;
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

  function setPairings(lista) {
    pairings = Array.isArray(lista) ? lista : [];
    renderPeople();
    if (nodes.shareOccasionDialog?.open) renderShareOccasionPeople();
  }

  function setShares(lista) {
    shares = Array.isArray(lista) ? lista : [];
    if (nodes.shareOccasionDialog?.open) renderShareOccasionPeople();
  }

  async function startShareWith(pairing) {
    if (!occasionAberta) return;
    try {
      await shareWriter.startShare({
        occasion: occasionAberta.item,
        events: occasionAberta.events,
        viewerUid: pairing.otherUid,
        ownerAlias: pairing.myAlias || "Alguém",
      });
      showToast(`Compartilhando com ${pairing.alias || "essa pessoa"}.`);
    } catch (falha) {
      console.error("Falha ao compartilhar o evento.", falha);
      showToast("Não foi possível compartilhar agora.");
    }
  }

  async function stopShareWith(shareId, alias) {
    try {
      await shareWriter.stopShare(shareId);
      showToast(`Parou de compartilhar com ${alias || "essa pessoa"}.`);
    } catch (falha) {
      console.error("Falha ao parar o compartilhamento.", falha);
      showToast("Não foi possível parar agora.");
    }
  }

  function renderShareOccasionPeople() {
    if (!nodes.shareOccasionPeople || !occasionAberta) return;
    nodes.shareOccasionPeople.replaceChildren();

    // Só quem aceitou dos dois lados pode receber um compartilhamento — estar numa
    // lista de pedidos pendentes não é a mesma coisa que estar conectado.
    const conectados = pairings.filter((par) => par.acceptedByMe && par.acceptedByOther);

    if (!conectados.length) {
      const vazio = document.createElement("p");
      vazio.className = "sharing-empty";
      vazio.textContent = "Conecte-se com alguém primeiro, nas Configurações.";
      nodes.shareOccasionPeople.append(vazio);
      return;
    }

    for (const par of conectados) {
      const ativo = shares.find((share) => share.viewerUid === par.otherUid && share.occasionId === occasionAberta.item.id);

      const item = document.createElement("div");
      item.className = "sharing-person";

      const cabecalho = document.createElement("div");
      cabecalho.className = "sharing-person-head";
      const nome = document.createElement("strong");
      nome.textContent = par.alias || "Sem apelido";
      const estado = document.createElement("span");
      estado.className = "sharing-person-state";
      estado.textContent = ativo ? "Vendo agora" : "";
      cabecalho.append(nome, estado);

      const acoes = document.createElement("div");
      acoes.className = "sharing-person-actions";
      acoes.append(ativo
        ? botao("Parar de compartilhar", () => stopShareWith(ativo.shareId, par.alias), "settings-secondary-button")
        : botao("Compartilhar", () => startShareWith(par), "settings-primary-action"));

      item.append(cabecalho, acoes);
      nodes.shareOccasionPeople.append(item);
    }
  }

  // `item` é a ocasião (state.occasions), `events` já vem filtrado para ela — quem
  // chama (occasions-ui.js) tem `state`, este módulo não.
  function openShareOccasionDialog(item, events) {
    occasionAberta = { item, events };
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
    nodes.shareOccasionClose?.addEventListener("click", closeShareOccasionDialog);
    nodes.closeShareOccasion?.addEventListener("click", closeShareOccasionDialog);
  }

  return {
    wire, setPairings, openPairingDialog, closePairingDialog, renderPeople,
    setShares, openShareOccasionDialog, closeShareOccasionDialog,
  };
}
