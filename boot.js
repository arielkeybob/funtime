/* Executado antes de qualquer leitura de dados ou configuração de segurança. */
"use strict";
(() => {
  const screen = document.querySelector("#startup-screen");
  const message = document.querySelector("#startup-message");
  const retry = document.querySelector("#startup-retry");
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
      if (event.data?.type === "FUNTIME_BOOT_CHECK") event.ports[0]?.postMessage({ protocol: 1 });
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
    if (version?.version !== "1.15.0") {
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
    show(error.message || "Não foi possível preparar o app. Seus dados não foram descartados.");
    retry.hidden = false;
    retry.textContent = "Tentar novamente";
    retry.onclick = () => window.location.reload();
  }
  globalThis.FunTimeBootFailure = showError;
  async function loadApp() {
    for (const src of ["./policies.js", "./ui.js", "./emoji-data.js", "./app.js", "./reset.js"]) await loadScript(src);
    if (failed) return;
    booted = true;
    screen.hidden = true;
    document.body.classList.remove("boot-pending");
  }
  async function start() {
    const installed = navigator.standalone === true || ["standalone", "fullscreen", "minimal-ui"].some(mode => matchMedia(`(display-mode: ${mode})`).matches);
    // A página de instalação não lê/grava dados privados nem mantém o bloqueio de escrita.
    if (!installed) { await loadApp(); return; }
    if (!navigator.locks) throw new Error("Este navegador precisa ser atualizado para migrar os dados com proteção contra janelas simultâneas.");
    if (!(await prepareWorker())) return;
    show("Se o FunTime estiver aberto em outra janela, feche-a para continuar aqui.");
    // Uma janela escritora por origem. As demais aguardam e carregam o estado mais recente.
    await navigator.locks.request("funtime-app-writer-v1", async () => {
      try {
        // Revalidar depois de aguardar: outra janela pode ter concluído a migração.
        if (!(await prepareWorker())) return;
        show("Preparando seus dados…");
        FunTimeMigration.migrate(localStorage);
        globalThis.FunTimeSessionReady = false;
        try { FunTimeMigration.migrateSession(sessionStorage); globalThis.FunTimeSessionReady = true; }
        catch { /* Sem sessão confiável, o app exige o desbloqueio normal. */ }
        window.addEventListener("storage", event => {
          if (FunTimeMigration.oldKeys.includes(event.key)) window.location.reload();
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
