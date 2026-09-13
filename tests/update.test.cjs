const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app.js", "utf8");
const code = source.slice(
  source.indexOf("function showUpdateAvailable("),
  source.indexOf("function watchServiceWorkerRegistration("),
);

function createContext(registration) {
  const notices = [];
  const copy = {};
  const context = vm.createContext({
    APP_VERSION: "2.1.31",
    IS_STANDALONE_APP: true,
    state: {
      serviceWorkerRegistration: registration,
      updateCheckInFlight: false,
      lastUpdateCheckAt: 0,
      waitingServiceWorker: null,
    },
    document: { body: { classList: { contains: () => false } } },
    navigator: { onLine: true },
    console,
    updateToast: { hidden: true, querySelector: () => copy },
    applyUpdateButton: { disabled: false, textContent: "Atualizar" },
    checkAppUpdateButton: { disabled: false, textContent: "Verificar atualizações" },
    getWaitingWorkerVersion: async () => null,
    showAppNotification: (message, options) => notices.push({ message, options }),
  });
  vm.runInContext(code, context);
  return { context, notices };
}

test("verificação manual recupera o worker aguardando após fechar o aviso", async () => {
  const worker = {};
  const registration = { waiting: worker, update: async () => assert.fail("não deveria consultar a rede") };
  const { context } = createContext(registration);

  await context.checkForAppUpdateManually();

  assert.equal(context.updateToast.hidden, false);
  assert.equal(context.state.waitingServiceWorker, worker);
});

test("verificação manual informa quando o app já está atualizado", async () => {
  const registration = { waiting: null, installing: null, update: async () => {} };
  const { context, notices } = createContext(registration);

  await context.checkForAppUpdateManually();

  assert.match(notices[0].message, /versão mais recente disponível/);
  assert.equal(context.checkAppUpdateButton.disabled, false);
  assert.equal(context.checkAppUpdateButton.textContent, "Verificar atualizações");
});

test("verificação manual distingue falha de ausência de atualização", async () => {
  const registration = { waiting: null, installing: null, update: async () => { throw new Error("offline"); } };
  const { context, notices } = createContext(registration);
  context.navigator.onLine = false;

  await context.checkForAppUpdateManually();

  assert.equal(notices[0].options.type, "error");
  assert.match(notices[0].message, /Confira a conexão/);
});
