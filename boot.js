/* Executado antes de qualquer leitura de dados ou configuração de segurança. */
"use strict";
(() => {
  const screen = document.querySelector("#startup-screen");
  const message = document.querySelector("#startup-message");
  const retry = document.querySelector("#startup-retry");
  const download = document.querySelector("#startup-download");
  const DATA_STORAGE_KEY = "funtime-v1-data";
  let booted = false;
  let failed = false;
  function show(text) { message.textContent = text; }
  function request(worker, type, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error("A atualização ainda não está pronta. Tente novamente com conexão.")); }, timeout);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      worker.postMessage({ type }, [channel.port2]);
    });
  }
  if ("serviceWorker" in navigator) {
    // Responde ao Service Worker se esta janela já roda o boot atual, antes de liberar uma atualização.
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data?.type === "FUNTIME_BOOT_CHECK") event.ports[0]?.postMessage({ protocol: 2 });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!booted) window.location.reload();
    });
  }
  async function prepareWorker() {
    if (!("serviceWorker" in navigator)) throw new Error("Abra o app em um navegador atualizado, usando HTTPS ou localhost.");
    const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
    const worker = registration.active;
    if (!worker) {
      await navigator.serviceWorker.ready;
      window.location.reload();
      return false;
    }
    const version = await request(worker, "GET_VERSION");
    if (version?.version !== "2.18.0") {
      // Não ativar uma atualização sem a ação explícita do usuário.
      await registration.update();
      show("Há uma atualização necessária para abrir o FunTime.");
      const offer = () => {
        if (!registration.waiting) return;
        retry.hidden = false;
        retry.textContent = "Atualizar";
        retry.onclick = () => { retry.disabled = true; registration.waiting?.postMessage({ type: "SKIP_WAITING" }); };
      };
      registration.addEventListener("updatefound", () => registration.installing?.addEventListener("statechange", offer));
      registration.installing?.addEventListener("statechange", offer);
      offer();
      return false;
    }
    const response = await request(worker, "FUNTIME_PREPARE");
    if (!response?.ready) throw new Error("Não foi possível atualizar todas as janelas do app. Tente novamente.");
    return true;
  }
  function loadScript(src, { module = false } = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      if (module) script.type = "module";
      const runtimeError = event => {
        if (event.filename === script.src) {
          window.removeEventListener("error", runtimeError);
          const corrupted = event.error?.name === "FunTimeDataCorruptedError";
          const failure = new Error(corrupted
            ? "Não foi possível ler seus dados. Eles não foram apagados, mas o app não conseguiu abri-los."
            : "Não foi possível abrir o app. Seus dados foram preservados. Tente novamente.");
          if (corrupted) failure.name = "FunTimeDataCorruptedError";
          reject(failure);
        }
      };
      window.addEventListener("error", runtimeError);
      script.onload = () => { window.removeEventListener("error", runtimeError); resolve(); };
      script.onerror = () => { window.removeEventListener("error", runtimeError); reject(new Error("Não foi possível carregar o app. Tente novamente.")); };
      document.body.append(script);
    });
  }
  function downloadRawData() {
    let raw;
    try { raw = localStorage.getItem(DATA_STORAGE_KEY); } catch (error) { return; }
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `FunTime-dados-brutos-${Date.now()}.json`;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function showError(error) {
    failed = true;
    screen.hidden = false;
    document.body.classList.add("boot-pending");
    console.error("Falha ao preparar o FunTime.", error);
    const storageMessage = error.name === "QuotaExceededError"
      ? "Não há espaço no navegador para concluir a operação. Seus dados foram preservados. Tente novamente quando houver espaço disponível."
      : error.name === "SecurityError"
        ? "O navegador bloqueou o acesso ao armazenamento do app. Verifique as permissões e tente novamente."
        : null;
    show(storageMessage || error.message || "Não foi possível preparar o app. Seus dados não foram descartados.");
    // Recarregar sozinho não resolve dado corrompido: oferece uma cópia bruta
    // antes de qualquer outra tentativa, sem tentar corrigir o conteúdo.
    if (error.name === "FunTimeDataCorruptedError") {
      download.hidden = false;
      download.onclick = downloadRawData;
    } else {
      download.hidden = true;
      download.onclick = null;
    }
    retry.hidden = false;
    retry.disabled = false;
    retry.className = "primary-button";
    retry.textContent = "Tentar novamente";
    retry.onclick = () => window.location.reload();
  }
  globalThis.FunTimeBootFailure = showError;
  async function loadApp() {
    // Scripts convertidos em módulo ES importam de src/ e uns dos outros diretamente e
    // publicam em globalThis o que os scripts ainda clássicos leem como identificador
    // solto. Ver docs/specs/0017 e docs/specs/0019.
    const moduleScripts = new Set(["./policies.js", "./ui.js", "./emoji-data.js", "./touch-debug.js", "./app.js", "./reset.js", "./occasions-ui.js", "./navigation.js"]);
    for (const src of ["./occasions.js", "./policies.js", "./ui.js", "./emoji-data.js", "./touch-debug.js", "./app.js", "./reset.js", "./occasions-ui.js", "./navigation.js"]) {
      await loadScript(src, { module: moduleScripts.has(src) });
    }
    if (failed) return;
    booted = true;
    screen.hidden = true;
    document.body.classList.remove("boot-pending");
  }
  async function start() {
    if (!["/funtime/", "/funtime/index.html"].includes(window.location.pathname)) {
      throw new Error("Abra o FunTime pelo endereço /funtime/.");
    }
    const installed = navigator.standalone === true || ["standalone", "fullscreen", "minimal-ui"].some(mode => matchMedia(`(display-mode: ${mode})`).matches);
    // A página de instalação não lê/grava dados privados nem mantém o bloqueio de escrita.
    if (!installed) { await loadApp(); return; }
    if (!navigator.locks) throw new Error("Este navegador precisa ser atualizado para usar o FunTime com proteção contra janelas simultâneas.");
    show("Abrindo o FunTime…");
    let waitingForWriter = true;
    const writerWaitNotice = setTimeout(() => {
      if (waitingForWriter) show("O FunTime já está aberto em outra janela. Feche as outras janelas para continuar aqui.");
    }, 800);
    // Uma janela escritora por origem. As demais aguardam e carregam o estado mais recente ao assumir.
    try {
      await navigator.locks.request("funtime-writer-lock", async () => {
        waitingForWriter = false;
        clearTimeout(writerWaitNotice);
        try {
          if (!(await prepareWorker())) return;
          await loadApp();
        } catch (error) { showError(error); }
        // O navegador libera o Web Lock ao destruir a página. Não liberar no background.
        await new Promise(() => {});
      });
    } finally {
      waitingForWriter = false;
      clearTimeout(writerWaitNotice);
    }
  }
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  start().catch(showError);
})();
