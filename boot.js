/* Executado antes de qualquer leitura de dados ou configuração de segurança. */
"use strict";
(() => {
  const screen = document.querySelector("#startup-screen");
  const message = document.querySelector("#startup-message");
  const retry = document.querySelector("#startup-retry");
  const continueLink = document.querySelector("#startup-continue");
  const backup = document.querySelector("#startup-backup");
  const oldLink = document.querySelector("#startup-old");
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
    // O worker distingue estas páginas das versões antigas antes de autorizar migração.
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
    if (version?.version !== "2.1.10") {
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
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      const runtimeError = event => {
        if (event.filename === script.src) {
          window.removeEventListener("error", runtimeError);
          reject(new Error("Não foi possível abrir o app. Seus dados foram preservados. Tente novamente."));
        }
      };
      window.addEventListener("error", runtimeError);
      script.onload = () => { window.removeEventListener("error", runtimeError); resolve(); };
      script.onerror = () => { window.removeEventListener("error", runtimeError); reject(new Error("Não foi possível carregar o app. Tente novamente.")); };
      document.body.append(script);
    });
  }
  function showError(error) {
    failed = true;
    screen.hidden = false;
    document.body.classList.add("boot-pending");
    console.error("Falha ao preparar o FunTime.", error);
    const storageMessage = error.name === "QuotaExceededError"
      ? "Não há espaço no navegador para concluir a migração. Seus dados foram preservados. Tente novamente quando houver espaço disponível."
      : error.name === "SecurityError"
        ? "O navegador bloqueou o acesso ao armazenamento do app. Verifique as permissões e tente novamente."
        : null;
    show(storageMessage || error.message || "Não foi possível preparar o app. Seus dados não foram descartados.");
    continueLink.hidden = true;
    backup.hidden = true;
    retry.hidden = false;
    retry.disabled = false;
    retry.className = "primary-button";
    retry.textContent = "Tentar novamente";
    retry.onclick = () => window.location.reload();
  }
  globalThis.FunTimeBootFailure = showError;
  function chooseSetup(existing) {
    show(existing
      ? "Encontramos dados da versão anterior nesta instalação. Ao continuar, eles serão usados pelo FunTime 2 e a versão anterior deixará de alterá-los. Mantenha seu backup."
      : "Nenhum dado foi encontrado nesta instalação. Se você já usava o app, abra a versão anterior e faça um backup para restaurar aqui. Também é possível começar sem dados.");
    oldLink.hidden = false;
    retry.hidden = false;
    retry.textContent = existing ? "Continuar no FunTime 2" : "Começar sem dados";
    retry.className = existing ? "primary-button" : "secondary-button";
    backup.hidden = existing;
    return new Promise(resolve => {
      const finish = choice => {
        retry.hidden = true;
        backup.hidden = true;
        oldLink.hidden = true;
        show("Preparando o FunTime 2…");
        resolve(choice);
      };
      retry.onclick = () => finish(existing ? "transfer" : "new");
      backup.onclick = () => finish("backup");
    });
  }
  async function loadApp() {
    for (const src of ["./occasions.js", "./policies.js", "./ui.js", "./emoji-data.js", "./touch-debug.js", "./app.js", "./reset.js", "./occasions-ui.js", "./navigation.js"]) await loadScript(src);
    if (failed) return;
    booted = true;
    screen.hidden = true;
    document.body.classList.remove("boot-pending");
  }
  async function start() {
    if (!["/funtime/", "/funtime/index.html"].includes(window.location.pathname)) {
      throw new Error("Abra o FunTime 2 pelo endereço /funtime/. A versão anterior continua em /intervalo/.");
    }
    const installed = navigator.standalone === true || ["standalone", "fullscreen", "minimal-ui"].some(mode => matchMedia(`(display-mode: ${mode})`).matches);
    // A página de instalação não lê/grava dados privados nem mantém o bloqueio de escrita.
    if (!installed) { await loadApp(); return; }
    if (!navigator.locks) throw new Error("Este navegador precisa ser atualizado para migrar os dados com proteção contra janelas simultâneas.");
    if (!(await prepareWorker())) return;
    const origin = window.location.origin;
    if (!FunTimeTransition.readOwner(localStorage, origin)) {
      oldLink.hidden = false;
      await FunTimeReceiver.verifyBridge(navigator.serviceWorker, origin, request, false);
    }
    show("Feche as outras janelas do FunTime, inclusive a versão anterior, para continuar aqui.");
    // Uma janela escritora por origem. As demais aguardam e carregam o estado mais recente.
    await navigator.locks.request(FunTimeTransition.writerLock, async () => {
      try {
        if (!(await prepareWorker())) return;
        const before = FunTimeReceiver.inspect(localStorage, origin);
        if (!before.owner) {
          await FunTimeReceiver.verifyBridge(navigator.serviceWorker, origin, request, before.existing);
          const choice = await chooseSetup(before.existing);
          FunTimeReceiver.unchanged(localStorage, before.values);
          // A posse somente é gravada depois de preparar e reler os dados sob o lock.
          const snapshot = await FunTimeReceiver.prepare(localStorage, origin);
          FunTimeReceiver.claim(localStorage, origin, snapshot);
          globalThis.FunTimeRestoreRequested = choice === "backup";
          // A nova instalação exige o desbloqueio normal, sem herdar sessão da v1.
          globalThis.FunTimeSessionReady = false;
          try {
            sessionStorage.removeItem("funtime-security-session-v1");
            sessionStorage.removeItem("intervalo-security-session-v1");
          } catch { /* Sem sessão confiável, manter desbloqueio obrigatório. */ }
        } else {
          await FunTimeReceiver.prepare(localStorage, origin);
          globalThis.FunTimeSessionReady = true;
        }
        window.addEventListener("storage", event => {
          if (FunTimeMigration.oldKeys.includes(event.key) || event.key === FunTimeTransition.ownerKey || event.key === null) window.location.reload();
        });
        await loadApp();
      } catch (error) { showError(error); }
      // O navegador libera o Web Lock ao destruir a página. Não liberar no background.
      await new Promise(() => {});
    });
  }
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  start().catch(showError);
})();
