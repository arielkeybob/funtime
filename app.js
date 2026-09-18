import { formatTime, formatClock, formatHistoryElapsed, formatInterval } from "./src/format/datetime.js";
import { resolveCountingMode } from "./src/format/counting-mode.js";
import { derEcdsaSignatureToRaw } from "./src/security/webauthn-signature.js";
import { derivePinHash, PIN_PBKDF2_ITERATIONS } from "./src/security/pin-crypto.js";
import { createSecurityConfig, PIN_LENGTH, PIN_LOCKOUT_ATTEMPTS, PIN_LOCKOUT_MS } from "./src/security/config.js";
import { createSecurityLock } from "./src/security/lock.js";
import { commit as commitToStorage } from "./src/data/store.js";
import { createFirebaseAuth } from "./src/auth/firebase-auth.js";
import { summarizeOccasionDoses } from "./src/occasions/summary.js";
import { createFirestoreSync } from "./src/data/firestore-sync.js";
import { createShareWriter } from "./src/data/share-writer.js";
import { createSharedView } from "./src/data/shared-view.js";
import { createShareUI } from "./src/sharing/share-ui.js";
import { getFirebaseConfig, isFirebaseConfigured } from "./src/data/firestore-config.js";
import { wireDialogDismissal } from "./src/ui/dialogs.js";
import { createDurationPicker, createWheelPicker, setWheelPickerValue } from "./src/ui/wheel-picker.js";
import { createFieldErrorController, createFormErrorController } from "./src/ui/field-errors.js";
import { createDrinkReorderController } from "./src/ui/drink-reorder.js";
import { createIconCatalog } from "./src/ui/icon-catalog.js";
import { createEventDialog } from "./src/history/event-dialog.js";
import { createDrinkInteractions } from "./src/drinks/interactions.js";
import { initEasterEggs } from "./src/easter-eggs/index.js";
import { validateDrinkDraft } from "./src/drinks/validate.js";
import { EMOJI_GROUPS } from "./emoji-data.js";

const IS_STANDALONE_APP = (
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  window.navigator.standalone === true
);

let deferredInstallPrompt = null;
let browserInstallPending = false;
let browserInstallVerified = false;
let browserInstallCompleted = false;
let browserInstallRevision = 0;
let browserInstallPollTimer = null;
// Barreira visual para visitantes casuais, não autenticação.
const BROWSER_INSTALL_PASSWORD = "SenhadoFunTime";
let browserInstallUnlocked = false;

async function unlockBrowserInstall(event) {
  if (browserInstallUnlocked || event.target.value !== BROWSER_INSTALL_PASSWORD) return;
  browserInstallUnlocked = true;
  event.target.value = "";
  await refreshBrowserInstallUI();
  const button = document.querySelector("#browser-install-button");
  if (button && !button.hidden) button.focus();
}

function stopBrowserInstallPolling() {
  window.clearTimeout(browserInstallPollTimer);
  browserInstallPollTimer = null;
}

function confirmBrowserInstall() {
  browserInstallRevision++;
  browserInstallVerified = true;
  browserInstallPending = false;
  deferredInstallPrompt = null;
  stopBrowserInstallPolling();
  setBrowserInstallUI("installed");
}

function pollBrowserInstall(remaining = 30) {
  stopBrowserInstallPolling();
  if (!browserInstallPending || remaining <= 0) return;
  browserInstallPollTimer = window.setTimeout(async () => {
    await refreshBrowserInstallUI();
    if (browserInstallPending) pollBrowserInstall(remaining - 1);
  }, 2000);
}

function getBrowserInstallGuidance() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isFirefox = /Firefox\//i.test(ua);
  const isSafari = /Safari\//i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua);

  if (isIOS) {
    return "Toque em Compartilhar e escolha “Adicionar à Tela de Início”.";
  }

  if (isAndroid) {
    return "Abra o menu do navegador (⋮) e toque em “Instalar app” ou “Adicionar à tela inicial”.";
  }

  if (isFirefox) {
    return "Este navegador pode não oferecer instalação de PWA. Tente Chrome, Edge ou outro navegador compatível.";
  }

  if (isMac && isSafari) {
    return "No Safari, use Arquivo → Adicionar ao Dock.";
  }

  return "Procure “Instalar app” na barra de endereço ou no menu do navegador.";
}

function setBrowserInstallUI(mode) {
  const button = document.querySelector("#browser-install-button");
  const status = document.querySelector("#browser-install-status");
  const statusTitle = document.querySelector("#browser-install-status-title");
  const statusText = document.querySelector("#browser-install-status-text");
  const guidance = document.querySelector("#browser-install-guidance");
  const guidanceText = document.querySelector("#browser-install-guidance-text");
  const lead = document.querySelector("#browser-gate-lead");
  const access = document.querySelector("#browser-install-access");

  if (!button || !status || !statusTitle || !statusText || !guidance || !guidanceText) return;

  button.hidden = true;
  button.disabled = false;
  status.hidden = true;
  guidance.hidden = true;
  const locked = !browserInstallUnlocked && mode !== "installed" && mode !== "pending";
  if (access) access.hidden = !locked;
  if (lead) {
    lead.hidden = mode === "installed" || mode === "pending";
    lead.textContent = !locked && (mode === "ready" || mode === "opening")
      ? "Instale o FunTime e depois abra pelo novo ícone."
      : "Anote bebidas e acompanhe seus intervalos.";
  }

  if (locked) return;

  if (mode === "ready") {
    button.hidden = false;
    button.textContent = "Instalar FunTime";
    return;
  }

  if (mode === "opening") {
    button.hidden = false;
    button.disabled = true;
    button.textContent = "Abrindo…";
    return;
  }

  if (mode === "pending") {
    status.hidden = false;
    statusTitle.textContent = "Instalação iniciada";
    statusText.textContent = "Aguarde o ícone do FunTime aparecer no aparelho. Depois, abra por ele.";
    return;
  }

  if (mode === "installed") {
    status.hidden = false;
    statusTitle.textContent = "App já instalado";
    statusText.textContent = "Procure pelo ícone na lista de aplicativos e abra por lá.";
    return;
  }

  guidance.hidden = false;
  guidanceText.textContent = getBrowserInstallGuidance();
}

async function detectInstalledPwa() {
  if (typeof navigator.getInstalledRelatedApps !== "function") {
    return null;
  }

  try {
    const relatedApps = await navigator.getInstalledRelatedApps();
    const manifestUrl = new URL("./manifest.webmanifest", window.location.href).href;
    const appId = new URL("/funtime/", window.location.href).href;
    return relatedApps.some((app) => {
      if (app?.platform !== "webapp" || !app.url) return false;
      try {
        return new URL(app.url, manifestUrl).href === manifestUrl &&
          (!app.id || new URL(app.id, manifestUrl).href === appId);
      } catch { return false; }
    });
  } catch (error) {
    console.warn("Não foi possível verificar se a PWA está instalada.", error);
    return null;
  }
}

async function refreshBrowserInstallUI() {
  if (IS_STANDALONE_APP) return;
  if (browserInstallCompleted) {
    setBrowserInstallUI("installed");
    return;
  }

  const revision = ++browserInstallRevision;
  const installed = await detectInstalledPwa();
  if (revision !== browserInstallRevision) return;

  if (installed === true) {
    confirmBrowserInstall();
    return;
  }
  if (installed === false) browserInstallVerified = false;
  if (browserInstallVerified) {
    setBrowserInstallUI("installed");
    return;
  }

  if (browserInstallPending) {
    setBrowserInstallUI("pending");
    return;
  }

  if (deferredInstallPrompt) {
    setBrowserInstallUI("ready");
    return;
  }

  setBrowserInstallUI("guidance");
}

async function requestBrowserInstall() {
  if (!browserInstallUnlocked) return;
  if (!deferredInstallPrompt) {
    await refreshBrowserInstallUI();
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  browserInstallRevision++;
  setBrowserInstallUI("opening");

  try {
    const choice = await promptEvent.prompt();
    if (browserInstallVerified) return;

    if (choice?.outcome === "accepted") {
      // Importante: "accepted" confirma a escolha no prompt, não usamos isso
      // como prova visual de que o ícone já foi criado pelo SO/launcher.
      browserInstallPending = true;
      setBrowserInstallUI("pending");

      // Em navegadores que suportam a API, tentamos confirmar a instalação.
      // A UI continua usando linguagem neutra enquanto não houver confirmação.
      pollBrowserInstall();
      return;
    }

    browserInstallPending = false;
    await refreshBrowserInstallUI();
  } catch (error) {
    if (browserInstallVerified) return;
    console.warn("Não foi possível abrir o prompt de instalação.", error);
    browserInstallPending = false;
    await refreshBrowserInstallUI();
  }
}

function initializeRuntimeMode() {
  const browserGate = document.querySelector("#browser-gate");

  if (IS_STANDALONE_APP) {
    document.body.classList.add("standalone-mode");
    document.body.classList.remove("browser-mode");
    if (browserGate) browserGate.hidden = true;
    return true;
  }

  document.body.classList.add("browser-mode");
  document.body.classList.remove("standalone-mode", "security-booting");
  if (browserGate) browserGate.hidden = false;

  document.querySelector("#browser-install-button")?.addEventListener("click", requestBrowserInstall);
  document.querySelector("#browser-install-password")?.addEventListener("input", unlockBrowserInstall);
  refreshBrowserInstallUI();
  return false;
}

window.addEventListener("beforeinstallprompt", (event) => {
  if (IS_STANDALONE_APP) return;

  event.preventDefault();
  browserInstallRevision++;
  browserInstallCompleted = false;
  browserInstallVerified = false;
  stopBrowserInstallPolling();
  deferredInstallPrompt = event;

  // Se um fluxo anterior não terminou de fato, o navegador pode oferecer a
  // instalação novamente. Nesse caso voltamos a exibir o botão normalmente.
  browserInstallPending = false;
  setBrowserInstallUI("ready");
});

window.addEventListener("appinstalled", () => {
  if (IS_STANDALONE_APP) return;

  // Confirmação do navegador, distinta da simples aceitação do prompt.
  // A criação visual do ícone pelo launcher pode terminar instantes depois.
  browserInstallCompleted = true;
  confirmBrowserInstall();
});

// Atualiza ao retornar das configurações/instalação, sem acessar dados privados.
window.addEventListener("focus", () => refreshBrowserInstallUI());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshBrowserInstallUI();
});



const DATA_STORAGE_KEY = "funtime-v1-data";
const LEGACY_DRINKS_STORAGE_KEY = "balada-v1-drinks";
const DATA_VERSION = 11;
const APP_VERSION = "2.3.2";
const DRINK_EXPORT_TYPE = "funtime-drinks";
const DRINK_EXPORT_FORMAT_VERSION = 1;
const BACKUP_EXPORT_TYPE = "funtime-backup";
const BACKUP_EXPORT_FORMAT_VERSION = 2;
const DRINK_FILE_MAX_BYTES = 1500000;
const BACKUP_FILE_MAX_BYTES = 20000000;
const SHARE_IMPORT_CACHE_NAME = "funtime-share-target-v1";
const SHARE_IMPORT_REQUEST_PATH = "./__shared-drinks-import__";
const SHARE_IMPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SECURITY_STORAGE_KEY = "funtime-security-v1";
const SECURITY_SESSION_KEY = "funtime-security-session-v1";

const PICKER_ICONS = [
  "🍬", "💊", "🍍", "🍭", "🥃", "🍺", "🍷", "🥂",
  "👃", "🐽",  "🪏", "💗", "🌿", "🚬", "🌻", "❄️", "👇", "🧂", "🍫", 
  "🍪", "🍄", "🌵", "💧", "💦", "😵‍💫", "🕳️", "💤", "💫",
  "🥶", "🥵", "🌊", "🪄", "🧪", "👽", "😈", "🧙‍♂️"
];
const DEFAULT_ICON = "🍺";

const REORDER_ANIMATION_MS = 880;
const REORDER_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const DRINK_REORDER_PRESS_MS = 500;
const DRINK_REORDER_MOVE_TOLERANCE = 18;
const DOUBLE_TAP_MAX_DELAY_MS = 430;
const DOUBLE_TAP_FEEDBACK_MS = 430;
const COMPLETED_DOUBLE_TAP_COOLDOWN_MS = 520;

const initialData = IS_STANDALONE_APP ? loadAppData() : normalizeData({ drinks: [], events: [] });

const state = {
  drinks: initialData.drinks,
  events: initialData.events,
  occasions: initialData.occasions || [],
  historyOccasionId: "all",
  historyLimit: 20,
  preferences: initialData.preferences,
  timerId: null,
  selectedDrinkId: null,
  pendingDrinkId: null,
  pendingDoseEventId: null,
  selectedEventId: null,
  editingDrinkId: null,
  deleteDrinkId: null,
  deleteReturnToEditor: false,
  menuDrinkId: null,
  historyDrinkId: null,
  currentView: "home",
  undo: null,
  toastTimerId: null,
  reorderAnimationUntil: 0,
  draggingDrinkId: null,
  pendingDrinkReorderId: null,
  pendingDoubleTap: null,
  ignoreDrinkGestureUntil: 0,
  securityConfig: null, // preenchido logo abaixo - o factory precisa de `state` por referência
  securityLocked: false,
  securityHiddenAt: null,
  privacyShieldVisible: false,
  pinFailedAttempts: 0,
  pinLockoutUntil: 0,
  pinLockoutTimer: null,
  deviceAuthSupported: false,
  securitySetupContext: "enable",
  securitySetupGeneration: 0,
  pendingDrinkImport: null,
  pendingBackupRestore: null,
  pendingSharedImportCheck: false,
  pendingSyncApply: null,
  pendingSharedViewApply: null,
};

// Declarados aqui, longe do bloco de sincronização lá embaixo, porque `commitAppData` e
// `updateSyncSettingsUI` leem estas variáveis e podem rodar antes daquele bloco.
let cloudSync = null;
let firebaseAuth = null;
let shareWriter = null;
let shareUI = null;
let sharedViewReader = null;

// Envolve o núcleo de persistência (src/data/store.js) para que toda gravação de dados
// do app também agende o envio para a nuvem. Como as fábricas de src/drinks e
// src/history recebem `commitAppData` por parâmetro, os 18 pontos de mutação passam
// por aqui sem precisar ser alterados um a um.
function commitAppData(storageKey, current, patch) {
  const next = commitToStorage(storageKey, current, patch);
  if (storageKey === DATA_STORAGE_KEY) {
    cloudSync?.scheduleSyncPush(current, next);
    shareWriter?.scheduleSharePush(next);
  }
  return next;
}

const securityConfig = createSecurityConfig({
  state, localStorage, securityStorageKey: SECURITY_STORAGE_KEY,
  validateStoredShape, base64UrlToBytes, equalBytes,
});
const {
  getDefaultSecurityConfig, loadSecurityConfig, saveSecurityConfig,
  getConfiguredPinLength, normalizePinInput, getPinLockoutRemainingMs, verifyPin,
  registerFailedPinAttempt,
} = securityConfig;
state.securityConfig = IS_STANDALONE_APP ? loadSecurityConfig() : getDefaultSecurityConfig();

const homeHeader = document.querySelector("#home-header");
const historyHeader = document.querySelector("#history-header");
const homeView = document.querySelector("#home-view");
const historyView = document.querySelector("#history-view");
const historyList = document.querySelector("#history-list");
const historyEmptyState = document.querySelector("#history-empty-state");
const historyCount = document.querySelector("#history-count");
const historyDescription = document.querySelector("#history-description");
const historyShowMore = document.querySelector("#history-show-more");
const historyHeaderEyebrow = document.querySelector("#history-header-eyebrow");
const historyHeaderTitle = document.querySelector("#history-header-title");

const drinkList = document.querySelector("#drink-list");
const emptyState = document.querySelector("#empty-state");
const homeAddZone = document.querySelector("#home-add-zone");
const drinkDialog = document.querySelector("#drink-dialog");
const drinkForm = document.querySelector("#drink-form");
const nameInput = document.querySelector("#drink-name");
const drinkNameField = document.querySelector("#drink-name-field");
const drinkNameError = document.querySelector("#drink-name-error");
const drinkIconField = document.querySelector("#drink-icon-field");
const drinkIconError = document.querySelector("#drink-icon-error");
const intervalHoursInput = document.querySelector("#interval-hours");
const intervalMinutesInput = document.querySelector("#interval-minutes");
const intervalHoursWheel = document.querySelector("#interval-hours-wheel");
const intervalMinutesWheel = document.querySelector("#interval-minutes-wheel");
const iconOptions = document.querySelector("#icon-options");
const formError = document.querySelector("#form-error");
const drinkDialogEyebrow = document.querySelector("#drink-dialog-eyebrow");
const drinkDialogTitle = document.querySelector("#drink-dialog-title");
const drinkSubmitButton = document.querySelector("#drink-submit-button");
const deleteDrinkFromEditorButton = document.querySelector("#delete-drink-from-editor");
const drinkDangerZone = document.querySelector("#drink-danger-zone");
const drinkIntervalEditNote = document.querySelector("#drink-interval-edit-note");
const askDoseSizeInput = document.querySelector("#ask-dose-size");
const cardTemplate = document.querySelector("#drink-card-template");

const deleteDrinkDialog = document.querySelector("#delete-drink-dialog");
const deleteDrinkName = document.querySelector("#delete-drink-name");
const deleteDrinkSummary = document.querySelector("#delete-drink-summary");

const intervalWarningDialog = document.querySelector("#interval-warning-dialog");
const intervalWarningDrinkName = document.querySelector("#interval-warning-drink-name");
const intervalWarningRemaining = document.querySelector("#interval-warning-remaining");
const intervalWarningMessage = document.querySelector("#interval-warning-message");
const intervalWarningContext = document.querySelector("#interval-warning-context");

const drinkMenuDialog = document.querySelector("#drink-menu-dialog");
const drinkMenuName = document.querySelector("#drink-menu-name");

const logDialog = document.querySelector("#log-dialog");
const logForm = document.querySelector("#log-form");
const logDrinkName = document.querySelector("#log-drink-name");
const activeIntervalWarning = document.querySelector("#active-interval-warning");
const activeIntervalWarningTitle = document.querySelector("#active-interval-warning-title");
const activeIntervalWarningText = document.querySelector("#active-interval-warning-text");
const logHoursAgoInput = document.querySelector("#log-hours-ago");
const logMinutesAgoInput = document.querySelector("#log-minutes-ago");
const logHoursWheel = document.querySelector("#log-hours-wheel");
const logMinutesWheel = document.querySelector("#log-minutes-wheel");
const logFormError = document.querySelector("#log-form-error");

const eventDialog = document.querySelector("#event-dialog");
const eventForm = document.querySelector("#event-form");
const eventDrinkName = document.querySelector("#event-drink-name");
const eventDateInput = document.querySelector("#event-date");
const eventTimeInput = document.querySelector("#event-time");
const eventInterval = document.querySelector("#event-interval");
const eventWarning = document.querySelector("#event-warning");
const eventWarningText = document.querySelector("#event-warning-text");
const eventDeletedNote = document.querySelector("#event-deleted-note");
const eventFormError = document.querySelector("#event-form-error");
const eventDoseField = document.querySelector("#event-dose-field");

const doseSizeDialog = document.querySelector("#dose-size-dialog");
const doseSizeDrinkName = document.querySelector("#dose-size-drink-name");
const doseHalfButton = document.querySelector("#dose-half-button");
const doseFullButton = document.querySelector("#dose-full-button");

const toast = document.querySelector("#toast");
const toastMessage = document.querySelector("#toast-message");
const toastUndo = document.querySelector("#toast-undo");
const updateToast = document.querySelector("#update-toast");
const applyUpdateButton = document.querySelector("#apply-update");
const dismissUpdateButton = document.querySelector("#dismiss-update");

const appShell = document.querySelector("#app-shell");
const settingsHeader = document.querySelector("#settings-header");
const settingsView = document.querySelector("#settings-view");
const countingModeInput = document.querySelector("#counting-mode");
const cleanInterfaceInput = document.querySelector("#clean-interface");
const prioritizeRecentDrinksInput = document.querySelector("#prioritize-recent-drinks");
const exportDrinksButton = document.querySelector("#export-drinks");
const importDrinksButton = document.querySelector("#import-drinks");
const drinkImportFileInput = document.querySelector("#drink-import-file");
const createBackupButton = document.querySelector("#create-backup");
const restoreBackupButton = document.querySelector("#restore-backup");
const backupRestoreFileInput = document.querySelector("#backup-restore-file");
const checkAppUpdateButton = document.querySelector("#check-app-update");
const syncSignInButton = document.querySelector("#sync-sign-in");
const syncSignOutButton = document.querySelector("#sync-sign-out");
const syncDeleteCloudButton = document.querySelector("#sync-delete-cloud");
const syncStatusRow = document.querySelector("#sync-status-row");
const syncAccountLabel = document.querySelector("#sync-account-label");
const syncUnavailableNotice = document.querySelector("#sync-unavailable");
const sharingNodes = {
  sharingCard: document.querySelector("#settings-sharing-card"),
  sharingPeople: document.querySelector("#sharing-people"),
  sharingConnect: document.querySelector("#sharing-connect"),
  pairingDialog: document.querySelector("#pairing-dialog"),
  pairingAlias: document.querySelector("#pairing-alias"),
  pairingAliasSave: document.querySelector("#pairing-alias-save"),
  pairingCodeDisplay: document.querySelector("#pairing-code-display"),
  pairingCodeCountdown: document.querySelector("#pairing-code-countdown"),
  pairingGenerate: document.querySelector("#pairing-generate"),
  pairingCodeInput: document.querySelector("#pairing-code-input"),
  pairingRedeem: document.querySelector("#pairing-redeem"),
  pairingError: document.querySelector("#pairing-error"),
  pairingClose: document.querySelector("#close-pairing"),
  pairingDone: document.querySelector("#pairing-done"),
  pairingConfirmDialog: document.querySelector("#pairing-confirm-dialog"),
  pairingConfirmNumber: document.querySelector("#pairing-confirm-number"),
  pairingConfirmWho: document.querySelector("#pairing-confirm-who"),
  pairingConfirmAccept: document.querySelector("#pairing-confirm-accept"),
  pairingConfirmReject: document.querySelector("#pairing-confirm-reject"),
  pairingConfirmClose: document.querySelector("#close-pairing-confirm"),
  shareOccasionDialog: document.querySelector("#share-occasion-dialog"),
  shareOccasionTitle: document.querySelector("#share-occasion-title"),
  shareOccasionGrid: document.querySelector("#share-occasion-grid"),
  shareOccasionEmpty: document.querySelector("#share-occasion-empty"),
  shareOccasionConfirm: document.querySelector("#share-occasion-confirm"),
  shareOccasionStopAll: document.querySelector("#share-occasion-stop-all"),
  closeShareOccasion: document.querySelector("#close-share-occasion"),
  homeShared: document.querySelector("#home-shared"),
  sharedPairingsGrid: document.querySelector("#shared-pairings-grid"),
  sharedPairingsEmpty: document.querySelector("#shared-pairings-empty"),
  sharedEmptyState: document.querySelector("#shared-empty-state"),
  sharedEntriesGrid: document.querySelector("#shared-entries-grid"),
  sharedDetailDialog: document.querySelector("#shared-detail-dialog"),
  sharedDetailTitle: document.querySelector("#shared-detail-title"),
  sharedDetailBody: document.querySelector("#shared-detail-body"),
  sharedDetailClose: document.querySelector("#shared-detail-close"),
  closeSharedDetail: document.querySelector("#close-shared-detail"),
};
const sharedHeader = document.querySelector("#shared-header");
const sharedViewMain = document.querySelector("#shared-view");
const closeSharedButton = document.querySelector("#close-shared");

const drinkImportDialog = document.querySelector("#drink-import-dialog");
const drinkImportFileName = document.querySelector("#drink-import-file-name");
const drinkImportFileSummary = document.querySelector("#drink-import-file-summary");
const drinkImportError = document.querySelector("#drink-import-error");
const confirmDrinkImportButton = document.querySelector("#confirm-drink-import");

const backupRestoreDialog = document.querySelector("#backup-restore-dialog");
const backupRestoreFileName = document.querySelector("#backup-restore-file-name");
const backupRestoreFileSummary = document.querySelector("#backup-restore-file-summary");
const backupRestoreError = document.querySelector("#backup-restore-error");
const confirmBackupRestoreButton = document.querySelector("#confirm-backup-restore");

const securityEnabledInput = document.querySelector("#security-enabled");
const securityDetails = document.querySelector("#security-details");
const securityMethodLabel = document.querySelector("#security-method-label");
const securityRelockSelect = document.querySelector("#security-relock");
const deviceAuthSupport = document.querySelector("#device-auth-support");
const securityMethodDialog = document.querySelector("#security-method-dialog");
const securityMethodError = document.querySelector("#security-method-error");
const chooseDeviceAuthButton = document.querySelector("#choose-device-auth");
const choosePinAuthButton = document.querySelector("#choose-pin-auth");
const pinSetupDialog = document.querySelector("#pin-setup-dialog");
const pinSetupForm = document.querySelector("#pin-setup-form");
const pinSetupValue = document.querySelector("#pin-setup-value");
const pinSetupConfirm = document.querySelector("#pin-setup-confirm");
const pinSetupError = document.querySelector("#pin-setup-error");
const lockScreen = document.querySelector("#lock-screen");
const deviceUnlockPanel = document.querySelector("#device-unlock-panel");
const deviceUnlockButton = document.querySelector("#device-unlock");
const pinUnlockForm = document.querySelector("#pin-unlock-form");
const pinUnlockValue = document.querySelector("#pin-unlock-value");
const lockError = document.querySelector("#lock-error");
const privacyShield = document.querySelector("#privacy-shield");


function applyInterfacePreferences() {
  const cleanInterface = state.preferences?.cleanInterface !== false;
  document.body.classList.toggle("clean-mode", cleanInterface);
  if (cleanInterfaceInput) cleanInterfaceInput.checked = cleanInterface;
}

function updateInterfaceSettingsUI() {
  countingModeInput.value = state.preferences.countingMode === "normal" ? "normal" : "countdown";
  if (prioritizeRecentDrinksInput) prioritizeRecentDrinksInput.checked = state.preferences?.prioritizeRecentDrinks !== false;
  if (!cleanInterfaceInput) return;
  cleanInterfaceInput.checked = state.preferences?.cleanInterface !== false;
}

function updateDataSettingsUI() {
  if (exportDrinksButton) exportDrinksButton.disabled = state.drinks.length === 0;
  updateSyncSettingsUI();
}

// Falha fechada em dado corrompido: nunca resetar silenciosamente proteção/dados reais.
function validateStoredShape(raw, key) {
  if (raw === null) return;
  const fail = () => { throw new Error(`Há dados incompatíveis em ${key}.`); };
  let value;
  try { value = JSON.parse(raw); } catch { fail(); }
  const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (!isObject(value)) fail();
  if (key === DATA_STORAGE_KEY) {
    if ((value.version !== undefined && (!Number.isInteger(value.version) || value.version < 1 || value.version > 11)) ||
        !Array.isArray(value.drinks) || !Array.isArray(value.events)) fail();
    const ids = new Set(), events = new Set();
    for (const drink of value.drinks) {
      if (drink === null) continue; // normalizeData() já filtra nulls remanescentes do bug de arraste da v2.1.23.
      if (!isObject(drink) || !drink.id || !drink.name || ids.has(String(drink.id))) fail();
      ids.add(String(drink.id));
    }
    for (const event of value.events) {
      if (!isObject(event) || !event.id || !event.drinkId ||
          !Number.isFinite(Number(event.consumedAt)) || events.has(String(event.id))) fail();
      events.add(String(event.id));
    }
  } else if (key === SECURITY_STORAGE_KEY) {
    if (typeof value.enabled !== "boolean") fail();
    if (value.enabled) {
      if (value.method === "pin") {
        if (!value.pin || typeof value.pin.salt !== "string" || !value.pin.salt ||
            typeof value.pin.hash !== "string" || !value.pin.hash) fail();
      } else if (value.method === "device") {
        if (!value.webauthn || typeof value.webauthn.credentialId !== "string" || !value.webauthn.credentialId ||
            typeof value.webauthn.publicKey !== "string" || !value.webauthn.publicKey) fail();
      } else fail();
    }
  }
}

function loadSecuritySession() {
  try {
    const raw = sessionStorage.getItem(SECURITY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      lastActiveAt: Number(parsed.lastActiveAt) || 0,
      hiddenAt: Number(parsed.hiddenAt) || 0,
    };
  } catch (error) {
    return null;
  }
}

function saveSecuritySession(values = {}) {
  if (!state.securityConfig.enabled || state.securityLocked) return;
  const current = loadSecuritySession() || { lastActiveAt: 0, hiddenAt: 0 };
  const next = { ...current, ...values };
  try {
    sessionStorage.setItem(SECURITY_SESSION_KEY, JSON.stringify(next));
  } catch (error) {
    // O bloqueio continua funcionando mesmo se sessionStorage estiver indisponível.
  }
}

function clearSecuritySession() {
  try { sessionStorage.removeItem(SECURITY_SESSION_KEY); } catch (error) { /* noop */ }
}

function markSecurityActive() {
  if (!state.securityConfig.enabled || state.securityLocked) return;
  saveSecuritySession({ lastActiveAt: Date.now(), hiddenAt: 0 });
}

function getSecurityEventUnlockOccasion() {
  const occasionId = state.securityConfig?.eventUnlockOccasionId;
  if (!state.securityConfig?.enabled || !state.preferences?.eventsEnabled || !occasionId) return null;
  return state.occasions.find((occasion) => occasion.id === occasionId && occasion.startedAt !== null && occasion.endedAt === null &&
    (occasion.scheduledEndAt == null || occasion.scheduledEndAt > Date.now())) || null;
}

function isSecurityEventUnlockActive(occasionId = null) {
  const occasion = getSecurityEventUnlockOccasion();
  return Boolean(occasion && (!occasionId || occasion.id === occasionId));
}

function setSecurityEventUnlock(occasionId, enabled) {
  if (enabled) {
    const occasion = state.occasions.find((item) => item.id === occasionId);
    if (!state.securityConfig.enabled || !state.preferences.eventsEnabled || !occasion || occasion.startedAt === null || occasion.endedAt !== null) return false;
  }
  const previous = state.securityConfig.eventUnlockOccasionId;
  state.securityConfig.eventUnlockOccasionId = enabled ? occasionId : null;
  try {
    saveSecurityConfig();
    if (enabled) markSecurityActive();
    return true;
  } catch (error) {
    state.securityConfig.eventUnlockOccasionId = previous;
    showAppNotification("Não foi possível salvar a preferência de desbloqueio neste aparelho.", { type: "error" });
    return false;
  }
}

function syncSecurityEventUnlock() {
  if (!state.securityConfig.eventUnlockOccasionId || getSecurityEventUnlockOccasion()) return isSecurityEventUnlockActive();
  state.securityConfig.eventUnlockOccasionId = null;
  try { saveSecurityConfig(); } catch (error) { /* O valor inválido será ignorado também na próxima abertura. */ }
  return false;
}

globalThis.isSecurityEventUnlockActive = isSecurityEventUnlockActive;
globalThis.setSecurityEventUnlock = setSecurityEventUnlock;
globalThis.syncSecurityEventUnlock = syncSecurityEventUnlock;

function bytesToBase64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function equalBytes(a, b) {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a);
  const right = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function isPlatformDeviceAuthAvailable() {
  if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials?.create || !navigator.credentials?.get) {
    return false;
  }
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (error) {
    return false;
  }
}

async function createDeviceCredential() {
  if (!state.deviceAuthSupported) throw new Error("A autenticação do aparelho não está disponível neste dispositivo.");

  const challenge = randomBytes(32);
  const userId = randomBytes(16);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "FunTime" },
      user: {
        id: userId,
        name: `funtime-${Date.now()}@local`,
        displayName: "FunTime",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "discouraged",
        userVerification: "required",
      },
      attestation: "none",
    },
  });

  if (!credential) throw new Error("A autenticação foi cancelada.");
  const response = credential.response;
  if (typeof response.getPublicKey !== "function" || typeof response.getPublicKeyAlgorithm !== "function") {
    throw new Error("Este navegador não permite configurar autenticação local segura. Use o PIN do aplicativo.");
  }

  const publicKey = response.getPublicKey();
  const algorithm = response.getPublicKeyAlgorithm();
  if (!publicKey || ![-7, -257].includes(algorithm)) {
    throw new Error("O tipo de chave deste aparelho não é compatível. Use o PIN do aplicativo.");
  }

  return {
    credentialId: bytesToBase64Url(credential.rawId),
    publicKey: bytesToBase64Url(publicKey),
    algorithm,
  };
}

async function verifyDeviceCredential() {
  const stored = state.securityConfig.webauthn;
  if (!stored) return false;

  const challenge = randomBytes(32);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: [{
        type: "public-key",
        id: base64UrlToBytes(stored.credentialId),
      }],
    },
  });
  if (!assertion || bytesToBase64Url(assertion.rawId) !== stored.credentialId) return false;

  const clientDataJSON = new Uint8Array(assertion.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataJSON));
  if (clientData.type !== "webauthn.get") return false;
  if (clientData.origin !== location.origin) return false;
  if (clientData.challenge !== bytesToBase64Url(challenge)) return false;

  const authenticatorData = new Uint8Array(assertion.response.authenticatorData);
  if (authenticatorData.length < 37) return false;
  const expectedRpHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(location.hostname)));
  if (!equalBytes(authenticatorData.slice(0, 32), expectedRpHash)) return false;
  const flags = authenticatorData[32];
  if ((flags & 0x01) === 0 || (flags & 0x04) === 0) return false;

  const clientHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON));
  const signedData = new Uint8Array(authenticatorData.length + clientHash.length);
  signedData.set(authenticatorData, 0);
  signedData.set(clientHash, authenticatorData.length);

  const spki = base64UrlToBytes(stored.publicKey);
  const signature = new Uint8Array(assertion.response.signature);

  if (stored.algorithm === -7) {
    const key = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const rawSignature = derEcdsaSignatureToRaw(signature, 32);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, rawSignature, signedData);
  }

  if (stored.algorithm === -257) {
    const key = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, signedData);
  }

  return false;
}

function getSecurityMethodLabel(method = state.securityConfig.method) {
  if (method === "device") return "Biometria / aparelho";
  if (method === "pin") return "PIN do aplicativo";
  return "Não configurado";
}

function updateSecuritySettingsUI() {
  const config = state.securityConfig;
  securityEnabledInput.checked = config.enabled;
  securityDetails.hidden = !config.enabled;
  securityMethodLabel.textContent = getSecurityMethodLabel(config.method);
  securityRelockSelect.value = String(config.relockSeconds);

  chooseDeviceAuthButton.disabled = !state.deviceAuthSupported;
  if (!window.isSecureContext) {
    deviceAuthSupport.textContent = "Biometria/bloqueio do aparelho exige HTTPS. Use a PWA instalada ou o GitHub Pages.";
    deviceAuthSupport.classList.add("is-warning");
  } else if (state.deviceAuthSupported) {
    deviceAuthSupport.textContent = "Este dispositivo informou suporte à autenticação local do aparelho.";
    deviceAuthSupport.classList.remove("is-warning");
  } else {
    deviceAuthSupport.textContent = "Autenticação do aparelho não foi detectada aqui. O PIN do aplicativo continua disponível.";
    deviceAuthSupport.classList.add("is-warning");
  }
}

function setCurrentView(view) {
  state.currentView = view;
  homeHeader.hidden = view !== "home";
  homeView.hidden = view !== "home";
  historyHeader.hidden = view !== "history";
  historyView.hidden = view !== "history";
  settingsHeader.hidden = view !== "settings";
  settingsView.hidden = view !== "settings";
  document.getElementById("occasion-header").hidden = view !== "occasion";
  document.getElementById("occasion-view").hidden = view !== "occasion";
  if (sharedHeader) sharedHeader.hidden = view !== "shared";
  if (sharedViewMain) sharedViewMain.hidden = view !== "shared";
  document.querySelectorAll("[data-nav-view]").forEach(button => {
    if (button.dataset.navView === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function openSettingsView() {
  setCurrentView("settings");
  updateInterfaceSettingsUI();
  updateDataSettingsUI();
  updateSecuritySettingsUI();
  window.scrollTo(0, 0);
}

function closeSettingsView() {
  setCurrentView("home");
  render();
  window.scrollTo(0, 0);
}

function openSecurityMethodDialog(context = "enable") {
  state.securitySetupGeneration++;
  state.securitySetupContext = context;
  securityMethodError.hidden = true;
  securityMethodError.textContent = "";
  updateSecuritySettingsUI();
  securityMethodDialog.showModal();
}

function closeSecurityMethodDialog({ cancelEnable = true } = {}) {
  state.securitySetupGeneration++;
  if (securityMethodDialog.open) securityMethodDialog.close();
  if (cancelEnable && state.securitySetupContext === "enable" && !state.securityConfig.enabled) {
    securityEnabledInput.checked = false;
  }
}

function openPinSetupDialog() {
  state.securitySetupGeneration++;
  pinSetupValue.value = "";
  pinSetupConfirm.value = "";
  pinSetupError.hidden = true;
  beginFormDraft(pinSetupForm);
  pinSetupDialog.showModal();
  setTimeout(() => pinSetupValue.focus(), 50);
}

function closePinSetupDialog({ cancelEnable = true } = {}) {
  state.securitySetupGeneration++;
  pinSetupValue.value = '';
  pinSetupConfirm.value = '';
  if (pinSetupDialog.open) pinSetupDialog.close();
  if (cancelEnable && state.securitySetupContext === "enable" && !state.securityConfig.enabled) {
    securityEnabledInput.checked = false;
  }
}

async function configurePinSecurity(pin, isCurrent = () => true) {
  const salt = randomBytes(16);
  const hash = await (globalThis.derivePinHash || derivePinHash)(pin, salt);
  if (!isCurrent()) throw new Error('Configuração cancelada.');
  state.securityConfig = {
    ...state.securityConfig,
    enabled: true,
    method: "pin",
    pin: {
      salt: bytesToBase64Url(salt),
      hash: bytesToBase64Url(hash),
      iterations: PIN_PBKDF2_ITERATIONS,
      length: PIN_LENGTH,
    },
    webauthn: null,
  };
  saveSecurityConfig();
  updateSecuritySettingsUI();
}

async function configureDeviceSecurity(isCurrent = () => true) {
  const credential = await createDeviceCredential();
  if (!isCurrent()) throw new Error('Configuração cancelada.');
  state.securityConfig = {
    ...state.securityConfig,
    enabled: true,
    method: "device",
    webauthn: credential,
    pin: null,
  };
  saveSecurityConfig();
  updateSecuritySettingsUI();
}

const securityLock = createSecurityLock({
  state,
  lockScreen, lockError, deviceUnlockPanel, pinUnlockForm, pinUnlockValue, deviceUnlockButton,
  privacyShield, pinSetupValue, pinSetupConfirm, toast,
  getConfiguredPinLength, normalizePinInput, verifyPin, verifyDeviceCredential,
  getPinLockoutRemainingMs, registerFailedPinAttempt,
  clearSecuritySession, markSecurityActive,
  hideToast, hideUpdateAvailable, render, renderHistory, maybeHandleSharedDrinkImport,
  applyPendingSyncData: applyRemoteSyncData,
  applyPendingSharedViewData: applySharedViewEntries,
  renderSharedView,
});
const {
  closeSensitiveDialogs, showLockScreen, lockApp, unlockApp,
  showPrivacyShield, hidePrivacyShield, updatePinLockoutMessage,
  handlePinUnlock, handleDeviceUnlock,
} = securityLock;

async function handlePinSetupSubmit(event) {
  event.preventDefault();
  const pin = normalizePinInput(pinSetupValue);
  const confirm = normalizePinInput(pinSetupConfirm);
  pinSetupError.hidden = true;

  if (pin.length !== PIN_LENGTH) {
    pinSetupError.textContent = "O PIN deve ter exatamente 4 dígitos.";
    pinSetupError.hidden = false;
    return;
  }
  if (pin !== confirm) {
    pinSetupError.textContent = "Os PINs não coincidem.";
    pinSetupError.hidden = false;
    return;
  }

  const submit = pinSetupForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Salvando…";
  const generation = state.securitySetupGeneration;
  try {
    await configurePinSecurity(pin, () => generation === state.securitySetupGeneration && pinSetupDialog.open && !state.securityLocked);
    closePinSetupDialog({ cancelEnable: false });
    securityMethodDialog.close();
    showToast("Bloqueio por PIN ativado.");
  } catch (error) {
    pinSetupError.textContent = "Não foi possível criar o PIN neste navegador.";
    pinSetupError.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Salvar PIN";
  }
}

async function chooseDeviceSecurity() {
  securityMethodError.hidden = true;
  chooseDeviceAuthButton.disabled = true;
  const generation = state.securitySetupGeneration;
  try {
    await configureDeviceSecurity(() => generation === state.securitySetupGeneration && securityMethodDialog.open && !state.securityLocked);
    closeSecurityMethodDialog({ cancelEnable: false });
    showToast("Bloqueio pelo aparelho ativado.");
  } catch (error) {
    securityMethodError.textContent = error?.name === "NotAllowedError" ? "Configuração cancelada." : (error?.message || "Não foi possível configurar este método.");
    securityMethodError.hidden = false;
  } finally {
    chooseDeviceAuthButton.disabled = !state.deviceAuthSupported;
  }
}

function choosePinSecurity() {
  openPinSetupDialog();
}

async function disableSecurity() {
  const confirmed = await showAppConfirmation("Desativar o bloqueio do aplicativo?", { title: "Desativar bloqueio", confirmLabel: "Desativar" });
  if (!confirmed) {
    securityEnabledInput.checked = true;
    return;
  }
  if (state.securityLocked) return;
  state.securityConfig = getDefaultSecurityConfig();
  saveSecurityConfig();
  clearSecuritySession();
  state.securityLocked = false;
  updateSecuritySettingsUI();
  showToast("Bloqueio desativado.");
}

async function initializeSecurity() {
  state.deviceAuthSupported = await isPlatformDeviceAuthAvailable();
  updateSecuritySettingsUI();
  document.body.classList.remove("security-booting");

  if (state.securityConfig.enabled) {
    const eventUnlockActive = syncSecurityEventUnlock();
    const session = loadSecuritySession();
    const referenceAt = session?.hiddenAt || session?.lastActiveAt || 0;
    const relockMs = state.securityConfig.relockSeconds * 1000;
    const mayResume = eventUnlockActive || (state.securityConfig.relockSeconds > 0 && referenceAt > 0 && (Date.now() - referenceAt) < relockMs);

    if (mayResume) {
      state.securityLocked = false;
      state.securityHiddenAt = null;
      lockScreen.hidden = true;
      document.body.classList.remove("app-locked");
      hidePrivacyShield();
      markSecurityActive();
    } else {
      lockApp();
    }
  } else {
    clearSecuritySession();
    state.securityLocked = false;
    lockScreen.hidden = true;
    document.body.classList.remove("app-locked");
  }
}

function loadAppData() {
  let raw;
  try {
    raw = localStorage.getItem(DATA_STORAGE_KEY);
  } catch (error) {
    console.error("Não foi possível carregar os dados atuais.", error);
    throw new Error("Não foi possível ler seus dados. Tente novamente.");
  }

  if (raw) {
    try {
      validateStoredShape(raw, DATA_STORAGE_KEY);
      const parsed = JSON.parse(raw);
      const normalized = normalizeData(parsed);

      if (normalized) {
        return normalized;
      }
      throw new Error("Os dados salvos não estão em um formato reconhecido.");
    } catch (error) {
      console.error("Não foi possível carregar os dados atuais.", error);
      // Nome distinto: boot.js oferece baixar uma cópia bruta só quando o
      // problema é o formato dos dados, não uma falha genérica de script.
      const failure = new Error("Não foi possível ler seus dados. Tente novamente.");
      failure.name = "FunTimeDataCorruptedError";
      throw failure;
    }
  }

  return migrateLegacyData();
}

function normalizeData(data) {
  if (!data || !Array.isArray(data.drinks) || !Array.isArray(data.events)) {
    return null;
  }

  const drinks = data.drinks
    .filter((drink) => drink && drink.id && drink.name)
    .map((drink) => ({
      id: String(drink.id),
      name: String(drink.name),
      icon: normalizeIcon(drink.icon),
      intervalMinutes: normalizeIntervalMinutes(drink.intervalMinutes),
      askDoseSize: Boolean(drink.askDoseSize),
    }));

  const drinkById = new Map(drinks.map((drink) => [drink.id, drink]));

  const events = data.events
    .filter((event) => {
      return (
        event &&
        event.id &&
        event.drinkId &&
        Number.isFinite(Number(event.consumedAt))
      );
    })
    .map((event) => {
      const drinkId = String(event.drinkId);
      const activeDrink = drinkById.get(drinkId);
      const snapshotName = String(event.drinkName || activeDrink?.name || "Bebida excluída").trim() || "Bebida excluída";
      const snapshotIcon = normalizeIcon(event.drinkIcon, activeDrink?.icon || DEFAULT_ICON);

      return {
        id: String(event.id),
        drinkId,
        drinkName: snapshotName,
        drinkIcon: snapshotIcon,
        consumedAt: Number(event.consumedAt),
        occasionId: event.occasionId ?? null,
        intervalMinutes: normalizeIntervalMinutes(event.intervalMinutes),
        doseSize: normalizeDoseSize(event.doseSize),
        ...(typeof event.countingStoppedAt === 'number' && Number.isFinite(event.countingStoppedAt) ? { countingStoppedAt: event.countingStoppedAt } : {}),
      };
    });

  const occasions = FunTimeOccasions.normalize({ ...data, events });

  return {
    version: DATA_VERSION,
    drinks,
    events,
    occasions,
    preferences: {
      eventsEnabled: data.preferences?.eventsEnabled === true,
      prioritizeRecentDrinks: data.preferences?.prioritizeRecentDrinks !== false,
      cleanInterface: data.preferences?.cleanInterface !== false,
      countingMode: data.preferences?.countingMode === "normal" ? "normal" : "countdown",
      iconCatalog: normalizeIconCatalog(data.preferences?.iconCatalog),
    },
  };
}

function migrateLegacyData() {
  let legacyDrinks = [];

  try {
    const raw = localStorage.getItem(LEGACY_DRINKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) legacyDrinks = parsed;
    }
  } catch (error) {
    console.error("Não foi possível migrar os dados da versão anterior.", error);
  }

  const drinks = legacyDrinks
    .filter((drink) => drink && drink.id && drink.name)
    .map((drink) => ({
      id: String(drink.id),
      name: String(drink.name),
      icon: normalizeIcon(drink.icon),
      intervalMinutes: normalizeIntervalMinutes(drink.intervalMinutes),
      askDoseSize: false,
    }));

  const events = legacyDrinks
    .filter((drink) => drink && drink.id && Number.isFinite(Number(drink.lastConsumedAt)) && Number(drink.lastConsumedAt) > 0)
    .map((drink) => ({
      id: createId(),
      drinkId: String(drink.id),
      drinkName: String(drink.name),
      drinkIcon: normalizeIcon(drink.icon),
      consumedAt: Number(drink.lastConsumedAt),
      intervalMinutes: normalizeIntervalMinutes(drink.intervalMinutes),
      doseSize: null,
    }));

  const migrated = {
    version: DATA_VERSION,
    drinks,
    events,
    preferences: {
      cleanInterface: true,
      countingMode: "countdown",
      iconCatalog: [...PICKER_ICONS],
    },
  };

  try {
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(migrated));
  } catch (error) {
    console.error("Não foi possível salvar a migração dos dados.", error);
  }

  return migrated;
}

function normalizeIcon(value, fallback = DEFAULT_ICON) {
  const icon = typeof value === "string" ? value.trim() : "";
  return icon || fallback;
}

function normalizeIconCatalog(value) {
  if (!Array.isArray(value)) return [...PICKER_ICONS];
  return [...new Set(value.filter(icon => typeof icon === "string" && icon.trim() && icon.length <= 64).map(icon => icon.trim()))].slice(0, 100);
}

function persistIconCatalog(icons) {
  const preferences = { ...state.preferences, iconCatalog: icons };
  state.preferences = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { preferences }).preferences;
}

function normalizeIntervalMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 60;
  return Math.min(1440, Math.round(numeric));
}

function normalizeDoseSize(value) {
  return value === "half" || value === "full" ? value : null;
}

function getDoseLabel(value) {
  if (value === "half") return "Meia";
  if (value === "full") return "Inteira";
  return "";
}

function getDoseStatusSuffix(event) {
  const label = getDoseLabel(event?.doseSize);
  return label ? ` · ${label}` : "";
}

// Nada em app.js chama isso mais (ver docs/specs/0009) — mantida só porque
// vários tests/*-browser.test.cjs chamam saveData() via page.evaluate para
// persistir fixtures de teste antes de continuar.
function saveData() {
  commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), {});
}


function buildCurrentAppData() {
  return {
    version: DATA_VERSION,
    drinks: state.drinks,
    events: state.events,
    occasions: state.occasions || [],
    preferences: state.preferences,
  };
}

function safeFilenamePart(value) {
  return String(value).replace(/[^0-9A-Za-z_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function getFileDateStamp({ includeTime = false } = {}) {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  if (!includeTime) return date;

  return `${date}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function deliverDrinksExport(file) {
  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: "FunTime — bebidas",
        text: "Arquivo de bebidas exportado pelo FunTime.",
      });
      return "native";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      console.warn("Falha ao abrir a entrega nativa do arquivo.", error);
    }
  }

  downloadFile(file);
  return "download";
}

function exportDrinks() {
  if (!state.drinks.length) {
    showToast("Cadastre ao menos uma bebida antes de exportar.");
    return;
  }

  const payload = {
    type: DRINK_EXPORT_TYPE,
    formatVersion: DRINK_EXPORT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    drinks: state.drinks.map((drink) => ({
      id: drink.id,
      name: drink.name,
      icon: drink.icon,
      intervalMinutes: drink.intervalMinutes,
      askDoseSize: Boolean(drink.askDoseSize),
    })),
  };

  const filename = `FunTime-Bebidas-${getFileDateStamp()}.txt`;
  const file = new File(
    [JSON.stringify(payload, null, 2)],
    filename,
    { type: "text/plain" }
  );

  deliverDrinksExport(file).then((mode) => {
    if (mode === "download") showToast("Arquivo de bebidas exportado.");
  }).catch((error) => {
    console.error("Falha ao exportar bebidas.", error);
    showAppNotification("Não foi possível exportar as bebidas.", { type: "error", persistent: true });
  });
}

function createBackup() {
  const payload = {
    type: BACKUP_EXPORT_TYPE,
    formatVersion: BACKUP_EXPORT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    data: buildCurrentAppData(),
  };

  const filename = `FunTime-Backup-${getFileDateStamp({ includeTime: true })}.json`;
  const file = new File(
    [JSON.stringify(payload, null, 2)],
    filename,
    { type: "application/json;charset=utf-8" }
  );

  try {
    downloadFile(file);
    showToast("Backup criado. Guarde o arquivo em um local privado.");
  } catch (error) {
    console.error("Falha ao criar backup.", error);
    showAppNotification("Não foi possível criar o backup.", { type: "error", persistent: true });
  }
}

async function readJsonFile(file, maxBytes) {
  if (!(file instanceof Blob)) throw new Error("Arquivo inválido.");
  if (file.size <= 0) throw new Error("O arquivo está vazio.");
  if (file.size > maxBytes) throw new Error("O arquivo é maior do que o permitido.");

  let text;
  try {
    text = await file.text();
  } catch (error) {
    throw new Error("Não foi possível ler o arquivo.");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("O arquivo não contém um JSON válido.");
  }
}

function normalizeImportedDrink(raw, usedIds = new Set()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > 80) return null;

  const intervalNumber = raw.intervalMinutes;
  if (!Number.isInteger(intervalNumber) || intervalNumber < 1 || intervalNumber > 1440) return null;

  const rawIcon = typeof raw.icon === "string" ? raw.icon.trim() : "";
  if (!rawIcon || rawIcon.length > 64) return null;
  if (raw.askDoseSize !== undefined && typeof raw.askDoseSize !== "boolean") return null;
  if (raw.id !== undefined && (typeof raw.id !== "string" || raw.id.length > 200)) return null;

  let id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id || usedIds.has(id)) id = createId();
  usedIds.add(id);

  return {
    id,
    name,
    icon: normalizeIcon(rawIcon),
    intervalMinutes: Math.round(intervalNumber),
    askDoseSize: Boolean(raw.askDoseSize),
  };
}

function validateDrinkExportPayload(payload) {
  if (!payload || ![DRINK_EXPORT_TYPE, "intervalo-drinks"].includes(payload.type)) {
    if ([BACKUP_EXPORT_TYPE, "intervalo-backup"].includes(payload?.type)) {
      throw new Error("Este arquivo é um backup. Use “Restaurar backup”.");
    }
    throw new Error("Este não é um arquivo de bebidas do FunTime.");
  }

  if (payload.formatVersion !== DRINK_EXPORT_FORMAT_VERSION) {
    throw new Error("Esta versão do arquivo de bebidas não é compatível com o aplicativo.");
  }

  if (!Array.isArray(payload.drinks)) {
    throw new Error("A lista de bebidas do arquivo é inválida.");
  }

  if (payload.drinks.length > 500) {
    throw new Error("O arquivo contém bebidas demais para esta versão do aplicativo.");
  }

  const usedIds = new Set();
  const drinks = payload.drinks.map((drink) => normalizeImportedDrink(drink, usedIds));

  if (drinks.some((drink) => !drink)) {
    throw new Error("Uma ou mais bebidas do arquivo possuem dados inválidos.");
  }

  return drinks;
}

function getDrinkImportSignature(drink) {
  return [
    drink.name.trim().toLocaleLowerCase("pt-BR"),
    drink.icon,
    String(drink.intervalMinutes),
    drink.askDoseSize ? "1" : "0",
  ].join("\u001f");
}

function getDrinkImportAnalysis(importedDrinks) {
  const existingSignatures = new Set(state.drinks.map(getDrinkImportSignature));
  let exactDuplicates = 0;
  let newCount = 0;

  for (const drink of importedDrinks) {
    const signature = getDrinkImportSignature(drink);
    if (existingSignatures.has(signature)) {
      exactDuplicates += 1;
    } else {
      newCount += 1;
      existingSignatures.add(signature);
    }
  }

  return { exactDuplicates, newCount };
}

function formatDataFileDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function openDrinkImportPreview({ fileName, drinks, source = "file" }) {
  const analysis = getDrinkImportAnalysis(drinks);

  state.pendingDrinkImport = {
    fileName: fileName || "Arquivo recebido",
    drinks,
    source,
  };

  drinkImportFileName.textContent = state.pendingDrinkImport.fileName;

  const pieces = [`${drinks.length} bebida${drinks.length === 1 ? "" : "s"} no arquivo`];
  if (analysis.exactDuplicates > 0) {
    pieces.push(`${analysis.exactDuplicates} duplicata${analysis.exactDuplicates === 1 ? "" : "s"} exata${analysis.exactDuplicates === 1 ? "" : "s"}`);
  }
  drinkImportFileSummary.textContent = pieces.join(" · ");

  drinkImportError.hidden = true;
  drinkImportError.textContent = "";

  const addOption = drinkImportDialog.querySelector('input[name="drink-import-mode"][value="add"]');
  if (addOption) addOption.checked = true;

  drinkImportDialog.showModal();
}

async function prepareDrinkImportFile(file, { source = "file" } = {}) {
  try {
    const payload = await readJsonFile(file, DRINK_FILE_MAX_BYTES);
    const drinks = validateDrinkExportPayload(payload);
    openDrinkImportPreview({
      fileName: file.name || "Arquivo recebido",
      drinks,
      source,
    });
  } catch (error) {
    console.warn("Arquivo de bebidas rejeitado.", error);
    showAppNotification(error?.message || "Não foi possível importar este arquivo.", { type: "error", persistent: true });
  }
}

function closeDrinkImportDialog() {
  state.pendingDrinkImport = null;
  drinkImportError.hidden = true;
  if (drinkImportDialog.open) drinkImportDialog.close();
}

function buildAddedDrinkList(importedDrinks) {
  const result = state.drinks.map((drink) => ({ ...drink }));
  const signatures = new Set(result.map(getDrinkImportSignature));
  const usedIds = new Set(result.map((drink) => drink.id));

  for (const imported of importedDrinks) {
    const signature = getDrinkImportSignature(imported);
    if (signatures.has(signature)) continue;

    let id = imported.id;
    if (!id || usedIds.has(id)) id = createId();

    result.push({ ...imported, id });
    usedIds.add(id);
    signatures.add(signature);
  }

  return result;
}

function buildReplacementDrinkList(importedDrinks) {
  const usedIds = new Set();

  return importedDrinks.map((drink) => {
    let id = drink.id;
    if (!id || usedIds.has(id)) id = createId();
    usedIds.add(id);
    return { ...drink, id };
  });
}

function persistDrinkList(nextDrinks) {
  state.drinks = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { drinks: nextDrinks }).drinks;
}

function confirmDrinkImport() {
  const pending = state.pendingDrinkImport;
  if (!pending) return;

  const mode = drinkImportDialog.querySelector('input[name="drink-import-mode"]:checked')?.value || "add";

  try {
    const before = state.drinks.length;
    const nextDrinks = mode === "replace"
      ? buildReplacementDrinkList(pending.drinks)
      : buildAddedDrinkList(pending.drinks);

    persistDrinkList(nextDrinks);

    const difference = Math.max(0, nextDrinks.length - before);
    closeDrinkImportDialog();
    refreshDataViews();
    updateDataSettingsUI();

    if (mode === "replace") {
      showToast(`${nextDrinks.length} bebida${nextDrinks.length === 1 ? "" : "s"} importada${nextDrinks.length === 1 ? "" : "s"}. O histórico foi mantido.`);
    } else if (difference === 0) {
      showToast("Nenhuma bebida nova foi adicionada.");
    } else {
      showToast(`${difference} bebida${difference === 1 ? "" : "s"} adicionada${difference === 1 ? "" : "s"}.`);
    }
  } catch (error) {
    console.error("Falha ao aplicar importação.", error);
    drinkImportError.textContent = "Não foi possível salvar a importação. Seus dados atuais foram mantidos.";
    drinkImportError.hidden = false;
  }
}

function validateBackupPayload(payload) {
  if (!payload || ![BACKUP_EXPORT_TYPE, "intervalo-backup"].includes(payload.type)) {
    if ([DRINK_EXPORT_TYPE, "intervalo-drinks"].includes(payload?.type)) {
      throw new Error("Este arquivo contém somente bebidas. Use “Importar bebidas”.");
    }
    throw new Error("Este não é um backup do FunTime.");
  }

  if (![1, BACKUP_EXPORT_FORMAT_VERSION].includes(payload.formatVersion)) {
    throw new Error("Esta versão do backup não é compatível com o aplicativo.");
  }

  const data = payload.data;
  const invalid = () => { throw new Error("O backup contém dados inválidos ou incompatíveis. Nenhum dado foi alterado."); };
  if (!data || !Number.isInteger(data.version) || data.version < 1 || data.version > DATA_VERSION ||
      !Array.isArray(data.drinks) || !Array.isArray(data.events)) invalid();
  if (data.drinks.length > 500 || data.events.length > 200000) invalid();
  const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
  const ids = new Set();
  for (const drink of data.drinks) {
    if (!normalizeImportedDrink(drink) || !validText(drink.id, 200) || ids.has(drink.id)) invalid();
    ids.add(drink.id);
  }
  const eventIds = new Set();
  for (const event of data.events) {
    if (event && event.countingStoppedAt !== undefined && (typeof event.countingStoppedAt !== 'number' || !Number.isFinite(event.countingStoppedAt) || !Number.isFinite(new Date(event.countingStoppedAt).getTime()))) invalid();
    if (!event || Array.isArray(event) || !validText(event.id, 200) || eventIds.has(event.id) ||
        !validText(event.drinkId, 200) || typeof event.consumedAt !== "number" ||
        !Number.isFinite(event.consumedAt) || !Number.isFinite(new Date(event.consumedAt).getTime()) ||
        !Number.isInteger(event.intervalMinutes) || event.intervalMinutes < 1 || event.intervalMinutes > 1440 ||
        (event.drinkName !== undefined && !validText(event.drinkName, 80)) ||
        (event.drinkIcon !== undefined && !validText(event.drinkIcon, 64)) ||
        (event.doseSize != null && !["half", "full"].includes(event.doseSize))) invalid();
    if (!ids.has(event.drinkId) && (!validText(event.drinkName, 80) || !validText(event.drinkIcon, 64))) invalid();
    eventIds.add(event.id);
  }
  if (data.preferences !== undefined && (!data.preferences || typeof data.preferences !== "object" ||
      Array.isArray(data.preferences) || (data.preferences.cleanInterface !== undefined &&
      typeof data.preferences.cleanInterface !== "boolean"))) invalid();
  if (data.preferences?.countingMode !== undefined && !["countdown", "normal"].includes(data.preferences.countingMode)) invalid();
  // Reconstrói apenas campos conhecidos; não mescla propriedades do arquivo.
  if (data.preferences?.eventsEnabled !== undefined && typeof data.preferences.eventsEnabled !== "boolean") invalid();
  if (data.preferences?.prioritizeRecentDrinks !== undefined && typeof data.preferences.prioritizeRecentDrinks !== "boolean") invalid();
  const catalog = data.preferences?.iconCatalog;
  if (catalog !== undefined && (!Array.isArray(catalog) || catalog.length > 100 ||
      catalog.some(icon => !validText(icon, 64)) || new Set(catalog.map(icon => icon.trim())).size !== catalog.length)) invalid();
  const normalized = normalizeData(data);
  if (!normalized) throw new Error("Os dados deste backup são inválidos.");

  if (normalized.drinks.length > 500 || normalized.events.length > 200000) {
    throw new Error("O backup excede os limites desta versão do aplicativo.");
  }

  return normalized;
}

async function prepareBackupRestoreFile(file) {
  try {
    const payload = await readJsonFile(file, BACKUP_FILE_MAX_BYTES);
    const data = validateBackupPayload(payload);

    state.pendingBackupRestore = {
      fileName: file.name || "Backup selecionado",
      data,
      createdAt: payload.createdAt || "",
      appVersion: payload.appVersion || "",
    };

    backupRestoreFileName.textContent = state.pendingBackupRestore.fileName;

    const created = formatDataFileDate(state.pendingBackupRestore.createdAt);
    const pieces = [
      `${data.drinks.length} bebida${data.drinks.length === 1 ? "" : "s"}`,
      `${data.events.length} registro${data.events.length === 1 ? "" : "s"}`,
    ];
    if (created) pieces.push(`criado em ${created}`);
    if (data.occasions?.length) pieces.push(`${data.occasions.length} eventos`);
    backupRestoreFileSummary.textContent = pieces.join(" · ");

    backupRestoreError.hidden = true;
    backupRestoreError.textContent = "";
    backupRestoreDialog.showModal();
  } catch (error) {
    console.warn("Backup rejeitado.", error);
    showAppNotification(error?.message || "Não foi possível ler este backup.", { type: "error", persistent: true });
  }
}

function closeBackupRestoreDialog() {
  state.pendingBackupRestore = null;
  backupRestoreError.hidden = true;
  if (backupRestoreDialog.open) backupRestoreDialog.close();
}

function confirmBackupRestore() {
  const pending = state.pendingBackupRestore;
  if (!pending) return;

  try {
    // Gravação única: se o setItem falhar, o estado atual permanece intacto.
    commitAppData(DATA_STORAGE_KEY, pending.data, {});
    try { sessionStorage.setItem("funtime-restore-success-v1", "1"); } catch { /* Aviso opcional: dados já restaurados. */ }
    globalThis.FunTimeNavigation?.prepareReload();
    closeBackupRestoreDialog();
    window.location.reload();
  } catch (error) {
    console.error("Falha ao restaurar backup.", error);
    backupRestoreError.textContent = "Não foi possível restaurar o backup. Seus dados atuais foram mantidos.";
    backupRestoreError.hidden = false;
  }
}

// Um compartilhamento nunca retomado (app fechado logo em seguida e nunca
// reaberto) não pode ficar em cache indefinidamente nem, meses depois,
// surpreender o usuário com uma prévia de importação de um arquivo esquecido.
function isSharedFileExpired(response) {
  const sharedAt = Number(response.headers.get("X-FunTime-Shared-At"));
  return Number.isFinite(sharedAt) && Date.now() - sharedAt > SHARE_IMPORT_MAX_AGE_MS;
}

async function readPendingSharedDrinkFile() {
  if (!("caches" in window)) return null;

  try {
    if (!(await caches.has(SHARE_IMPORT_CACHE_NAME))) return null;
    const cache = await caches.open(SHARE_IMPORT_CACHE_NAME);
    const requestUrl = new URL(SHARE_IMPORT_REQUEST_PATH, window.location.href).href;
    const response = await cache.match(requestUrl);
    if (!response) return null;
    if (isSharedFileExpired(response)) {
      await cache.delete(requestUrl);
      return null;
    }
    const filename = decodeURIComponent(response.headers.get("X-FunTime-Filename") || "FunTime-Bebidas.json");
    const text = await response.text();
    const file = new File([text], filename, { type: "application/json" });
    if (!(await cache.delete(requestUrl))) throw new Error("Não foi possível consumir o arquivo recebido.");
    return file;
  } catch (error) {
    console.warn("Não foi possível recuperar o arquivo recebido.", error);
    return null;
  }
}

function cleanSharedImportUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("import-shared")) return;
  url.searchParams.delete("import-shared");
  const next = `${url.pathname}${url.search}${url.hash}`;
  history.replaceState(history.state, "", next);
}

async function maybeHandleSharedDrinkImport() {
  const url = new URL(window.location.href);
  let pending = url.searchParams.has("import-shared");
  if ("caches" in window && (await caches.has(SHARE_IMPORT_CACHE_NAME))) {
    const cache = await caches.open(SHARE_IMPORT_CACHE_NAME);
    const requestUrl = new URL(SHARE_IMPORT_REQUEST_PATH, window.location.href).href;
    const response = await cache.match(requestUrl);
    if (response && isSharedFileExpired(response)) {
      await cache.delete(requestUrl);
      cleanSharedImportUrl();
      return;
    }
    if (!pending) pending = Boolean(response);
  }
  if (!pending) return;

  if (state.securityConfig.enabled && state.securityLocked) {
    state.pendingSharedImportCheck = true;
    return;
  }

  const file = await readPendingSharedDrinkFile();
  cleanSharedImportUrl();

  if (!file) {
    showAppNotification("Não foi possível recuperar o arquivo recebido.", { type: "error", persistent: true });
    return;
  }

  await prepareDrinkImportFile(file, { source: "share-target" });
}

function showRestoreSuccessIfNeeded() {
  try {
    if (sessionStorage.getItem("funtime-restore-success-v1") !== "1") return;
    sessionStorage.removeItem("funtime-restore-success-v1");
  } catch { return; }
  showToast("Backup restaurado.");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function effectiveCountingMode() {
  return resolveCountingMode(state.preferences.countingMode, state.upsideDownActive);
}

function formatActivityCounter(activity) {
  if (effectiveCountingMode() !== "normal") return `Falta: -${formatTime(activity.remainingMs)}`;
  const intervalMs = activity.latestEvent.intervalMinutes * 60000;
  const elapsedMs = Math.max(0, Math.min(intervalMs, intervalMs - activity.remainingMs));
  return `Contando: ${formatTime(Math.floor(elapsedMs / 1000) * 1000)}`;
}

function formatHistoryCounter(timestamp, intervalMinutes, now = Date.now()) {
  const remainingMs = Number(timestamp) + Number(intervalMinutes) * 60000 - now;
  if (effectiveCountingMode() === "normal" && remainingMs > 0) {
    const minutes = Math.ceil(remainingMs / 60000);
    return `Falta ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  return formatHistoryElapsed(timestamp, now);
}

function changeCountingMode(mode) {
  if (!["normal", "countdown"].includes(mode)) return;
  const preferences = { ...state.preferences, countingMode: mode };
  try {
    state.preferences = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { preferences }).preferences;
    refreshDataViews();
    showToast(mode === "normal" ? "Contagem normal ativada." : "Contagem regressiva ativada.");
  } catch (error) {
    countingModeInput.value = state.preferences.countingMode === "normal" ? "normal" : "countdown";
    showAppNotification("Não foi possível salvar a preferência. Tente novamente.", { type: "error" });
  }
}

function setHistoryClockLabel(element, timestamp, now = Date.now()) {
  element.dataset.historyTimestamp = String(timestamp);
  setPreviousStatus(element, timestamp, "", now, now - timestamp < 86400000 ? "às" : "em");
}

function updateHistoryElapsedLabels() {
  const now = Date.now();
  document.querySelectorAll("[data-history-timestamp]").forEach(element => {
    setHistoryClockLabel(element, Number(element.dataset.historyTimestamp), now);
  });

  document.querySelectorAll(".history-event-elapsed[data-consumed-at]").forEach((element) => {
    if (element.dataset.countingStopped === 'true') return;
    const timestamp = Number(element.dataset.consumedAt);
    const intervalMinutes = Number(element.dataset.intervalMinutes);
    if (!Number.isFinite(timestamp)) return;

    const label = formatHistoryCounter(timestamp, intervalMinutes, now);
    const intervalMs = Number.isFinite(intervalMinutes) ? Math.max(0, intervalMinutes) * 60 * 1000 : 0;
    const intervalCompleted = intervalMs === 0 || now - timestamp >= intervalMs;

    element.textContent = label;
    element.classList.toggle("is-within-interval", !intervalCompleted);
    element.classList.toggle("is-after-interval", intervalCompleted);
    element.setAttribute(
      "aria-label",
      intervalCompleted
        ? `${label}. O intervalo configurado já terminou.`
        : `${label}. O intervalo configurado ainda está em andamento.`
    );
  });
}

function setClockStatus(element, prefix, timestamp, trailingText = "") {
  element.replaceChildren();
  element.append(document.createTextNode(`${prefix} ${formatClock(timestamp)}`));

  const unit = document.createElement("span");
  unit.className = "time-unit";
  unit.textContent = "h";
  element.append(unit);

  if (trailingText) {
    element.append(document.createTextNode(trailingText));
  }
}

function setPreviousStatus(element, timestamp, trailingText = "", now = Date.now(), prefix = "Anterior:") {
  if (now - timestamp < 24 * 60 * 60 * 1000) {
    setClockStatus(element, prefix, timestamp, trailingText);
    return;
  }
  const date = new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
  element.textContent = prefix + ' ' + date + trailingText;
}

function formatElapsed(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  if (totalMinutes < 1) return "menos de 1 min";
  return formatInterval(totalMinutes);
}

function toLocalDateInputValue(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeInputValue(timestamp) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getLocalDateKey(timestamp) {
  return toLocalDateInputValue(timestamp);
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function formatHistoryDay(timestamp) {
  const date = new Date(timestamp);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const todayStart = getStartOfToday();
  const oneDay = 24 * 60 * 60 * 1000;
  const difference = Math.round((todayStart - dayStart.getTime()) / oneDay);

  if (difference === 0) return "Hoje";
  if (difference === 1) return "Ontem";

  const options = date.getFullYear() === new Date().getFullYear()
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };

  return new Intl.DateTimeFormat("pt-BR", options).format(date);
}

function getDrinkEvents(drinkId) {
  return state.events
    .filter((event) => event.drinkId === drinkId)
    .sort((a, b) => a.consumedAt - b.consumedAt || a.id.localeCompare(b.id));
}

function getEventDrinkIdentity(event) {
  const activeDrink = state.drinks.find((drink) => drink.id === event.drinkId);

  if (activeDrink) {
    return {
      id: activeDrink.id,
      name: activeDrink.name,
      icon: activeDrink.icon,
      isDeleted: false,
    };
  }

  return {
    id: event.drinkId,
    name: event.drinkName || "Bebida excluída",
    icon: normalizeIcon(event.drinkIcon),
    isDeleted: true,
  };
}

function isEventBeforePreviousIntervalEnded(events, index) {
  if (index <= 0 || index >= events.length) return false;

  const previous = events[index - 1];
  const current = events[index];
  const previousAvailableAt = previous.consumedAt + previous.intervalMinutes * 60 * 1000;

  return current.consumedAt < previousAvailableAt;
}

function getCurrentViolationClusterCount(events) {
  if (events.length < 2) return 0;

  let index = events.length - 1;
  if (!isEventBeforePreviousIntervalEnded(events, index)) return 0;

  let count = 2;
  index -= 1;

  while (index > 0 && isEventBeforePreviousIntervalEnded(events, index)) {
    count += 1;
    index -= 1;
  }

  return count;
}

function getEventContext(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return null;

  const events = getDrinkEvents(event.drinkId);
  const index = events.findIndex((item) => item.id === eventId);
  const previousEvent = index > 0 ? events[index - 1] : null;

  if (!previousEvent) {
    return {
      event,
      previousEvent: null,
      isViolation: false,
      elapsedMs: null,
      remainingAtConsumptionMs: null,
    };
  }

  const elapsedMs = event.consumedAt - previousEvent.consumedAt;
  const previousAvailableAt = previousEvent.consumedAt + previousEvent.intervalMinutes * 60 * 1000;
  const isViolation = event.consumedAt < previousAvailableAt;

  return {
    event,
    previousEvent,
    isViolation,
    elapsedMs,
    remainingAtConsumptionMs: isViolation ? previousAvailableAt - event.consumedAt : 0,
  };
}

function getDrinkActivity(drink) {
  const events = getDrinkEvents(drink.id);
  const latestEvent = events.at(-1) || null;

  if (!latestEvent) {
    return {
      events,
      latestEvent: null,
      remainingMs: 0,
      violationClusterCount: 0,
      state: "new",
    };
  }

  const availableAt = latestEvent.consumedAt + latestEvent.intervalMinutes * 60 * 1000;
  const remainingMs = Number.isFinite(latestEvent.countingStoppedAt) ? 0 : availableAt - Date.now();
  const violationClusterCount = getCurrentViolationClusterCount(events);

  let activityState = "completed";

  if (remainingMs > 0) {
    activityState = violationClusterCount > 0 ? "danger" : "waiting";
  }

  return {
    events,
    latestEvent,
    remainingMs,
    violationClusterCount,
    state: activityState,
  };
}

function getSortedDrinks() {
  return [...state.drinks].sort((a, b) => {
    const aLatest = getDrinkEvents(a.id).at(-1)?.consumedAt || 0;
    const bLatest = getDrinkEvents(b.id).at(-1)?.consumedAt || 0;

    if (aLatest !== bLatest) return bLatest - aLatest;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function isDrinkInRecentGroup(drink, activity = getDrinkActivity(drink), occasion = null) {
  if (activity.state === "waiting" || activity.state === "danger") return true;
  if (!activity.latestEvent || activity.state === "new") return false;

  if (state.preferences.eventsEnabled) {
    return Boolean(occasion && activity.latestEvent.occasionId === occasion.id);
  }

  return Date.now() - activity.latestEvent.consumedAt < 24 * 60 * 60 * 1000;
}

function getDrinkDisplayGroups() {
  if (state.preferences?.prioritizeRecentDrinks === false) {
    return { recent: [], manual: [...state.drinks] };
  }

  const occasion = state.preferences.eventsEnabled ? FunTimeOccasions.active(state.occasions) : null;
  const recent = [];
  const manual = [];

  state.drinks.forEach((drink) => {
    const activity = getDrinkActivity(drink);
    (isDrinkInRecentGroup(drink, activity, occasion) ? recent : manual).push(drink);
  });

  recent.sort((a, b) => {
    const aLatest = getDrinkEvents(a.id).at(-1)?.consumedAt || 0;
    const bLatest = getDrinkEvents(b.id).at(-1)?.consumedAt || 0;
    return bLatest - aLatest || a.name.localeCompare(b.name, "pt-BR");
  });

  return { recent, manual };
}

function persistManualDrinkOrder(orderedManualIds) {
  const byId = new Map(state.drinks.map((drink) => [drink.id, drink]));
  const ordered = [...orderedManualIds];
  const validOrdered = ordered.filter((id, index) => byId.has(id) && ordered.indexOf(id) === index);
  if (validOrdered.length !== ordered.length) {
    throw new Error("A lista mudou durante a reorganização.");
  }
  const manualIds = new Set(validOrdered);
  let manualIndex = 0;
  const nextDrinks = state.drinks.map((drink) => {
    if (!manualIds.has(drink.id)) return drink;
    return byId.get(validOrdered[manualIndex++]);
  });

  persistDrinkList(nextDrinks);
}

function animateManualDrinkShift(previousPositions) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  drinkList.querySelectorAll('.drink-card[data-reorder-eligible="true"]').forEach((card) => {
    if (card.classList.contains("is-drink-drag-source")) return;
    const previous = previousPositions.get(card.dataset.drinkId);
    if (!previous) return;
    const current = card.getBoundingClientRect();
    const deltaY = previous.top - current.top;
    if (Math.abs(deltaY) < 1) return;
    card._manualReorderAnimation?.cancel();
    const animation = card.animate(
      [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
    card._manualReorderAnimation = animation;
    animation.finished.finally(() => {
      if (card._manualReorderAnimation === animation) card._manualReorderAnimation = null;
    }).catch(() => {});
  });
}

const drinkReorder = createDrinkReorderController({
  state, drinkList, pressMs: DRINK_REORDER_PRESS_MS, moveTolerance: DRINK_REORDER_MOVE_TOLERANCE,
  captureDrinkCardPositions, animateManualDrinkShift, persistManualDrinkOrder,
  showToast, showAppNotification, render,
});

function captureDrinkCardPositions() {
  const positions = new Map();

  drinkList.querySelectorAll(".drink-card[data-drink-id]").forEach((card) => {
    positions.set(card.dataset.drinkId, card.getBoundingClientRect());
  });

  return positions;
}

function animateDrinkReorder(previousPositions, focusDrinkId = null) {
  const noAnimation = {
    movedFocus: false,
    promise: Promise.resolve(),
  };

  if (!previousPositions?.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return noAnimation;
  }

  const animations = [];
  const animatedCards = [];
  let movedFocus = false;

  drinkList.querySelectorAll(".drink-card[data-drink-id]").forEach((card) => {
    const previousRect = previousPositions.get(card.dataset.drinkId);
    if (!previousRect) return;

    const currentRect = card.getBoundingClientRect();
    const deltaX = previousRect.left - currentRect.left;
    const deltaY = previousRect.top - currentRect.top;

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

    const isFocus = card.dataset.drinkId === focusDrinkId;
    if (isFocus && Math.abs(deltaY) >= 4) movedFocus = true;

    card.classList.add("is-reordering-card");
    if (isFocus) card.classList.add("is-reordering-focus");
    animatedCards.push(card);

    const animation = card.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: REORDER_ANIMATION_MS,
        easing: REORDER_ANIMATION_EASING,
        fill: "both",
      }
    );

    animations.push(animation.finished.catch(() => {}));
  });

  if (!animations.length) return noAnimation;

  state.reorderAnimationUntil = Date.now() + REORDER_ANIMATION_MS + 80;
  drinkList.classList.add("is-reordering");

  const promise = Promise.all(animations).finally(() => {
    animatedCards.forEach((card) => {
      card.classList.remove("is-reordering-card", "is-reordering-focus");
    });
    drinkList.classList.remove("is-reordering");
    state.reorderAnimationUntil = 0;
  });

  return { movedFocus, promise };
}

function performNormalDrinkTap(drink, activity) {
  if (activity.state === "waiting" || activity.state === "danger") {
    openIntervalWarningDialog(drink.id);
    return;
  }

  registerDrinkAt(drink.id, Date.now());
}

function attachDrinkInteractions(mainButton, drink) {
  let doubleTapFeedbackTimer = null;

  const showFirstTapFeedback = () => {
    clearTimeout(doubleTapFeedbackTimer);
    mainButton.classList.add("is-awaiting-second-tap");
    doubleTapFeedbackTimer = setTimeout(() => {
      mainButton.classList.remove("is-awaiting-second-tap");
    }, DOUBLE_TAP_FEEDBACK_MS);
  };

  mainButton.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  mainButton.addEventListener("click", (event) => {
    if (performance.now() < state.ignoreDrinkGestureUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const now = performance.now();
    const previousTap = state.pendingDoubleTap;
    const isSecondTap = Boolean(
      previousTap &&
      previousTap.drinkId === drink.id &&
      now - previousTap.at <= DOUBLE_TAP_MAX_DELAY_MS
    );

    if (!isSecondTap) {
      state.pendingDoubleTap = { drinkId: drink.id, at: now };
      showFirstTapFeedback();
      return;
    }

    state.pendingDoubleTap = null;
    state.ignoreDrinkGestureUntil = now + COMPLETED_DOUBLE_TAP_COOLDOWN_MS;
    clearTimeout(doubleTapFeedbackTimer);
    mainButton.classList.remove("is-awaiting-second-tap");

    performNormalDrinkTap(drink, getDrinkActivity(drink));
  });
}

function describeDrinkForRender(drink, manualIds, occasion) {
  const activity = getDrinkActivity(drink);
  const neutral = activity.state === "completed" && (state.preferences.eventsEnabled
    ? (!occasion || activity.latestEvent.occasionId !== occasion.id)
    : Date.now() - activity.latestEvent.consumedAt >= 86400000);
  const associatedNote = Boolean(occasion && activity.remainingMs > 0 && activity.latestEvent && activity.latestEvent.occasionId !== occasion.id);
  const signaturePart = `${drink.id}:${manualIds.has(drink.id) ? "m" : "r"}:${activity.state}:${neutral}:${associatedNote}`;
  return { activity, neutral, associatedNote, signaturePart };
}

function setTickingCardText(mainButton, time, drink, activity) {
  time.textContent = formatActivityCounter(activity);
  mainButton.setAttribute(
    "aria-label",
    activity.state === "waiting"
      ? `${drink.name}: intervalo em andamento. ${formatTime(activity.remainingMs)} restantes. Toque duas vezes para abrir as opções de anotação.`
      : `${drink.name}: atenção. ${activity.violationClusterCount} anotações em sequência antes do intervalo terminar. ${formatTime(activity.remainingMs)} restantes. Toque duas vezes para abrir as opções.`
  );
}

function render() {
  if (state.pendingDrinkReorderId) {
    drinkReorder.cancelPending();
  }
  if (state.draggingDrinkId) {
    drinkReorder.cancelActive();
    return;
  }
  globalThis.refreshOccasionContext?.();
  drinkList.innerHTML = "";
  emptyState.hidden = state.drinks.length > 0;
  homeAddZone.hidden = state.drinks.length === 0;

  const displayGroups = getDrinkDisplayGroups();
  const displayDrinks = [...displayGroups.recent, ...displayGroups.manual];
  const manualIds = new Set(displayGroups.manual.map((drink) => drink.id));
  const signatureParts = [];

  displayDrinks.forEach((drink, index) => {
    if (displayGroups.recent.length && displayGroups.manual.length && index === displayGroups.recent.length) {
      const separator = document.createElement("div");
      separator.className = "drink-group-separator";
      separator.innerHTML = '<span>Outras bebidas</span>';
      drinkList.appendChild(separator);
    }
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".drink-card");
    const mainButton = fragment.querySelector(".drink-main");
    const cardActions = fragment.querySelector(".card-actions");
    const historyButton = fragment.querySelector(".drink-history-button");
    const menuButton = fragment.querySelector(".more-button");
    const icon = fragment.querySelector(".drink-icon");
    const iconSymbol = fragment.querySelector(".drink-icon-symbol");
    const name = fragment.querySelector(".drink-name");
    const stateLabel = fragment.querySelector(".drink-state");
    const status = fragment.querySelector(".drink-status");
    const time = fragment.querySelector(".drink-time");

    card.dataset.drinkId = drink.id;
    card.dataset.reorderEligible = String(manualIds.has(drink.id));
    iconSymbol.textContent = drink.icon;
    icon.classList.toggle("is-reorder-handle", manualIds.has(drink.id));
    icon.title = "";
    name.textContent = drink.name;

    const occasion = state.preferences.eventsEnabled ? FunTimeOccasions.active(state.occasions) : null;
    const { activity, neutral, associatedNote, signaturePart } = describeDrinkForRender(drink, manualIds, occasion);
    signatureParts.push(signaturePart);
    card.classList.add(neutral ? "neutral" : activity.state);

    if (activity.state === "new") {
      stateLabel.textContent = occasion ? "SEM REGISTRO NESTE EVENTO" : "SEM REGISTRO";
      status.textContent = `Intervalo: ${formatInterval(drink.intervalMinutes).replaceAll(" ", "\u00a0")}`;
      time.textContent = "Anotar primeira dose";
      mainButton.setAttribute("aria-label", `Anotar ${drink.name} agora com dois toques rápidos.${manualIds.has(drink.id) ? " Toque e segure o card para reorganizar." : ""}`);
    } else if (activity.state === "waiting") {
      stateLabel.hidden = true;
      setClockStatus(status, "Tomou às", activity.latestEvent.consumedAt, getDoseStatusSuffix(activity.latestEvent));
      setTickingCardText(mainButton, time, drink, activity);
    } else if (activity.state === "danger") {
      stateLabel.textContent = "⚠ TOMOU DOSE POR CIMA DA OUTRA";
      setClockStatus(
        status,
        "Tomou às",
        activity.latestEvent.consumedAt,
        `${getDoseStatusSuffix(activity.latestEvent)} · ${activity.violationClusterCount} registros em sequência`
      );
      setTickingCardText(mainButton, time, drink, activity);
    } else {
      stateLabel.hidden = neutral && !occasion;
      stateLabel.textContent = neutral ? "SEM REGISTRO NESTE EVENTO" : "✓ INTERVALO CONCLUÍDO";
      setPreviousStatus(status, activity.latestEvent.consumedAt, getDoseStatusSuffix(activity.latestEvent), Date.now(), neutral ? "Último registro:" : "Anterior:");
      time.textContent = neutral ? "Anotar dose" : "Anotar nova dose";
      mainButton.setAttribute("aria-label", `Anotar dose de ${drink.name} agora com dois toques rápidos.${manualIds.has(drink.id) ? " Toque e segure o card para reorganizar." : ""}`);
    }

    if (associatedNote) {
      status.append(document.createTextNode(" · Registro anterior ao evento"));
    }
    attachDrinkInteractions(mainButton, drink);
    if (manualIds.has(drink.id)) drinkReorder.attachDrinkReorderGesture(card, mainButton, icon, drink);

    historyButton.setAttribute("aria-label", `Ver histórico de ${drink.name}`);
    historyButton.addEventListener("click", () => openHistoryView(drink.id));

    menuButton.setAttribute("aria-label", `Mais opções para ${drink.name}`);
    menuButton.addEventListener("click", () => openDrinkMenuDialog(drink.id));

    if (state.upsideDownActive) card.prepend(cardActions);

    drinkList.appendChild(fragment);
  });

  state.lastRenderSignature = `${signatureParts.join("|")}#upsideDown:${state.upsideDownActive}`;
}

function tickDrinkCards() {
  globalThis.refreshOccasionContext?.();
  const displayGroups = getDrinkDisplayGroups();
  const manualIds = new Set(displayGroups.manual.map((drink) => drink.id));
  const occasion = state.preferences.eventsEnabled ? FunTimeOccasions.active(state.occasions) : null;
  const signatureParts = [];
  const activitiesById = new Map();

  [...displayGroups.recent, ...displayGroups.manual].forEach((drink) => {
    const { activity, signaturePart } = describeDrinkForRender(drink, manualIds, occasion);
    activitiesById.set(drink.id, activity);
    signatureParts.push(signaturePart);
  });

  const signature = `${signatureParts.join("|")}#upsideDown:${state.upsideDownActive}`;
  if (signature !== state.lastRenderSignature) {
    render();
    return;
  }

  drinkList.querySelectorAll(".drink-card[data-drink-id]").forEach((card) => {
    const activity = activitiesById.get(card.dataset.drinkId);
    if (!activity || (activity.state !== "waiting" && activity.state !== "danger")) return;
    const drink = state.drinks.find((item) => item.id === card.dataset.drinkId);
    if (drink) setTickingCardText(card.querySelector(".drink-main"), card.querySelector(".drink-time"), drink, activity);
  });
}

function renderHistory() {
  historyList.innerHTML = "";

  const filterDrink = state.historyDrinkId
    ? state.drinks.find((drink) => drink.id === state.historyDrinkId) || null
    : null;

  const entries = state.events
    .filter((event) => !state.historyDrinkId || event.drinkId === state.historyDrinkId)
    .filter(event => !state.preferences.eventsEnabled || state.historyOccasionId === "all" || !state.historyOccasionId || (state.historyOccasionId === "none" ? !event.occasionId : event.occasionId === state.historyOccasionId))
    .map((event) => ({ event, drink: getEventDrinkIdentity(event) }))
    .sort((a, b) => b.event.consumedAt - a.event.consumedAt || b.event.id.localeCompare(a.event.id));

  historyCount.textContent = `${entries.length} registro${entries.length === 1 ? "" : "s"}`;
  historyDescription.textContent = filterDrink
    ? `${filterDrink.icon} ${filterDrink.name} · toque em um registro para corrigir o horário ou excluí-lo.`
    : "Toque em um registro para corrigir o horário ou excluí-lo.";
  historyEmptyState.hidden = entries.length > 0;

  if (!entries.length) {
    historyShowMore.hidden = true;
    return;
  }

  // Só os primeiros state.historyLimit registros viram nós de DOM - com até
  // 200 mil eventos permitidos no schema, renderizar tudo de uma vez travaria
  // aparelhos modestos. "Mostrar mais" incrementa o limite; trocar de filtro
  // (openHistoryView/mudar o evento) volta para o valor inicial.
  const visibleEntries = entries.slice(0, state.historyLimit);
  let currentTimeline = null;
  let lastDayKey = null;

  visibleEntries.forEach(({ event, drink }) => {
    const dayKey = getLocalDateKey(event.consumedAt);
    if (dayKey !== lastDayKey) {
      const daySection = document.createElement("section");
      daySection.className = "history-day";

      const title = document.createElement("h2");
      title.className = "history-day-title";
      title.textContent = formatHistoryDay(event.consumedAt);

      currentTimeline = document.createElement("div");
      currentTimeline.className = "history-timeline";

      daySection.append(title, currentTimeline);
      historyList.appendChild(daySection);
      lastDayKey = dayKey;
    }

    const context = getEventContext(event.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-event";
    if (context?.isViolation) button.classList.add("violation");
    button.setAttribute("aria-label", `Editar anotação de ${drink.name}, tomada às ${formatClock(event.consumedAt)}h, ${formatHistoryElapsed(event.consumedAt)}`);

    const marker = document.createElement("span");
    marker.className = "history-marker";
    marker.setAttribute("aria-hidden", "true");

    const time = document.createElement("span");
    time.className = "history-event-time";
    setHistoryClockLabel(time, event.consumedAt);

    const body = document.createElement("span");
    body.className = "history-event-body";

    const heading = document.createElement("span");
    heading.className = "history-event-heading";

    const icon = document.createElement("span");
    icon.className = "history-event-icon";
    icon.textContent = drink.icon;
    icon.setAttribute("aria-hidden", "true");

    const identity = document.createElement("span");
    identity.className = "history-event-identity";

    const name = document.createElement("strong");
    name.textContent = drink.name;
    identity.appendChild(name);

    if (event.doseSize) {
      const doseBadge = document.createElement("span");
      doseBadge.className = `history-dose-badge ${event.doseSize}`;
      doseBadge.textContent = getDoseLabel(event.doseSize);
      identity.appendChild(doseBadge);
    }

    const mobileTime = document.createElement("span");
    mobileTime.className = "history-event-mobile-time";
    setHistoryClockLabel(mobileTime, event.consumedAt);

    const chevron = document.createElement("span");
    chevron.className = "history-event-chevron";
    chevron.textContent = "›";
    chevron.setAttribute("aria-hidden", "true");

    heading.append(icon, identity, mobileTime, chevron);
    body.appendChild(heading);
    const occasion = state.occasions.find(item => item.id === event.occasionId);
    if (state.preferences.eventsEnabled && occasion) {
      const label = document.createElement("span"); label.className = "history-event-detail"; label.textContent = occasion.name; body.append(label);
    }

    const elapsed = document.createElement("span");
    const countingStopped = Number.isFinite(event.countingStoppedAt);
    const intervalCompleted = countingStopped || Date.now() - event.consumedAt >= event.intervalMinutes * 60 * 1000;
    elapsed.className = `history-event-elapsed ${intervalCompleted ? "is-after-interval" : "is-within-interval"}`;
    elapsed.dataset.consumedAt = String(event.consumedAt);
    elapsed.dataset.intervalMinutes = String(event.intervalMinutes);
    elapsed.dataset.countingStopped = String(countingStopped);
    elapsed.textContent = countingStopped ? 'Contagem desfeita' : formatHistoryCounter(event.consumedAt, event.intervalMinutes);
    elapsed.setAttribute(
      "aria-label",
      countingStopped ? 'Contagem encerrada manualmente. Dose mantida no histórico.' : intervalCompleted
        ? `${elapsed.textContent}. O intervalo configurado já terminou.`
        : `${elapsed.textContent}. O intervalo configurado ainda está em andamento.`
    );
    body.appendChild(elapsed);

    if (drink.isDeleted) {
      const deletedBadge = document.createElement("span");
      deletedBadge.className = "history-event-deleted";
      deletedBadge.textContent = "Bebida excluída · registro mantido";
      body.appendChild(deletedBadge);
    }

    if (context?.isViolation) {
      const alert = document.createElement("span");
      alert.className = "history-event-alert";
      alert.textContent = "⚠ Tomou dose por cima da outra";

      const detail = document.createElement("span");
      detail.className = "history-event-detail";
      detail.textContent = `${formatElapsed(context.elapsedMs)} após o registro anterior · faltavam ${formatElapsed(context.remainingAtConsumptionMs)}`;

      body.append(alert, detail);
    }

    button.append(marker, time, body);
    button.addEventListener("click", () => openEventDialog(event.id));
    currentTimeline.appendChild(button);
  });

  historyShowMore.hidden = entries.length <= state.historyLimit;
}

function refreshDataViews() {
  render();
  if (state.currentView === "history") renderHistory();
  globalThis.refreshOccasionContext?.();
}

function openHistoryView(drinkId = null) {
  state.historyOccasionId = "all";
  state.historyLimit = 20;
  const drink = drinkId ? state.drinks.find((item) => item.id === drinkId) : null;
  state.historyDrinkId = drink?.id || null;
  globalThis.refreshOccasionFilters?.();
  state.currentView = "history";

  if (drink) {
    historyHeaderEyebrow.textContent = "Histórico";
    historyHeaderTitle.textContent = drink.name;
  } else {
    historyHeaderEyebrow.textContent = "Registros";
    historyHeaderTitle.textContent = "Histórico";
  }

  setCurrentView("history");
  renderHistory();
  window.scrollTo(0, 0);
}

historyShowMore.addEventListener("click", () => {
  state.historyLimit += 20;
  renderHistory();
});

function closeHistoryView() {
  state.currentView = "home";
  state.historyDrinkId = null;
  setCurrentView("home");
  render();
  window.scrollTo(0, 0);
}

function showAppNotification(message, options = {}) {
  showToast(message, options.undo || null, options);
}

function showToast(message, undo = null, options = {}) {
  clearTimeout(state.toastTimerId);
  state.undo = undo;
  state.notificationOnDismiss = options.onDismiss || null;
  toastMessage.textContent = message;
  toastUndo.hidden = !undo;
  const type = options.type || 'info';
  toast.dataset.type = type;
  document.querySelector('#toast-title').textContent = options.title || (type === 'success' ? 'Concluído' : type === 'error' ? 'Não foi possível concluir' : 'Aviso');
  document.querySelector('#toast-symbol').textContent = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
  toast.hidden = false;
  // Popover permanece acima de diálogos sem bloquear o restante da interface.
  if (typeof toast.showPopover === 'function') {
    if (!toast.matches(':popover-open')) toast.showPopover();
  } else {
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    (dialogs.at(-1) || document.body).append(toast);
  }
  if (!options.persistent) state.toastTimerId = setTimeout(() => {
    state.undo = null;
    hideToast();
  }, type === "error" || undo ? 4000 : 2500);
}

function hideToast() {
  clearTimeout(state.toastTimerId);
  if (typeof toast.hidePopover === 'function' && toast.matches(':popover-open')) toast.hidePopover();
  toast.hidden = true;
  toastUndo.hidden = false;
  state.notificationOnDismiss = null;
}

// Catálogo de ícones/emoji: só é acoplado ao diálogo de bebida porque o HTML está
// aninhado em #drink-dialog (index.html); a lógica em si não depende dele.
const iconCatalog = createIconCatalog({
  state, iconOptions, drinkDialog, persistIconCatalog, clearDrinkFieldError,
  emojiGroups: EMOJI_GROUPS,
});
const { buildIconPicker, getEditingIconCatalog, cancelIconReorder } = iconCatalog;

const drinkNameFieldError = createFieldErrorController({ fieldEl: drinkNameField, errorEl: drinkNameError, inputEl: nameInput });
const drinkIconFieldError = createFieldErrorController({ fieldEl: drinkIconField, errorEl: drinkIconError, inputEl: iconOptions });

function setDrinkFieldError(field, hasError) {
  (field === "name" ? drinkNameFieldError : drinkIconFieldError).set(hasError);
}

function clearDrinkFieldError(field) {
  setDrinkFieldError(field, false);
}

function clearDrinkValidation() {
  clearDrinkFieldError("name");
  clearDrinkFieldError("icon");
}

const showFormError = createFormErrorController(formError);
const showLogFormError = createFormErrorController(logFormError);
const showEventFormError = createFormErrorController(eventFormError);

// Diálogo de edição de um registro do histórico (não confundir com "ocasião/evento
// de agenda", já em occasions-ui.js). Ver docs/specs/0020.
const { openEventDialog, closeEventDialog } = createEventDialog({
  state, eventDialog, eventForm, eventDrinkName, eventDateInput, eventTimeInput,
  eventInterval, eventWarning, eventWarningText, eventDeletedNote, eventFormError, eventDoseField,
  getEventDrinkIdentity, getEventContext, formatInterval, formatElapsed, formatClock,
  toLocalDateInputValue, toLocalTimeInputValue, normalizeDoseSize,
  createWheelPicker, setWheelPickerValue, beginFormDraft,
  showEventFormError, commitAppData, buildCurrentAppData, dataStorageKey: DATA_STORAGE_KEY,
  refreshDataViews, showToast, showAppNotification, showAppConfirmation,
});

// Editor de bebida (cadastro/edição/exclusão) e registro de consumo (menu da
// bebida, dose, log manual, aviso de intervalo em andamento) - se chamam o
// tempo todo de um lado para o outro, por isso um módulo só. Ver docs/specs/0020.
const drinkInteractions = createDrinkInteractions({
  state,
  drinkForm, nameInput, drinkNameField, drinkIconField, formError,
  drinkDialogEyebrow, drinkDialogTitle, drinkSubmitButton, deleteDrinkFromEditorButton,
  drinkDangerZone, drinkIntervalEditNote, askDoseSizeInput, drinkDialog,
  deleteDrinkDialog, deleteDrinkName, deleteDrinkSummary,
  intervalWarningDialog, intervalWarningDrinkName, intervalWarningRemaining,
  intervalWarningMessage, intervalWarningContext,
  drinkMenuDialog, drinkMenuName,
  logDialog, logForm, logDrinkName, activeIntervalWarning, activeIntervalWarningTitle,
  activeIntervalWarningText, logHoursAgoInput, logMinutesAgoInput,
  logHoursWheel, logMinutesWheel, intervalHoursWheel, intervalMinutesWheel,
  intervalHoursInput, intervalMinutesInput, logFormError,
  doseSizeDialog, doseSizeDrinkName, doseHalfButton, doseFullButton, toastUndo,
  createDurationPicker, validateDrinkDraft,
  setDrinkFieldError, clearDrinkFieldError, clearDrinkValidation,
  showFormError, showLogFormError,
  commitAppData, buildCurrentAppData, dataStorageKey: DATA_STORAGE_KEY,
  refreshDataViews, showToast, showAppNotification, hideToast, closeHistoryView,
  normalizeIcon, normalizeDoseSize, createId,
  getEventDrinkIdentity, getDoseLabel, getDrinkActivity, formatClock, formatTime,
  buildIconPicker, cancelIconReorder, beginFormDraft, captureDrinkCardPositions, animateDrinkReorder,
  wireDialogDismissal,
});
const {
  openDrinkDialog, openEditDrinkDialog, openDeleteDrinkDialog, closeDeleteDrinkDialog,
  deleteDrinkKeepingHistory, deleteDrinkWithHistory, closeDrinkDialog, handleDrinkSubmit,
  registerDrinkAt, openDoseSizeDialog, choosePendingDoseSize, closeDoseSizeDialog,
  undoLastRegistration, openDrinkMenuDialog, updateDrinkMenuCountdown, openStopCountdownDialog,
  closeStopCountdownDialog, confirmStopCountdown, closeDrinkMenuDialog, openOtherTimeFromDrinkMenu,
  editDrinkFromDrinkMenu, openIntervalWarningDialog, updateIntervalWarningDialog,
  closeIntervalWarningDialog, continueFromIntervalWarning, openLogDialog, closeLogDialog,
  registerMinutesAgo, handleLogSubmit,
  setDurationPicker, initializeDurationPickers, setLogDurationPicker, initializeLogDurationPickers,
} = drinkInteractions;

function getWaitingWorkerVersion(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (version) => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      resolve(version);
    };
    const timeout = setTimeout(() => finish(null), 2000);
    channel.port1.onmessage = ({ data }) => {
      finish(typeof data?.version === "string" && /^\d+\.\d+\.\d+$/.test(data.version) ? data.version : null);
    };
    try {
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

function showUpdateAvailable(worker) {
  if (!IS_STANDALONE_APP || document.body.classList.contains("terms-pending")) return;
  if (!worker) return;

  state.waitingServiceWorker = worker;
  applyUpdateButton.disabled = false;
  applyUpdateButton.textContent = "Atualizar";
  updateToast.hidden = false;
  const copy = updateToast.querySelector(".update-toast-copy span");
  copy.textContent = "Atualize quando puder. Seus dados locais serão preservados.";
  getWaitingWorkerVersion(worker).then((version) => {
    if (version && state.waitingServiceWorker === worker) {
      copy.textContent = `Atualize quando puder para v${version}. Seus dados locais serão preservados.`;
    }
  });
}

function hideUpdateAvailable() {
  updateToast.hidden = true;
}

async function checkForAppUpdate({ force = false } = {}) {
  const registration = state.serviceWorkerRegistration;
  if (!registration) return "unsupported";
  if (state.updateCheckInFlight) return "busy";

  const now = Date.now();
  if (!force && now - state.lastUpdateCheckAt < 30000) return "throttled";

  state.updateCheckInFlight = true;
  state.lastUpdateCheckAt = now;

  try {
    await registration.update();
    if (registration.waiting) {
      showUpdateAvailable(registration.waiting);
      return "available";
    }
    return registration.installing ? "installing" : "current";
  } catch (error) {
    // Offline é um estado normal da PWA; não mostramos erro ao usuário.
    if (navigator.onLine) {
      console.warn("Não foi possível verificar atualização da PWA.", error);
    }
    return "error";
  } finally {
    state.updateCheckInFlight = false;
  }
}

async function checkForAppUpdateManually() {
  const registration = state.serviceWorkerRegistration;

  if (registration?.waiting) {
    showUpdateAvailable(registration.waiting);
    return;
  }

  checkAppUpdateButton.disabled = true;
  checkAppUpdateButton.textContent = "Verificando…";

  const result = await checkForAppUpdate({ force: true });

  if (result === "available") {
    // O aviso persistente contém a ação Atualizar.
  } else if (result === "installing") {
    showAppNotification("Uma nova versão foi encontrada e está sendo preparada. O botão Atualizar aparecerá em seguida.", { title: "Atualização encontrada" });
  } else if (result === "current") {
    showAppNotification(`Você já está usando a versão mais recente disponível (v${APP_VERSION}).`, { title: "Aplicativo atualizado" });
  } else if (result === "busy") {
    showAppNotification("A verificação já está em andamento. Aguarde um instante e tente novamente.", { title: "Verificando atualização" });
  } else {
    showAppNotification("Não foi possível verificar agora. Confira a conexão com a internet e tente novamente.", { title: "Falha na verificação", type: "error" });
  }

  checkAppUpdateButton.disabled = false;
  checkAppUpdateButton.textContent = "Verificar atualizações";
}

function watchServiceWorkerRegistration(registration) {
  state.serviceWorkerRegistration = registration;

  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateAvailable(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;

    installingWorker.addEventListener("statechange", () => {
      if (
        installingWorker.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        showUpdateAvailable(registration.waiting || installingWorker);
      }
    });
  });
}

async function initializeServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register("./sw.js", {
      updateViaCache: "none",
    });

    watchServiceWorkerRegistration(registration);
    await checkForAppUpdate({ force: true });
  } catch (error) {
    console.error("Falha ao ativar o Service Worker.", error);
  }
}

function applyPendingAppUpdate() {
  const worker = state.waitingServiceWorker || state.serviceWorkerRegistration?.waiting;
  if (!worker) {
    checkForAppUpdate({ force: true });
    return;
  }

  state.updateReloadRequested = true;
  applyUpdateButton.disabled = true;
  applyUpdateButton.textContent = "Atualizando…";

  worker.postMessage({ type: "SKIP_WAITING" });
}

function startClock() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    globalThis.reconcileOccasions?.();
    if (state.currentView === "home" && !state.draggingDrinkId && !state.pendingDrinkReorderId && Date.now() >= state.reorderAnimationUntil) {
      tickDrinkCards();
    } else if (state.currentView === "history") {
      updateHistoryElapsedLabels();
    }
    updateIntervalWarningDialog();
    if (drinkMenuDialog.open) updateDrinkMenuCountdown();
  }, 1000);
}

document.querySelector("#open-history").addEventListener("click", () => openHistoryView());
document.querySelector("#close-history").addEventListener("click", closeHistoryView);
document.querySelector("#open-settings").addEventListener("click", openSettingsView);
document.querySelector("#close-settings").addEventListener("click", closeSettingsView);

countingModeInput.addEventListener("change", () => changeCountingMode(countingModeInput.value));

cleanInterfaceInput.addEventListener("change", () => {
  const preferences = { ...state.preferences, cleanInterface: cleanInterfaceInput.checked };
  try {
    state.preferences = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { preferences }).preferences;
  } catch {
    applyInterfacePreferences();
    showAppNotification("Não foi possível salvar esta configuração.", { type: "error", persistent: true });
    return;
  }
  applyInterfacePreferences();
  showToast(cleanInterfaceInput.checked ? "Interface limpa ativada." : "Informações auxiliares exibidas.");
});

prioritizeRecentDrinksInput.addEventListener("change", () => {
  const preferences = { ...state.preferences, prioritizeRecentDrinks: prioritizeRecentDrinksInput.checked };
  try {
    state.preferences = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { preferences }).preferences;
    render();
    showToast(prioritizeRecentDrinksInput.checked ? "Bebidas recentes priorizadas." : "Ordem manual aplicada a todas as bebidas.");
  } catch (error) {
    prioritizeRecentDrinksInput.checked = state.preferences.prioritizeRecentDrinks;
    showAppNotification("Não foi possível salvar esta configuração.", { type: "error", persistent: true });
  }
});

exportDrinksButton.addEventListener("click", exportDrinks);
importDrinksButton.addEventListener("click", () => {
  drinkImportFileInput.value = "";
  drinkImportFileInput.click();
});
drinkImportFileInput.addEventListener("change", () => {
  const file = drinkImportFileInput.files?.[0];
  if (file) prepareDrinkImportFile(file);
});

createBackupButton.addEventListener("click", createBackup);
restoreBackupButton.addEventListener("click", () => {
  backupRestoreFileInput.value = "";
  backupRestoreFileInput.click();
});
backupRestoreFileInput.addEventListener("change", () => {
  const file = backupRestoreFileInput.files?.[0];
  if (file) prepareBackupRestoreFile(file);
});
checkAppUpdateButton.addEventListener("click", checkForAppUpdateManually);

document.querySelector("#close-drink-import").addEventListener("click", closeDrinkImportDialog);
document.querySelector("#cancel-drink-import").addEventListener("click", closeDrinkImportDialog);
confirmDrinkImportButton.addEventListener("click", confirmDrinkImport);

document.querySelector("#close-backup-restore").addEventListener("click", closeBackupRestoreDialog);
document.querySelector("#cancel-backup-restore").addEventListener("click", closeBackupRestoreDialog);
confirmBackupRestoreButton.addEventListener("click", confirmBackupRestore);

securityEnabledInput.addEventListener("change", () => {
  if (securityEnabledInput.checked) {
    openSecurityMethodDialog("enable");
  } else {
    disableSecurity();
  }
});

document.querySelector("#change-security-method").addEventListener("click", () => openSecurityMethodDialog("change"));
document.querySelector("#lock-now").addEventListener("click", () => {
  if (state.securityConfig.eventUnlockOccasionId) setSecurityEventUnlock(state.securityConfig.eventUnlockOccasionId, false);
  lockApp();
});
securityRelockSelect.addEventListener("change", () => {
  const value = Number(securityRelockSelect.value);
  if (![0, 30, 60, 300, 900].includes(value)) return;
  state.securityConfig.relockSeconds = value;
  saveSecurityConfig();
  showToast("Tempo de bloqueio atualizado.");
});

document.querySelector("#close-security-method").addEventListener("click", () => closeSecurityMethodDialog());
chooseDeviceAuthButton.addEventListener("click", chooseDeviceSecurity);
choosePinAuthButton.addEventListener("click", choosePinSecurity);
document.querySelector("#close-pin-setup").addEventListener("click", () => closePinSetupDialog());
document.querySelector("#cancel-pin-setup").addEventListener("click", () => closePinSetupDialog());
pinSetupForm.addEventListener("submit", handlePinSetupSubmit);
pinSetupValue.addEventListener("input", () => normalizePinInput(pinSetupValue));
pinSetupConfirm.addEventListener("input", () => normalizePinInput(pinSetupConfirm));
pinUnlockForm.addEventListener("submit", handlePinUnlock);
pinUnlockValue.addEventListener("input", () => normalizePinInput(pinUnlockValue, getConfiguredPinLength()));
deviceUnlockButton.addEventListener("click", handleDeviceUnlock);

wireDialogDismissal(drinkDialog, closeDrinkDialog);
wireDialogDismissal(deleteDrinkDialog, () => closeDeleteDrinkDialog(), { cancel: true });
wireDialogDismissal(intervalWarningDialog, closeIntervalWarningDialog);
wireDialogDismissal(drinkMenuDialog, closeDrinkMenuDialog, { cancel: true });
wireDialogDismissal(logDialog, closeLogDialog);
wireDialogDismissal(doseSizeDialog, closeDoseSizeDialog, { cancel: true });
wireDialogDismissal(eventDialog, closeEventDialog);
wireDialogDismissal(drinkImportDialog, closeDrinkImportDialog, { cancel: true });
wireDialogDismissal(backupRestoreDialog, closeBackupRestoreDialog, { cancel: true });
wireDialogDismissal(securityMethodDialog, () => closeSecurityMethodDialog(), { cancel: true });
wireDialogDismissal(pinSetupDialog, () => closePinSetupDialog(), { cancel: true });

document.addEventListener("visibilitychange", () => {
  if (!IS_STANDALONE_APP || document.body.classList.contains("terms-pending")) return;
  if (document.hidden) {
    if (state.securityConfig.enabled) {
      // Se já está bloqueado, a própria lock screen já protege o conteúdo.
      // Não cobrimos a tela de login com o privacy shield.
      if (state.securityLocked) {
        hidePrivacyShield();
        return;
      }

      state.securityHiddenAt = Date.now();
      saveSecuritySession({ hiddenAt: state.securityHiddenAt, lastActiveAt: Date.now() });
      showPrivacyShield();
      closeSensitiveDialogs();
      if (state.securityConfig.relockSeconds === 0 && !isSecurityEventUnlockActive()) lockApp();
    }
    return;
  }

  if (state.securityConfig.enabled && state.securityLocked) {
    // Ao voltar para um app que já estava bloqueado, restaura explicitamente a
    // lock screen. Isso evita o privacy shield permanecer por cima do botão Entrar.
    hidePrivacyShield();
    showLockScreen();
    checkForAppUpdate();
    return;
  }

  globalThis.reconcileOccasions?.();
  const eventUnlockActive = syncSecurityEventUnlock();

  if (state.securityConfig.enabled && state.securityHiddenAt) {
    const elapsedSeconds = (Date.now() - state.securityHiddenAt) / 1000;
    if (!eventUnlockActive && elapsedSeconds >= state.securityConfig.relockSeconds) {
      lockApp();
    } else {
      state.securityHiddenAt = null;
      hidePrivacyShield();
      markSecurityActive();
    }
  } else {
    hidePrivacyShield();
    markSecurityActive();
  }

  if (!state.securityLocked) {
    if (state.currentView === "home") render();
    else if (state.currentView === "history") renderHistory();
    else if (state.currentView === "settings") {
      updateInterfaceSettingsUI();
      updateDataSettingsUI();
      updateSecuritySettingsUI();
    }
    updateIntervalWarningDialog();
  }
  checkForAppUpdate();
});

// Mantém a sessão de desbloqueio durante um refresh/pull-to-refresh.
// sessionStorage sobrevive à recarga da mesma PWA, mas não substitui a autenticação
// quando a sessão expira pelo tempo configurado.
window.addEventListener("beforeunload", () => {
  if (!IS_STANDALONE_APP || document.body.classList.contains("terms-pending")) return;
  if (state.securityConfig.enabled && !state.securityLocked) markSecurityActive();
});

document.addEventListener("pointerdown", () => {
  if (!IS_STANDALONE_APP || document.body.classList.contains("terms-pending")) return;
  if (state.securityConfig.enabled && !state.securityLocked && !document.hidden) markSecurityActive();
}, { passive: true });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!state.updateReloadRequested) return;

    state.updateReloadRequested = false;
    window.location.reload();
  });

  if (document.readyState === "complete") initializeServiceWorker();
  else window.addEventListener("load", initializeServiceWorker);
  window.addEventListener("online", () => checkForAppUpdate({ force: true }));
}

applyUpdateButton.addEventListener("click", applyPendingAppUpdate);
dismissUpdateButton.addEventListener("click", hideUpdateAvailable);

// Pede ao navegador para não apagar o armazenamento deste app sozinho sob
// pressão de espaço em disco. Não protege contra o usuário limpar dados de
// propósito (nenhuma API da web permite isso) - só contra a limpeza
// automática e silenciosa que o navegador faz do que considera "menos usado".
async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch (error) {
    console.warn("Não foi possível solicitar armazenamento persistente.", error);
  }
}

async function bootstrapApp() {
  await requireTermsAcceptance();
  applyInterfacePreferences();
  updateDataSettingsUI();
  initializeDurationPickers();
  initializeLogDurationPickers();
  buildIconPicker(DEFAULT_ICON);
  setCurrentView("home");
  render();
  startClock();
  await initializeSecurity();
  showRestoreSuccessIfNeeded();
  await maybeHandleSharedDrinkImport();
  requestPersistentStorage();
}

const shouldBootstrapInstalledApp = initializeRuntimeMode();

if (shouldBootstrapInstalledApp) {
  bootstrapApp().catch((error) => {
    console.error("Falha ao inicializar o aplicativo.", error);
    globalThis.FunTimeBootFailure?.(new Error("Não foi possível abrir o app. Tente novamente."));
  });
}

initEasterEggs({ state, homeHeader, homeView, toast, updateToast, refreshDataViews });

document.querySelector('#toast-dismiss').addEventListener('click', () => {
  const onDismiss = state.notificationOnDismiss;
  state.undo = null;
  hideToast();
  onDismiss?.();
});

const SYNC_STORAGE_KEY = "funtime-sync-v1";

function isSyncConnected() {
  try { return JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY))?.connected === true; }
  catch { return false; }
}

function rememberSyncConnection(connected) {
  try {
    if (connected) localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ connected: true }));
    else localStorage.removeItem(SYNC_STORAGE_KEY);
  } catch { /* A preferência de sincronizar é secundária: nunca derruba o app. */ }
}

function updateSyncSettingsUI() {
  if (!syncSignInButton) return;

  const available = Boolean(firebaseAuth);
  const user = firebaseAuth?.getCurrentUser() || null;

  if (syncUnavailableNotice) syncUnavailableNotice.hidden = available;
  syncSignInButton.hidden = !available || Boolean(user);
  syncSignOutButton.hidden = !user;
  syncDeleteCloudButton.hidden = !user;
  syncStatusRow.hidden = !user;
  if (user) syncAccountLabel.textContent = user.email || user.displayName || "Conectado";
  // Compartilhar exige conta: sem login não há com quem nem como.
  if (sharingNodes.sharingCard) sharingNodes.sharingCard.hidden = !user;
}

// Aplica em memória o que chegou de outro aparelho. Grava pelo núcleo cru
// (commitToStorage) de propósito: passar por commitAppData reenviaria à nuvem o que
// acabou de vir dela.
function applyRemoteSyncData(data) {
  if (state.securityLocked) { state.pendingSyncApply = data; return; }

  const normalized = normalizeData(data);
  if (!normalized) return;

  commitToStorage(DATA_STORAGE_KEY, normalized, {});
  state.drinks = normalized.drinks;
  state.events = normalized.events;
  state.occasions = normalized.occasions;
  state.preferences = normalized.preferences;

  applyInterfacePreferences();
  updateInterfaceSettingsUI();
  updateDataSettingsUI();
  globalThis.refreshOccasionFilters?.();
  refreshDataViews();
}

function notifyLocalDataChanged(previous) {
  const next = buildCurrentAppData();
  cloudSync?.scheduleSyncPush(previous, next);
  shareWriter?.scheduleSharePush(next);
}

// Chamado por occasions-ui.js (script clássico, sem import) a partir do detalhe do
// evento. `events` já vem filtrado para a ocasião — este módulo não tem `state`.
function openShareOccasionDialog(item, events) {
  shareUI?.openShareOccasionDialog(item, events);
}

// O que chega aqui é exibido, nunca gravado: não passa por commitAppData nem
// commitToStorage, e não faz parte de buildCurrentAppData — histórico de outra
// pessoa não pode se misturar com o dado do próprio aparelho em nenhuma hipótese.
function applySharedViewEntries(entries) {
  if (state.securityLocked) { state.pendingSharedViewApply = entries; return; }
  shareUI?.setSharedEntries(entries);
}

function renderSharedView() {
  shareUI?.renderSharedEntries();
}

function openSharedView() {
  setCurrentView("shared");
  renderSharedView();
  window.scrollTo(0, 0);
}

function closeSharedView() {
  setCurrentView("home");
  render();
  window.scrollTo(0, 0);
}

// Fora do app instalado, `initialData` é propositalmente vazio (ver a definição de
// `initialData`): a tela de instalação não carrega os dados reais. Sincronizar nesse
// estado enviaria um retrato vazio e apagaria o histórico de verdade, então a
// sincronização inteira fica desligada aí — mesma razão do `state.securityConfig`.
firebaseAuth = IS_STANDALONE_APP && isFirebaseConfigured() ? createFirebaseAuth({
  firebaseConfig: getFirebaseConfig(),
  onSignedIn: async ({ user, app }) => {
    rememberSyncConnection(true);
    updateSyncSettingsUI();
    // onAuthStateChanged pode disparar de novo na mesma sessão; sem isto, os listeners
    // do Firestore seriam duplicados.
    if (cloudSync) return;
    cloudSync = createFirestoreSync({
      app, uid: user.uid,
      account: { email: user.email, displayName: user.displayName },
      onRemoteUpdate: applyRemoteSyncData,
      onStatusChange: ({ state: status, error }) => {
        if (status === "error") console.error("Falha ao sincronizar.", error);
      },
    });
    shareWriter = createShareWriter({
      app, uid: user.uid,
      // A lista de pareamentos alimenta duas coisas ao mesmo tempo: quem aparece
      // em "Pessoas de confiança" (shareUI) e, via o ponteiro sharedWithMe de
      // cada uma, o que o leitor somente-leitura precisa escutar.
      onPairingsChange: (lista) => { shareUI?.setPairings(lista); sharedViewReader?.setSources(lista); },
      onSharesChange: (lista) => shareUI?.setShares(lista),
      onStatusChange: ({ state: status, error }) => {
        if (status === "error") console.error("Falha no compartilhamento.", error);
      },
    });
    sharedViewReader = createSharedView({
      app,
      onChange: applySharedViewEntries,
      onStatusChange: ({ state: status, error }) => {
        if (status === "error") console.error("Falha ao ver compartilhamento.", error);
      },
    });
    updateSyncSettingsUI();
    try {
      await cloudSync.start(buildCurrentAppData());
    } catch (error) {
      console.error("Não foi possível iniciar a sincronização.", error);
      showToast("Não foi possível sincronizar agora.");
    }
    try {
      sharedViewReader.start();
      await shareWriter.start();
    } catch (error) {
      console.error("Não foi possível iniciar o compartilhamento.", error);
    }
  },
  onSignedOut: () => {
    cloudSync?.stop();
    cloudSync = null;
    shareWriter?.stop();
    shareWriter = null;
    sharedViewReader?.stop();
    sharedViewReader = null;
    shareUI?.setPairings([]);
    shareUI?.setShares([]);
    shareUI?.setSharedEntries([]);
    shareUI?.closeShareOccasionDialog();
    if (state.currentView === "shared") closeSharedView();
    rememberSyncConnection(false);
    updateSyncSettingsUI();
  },
  // Marca a intenção antes do redirect levar a página embora, para que o app volte
  // reiniciando a autenticação. Se o login for abandonado lá, `onSignedOut` limpa.
  onRedirectStart: () => rememberSyncConnection(true),
}) : null;

syncSignInButton?.addEventListener("click", async () => {
  syncSignInButton.disabled = true;
  try {
    await firebaseAuth.signIn();
  } catch (error) {
    console.error("Falha ao entrar com a Conta Google.", error);
    showToast("Não foi possível entrar. Tente de novo.");
  } finally {
    syncSignInButton.disabled = false;
  }
});

syncSignOutButton?.addEventListener("click", async () => {
  try {
    await cloudSync?.flushPendingWrites();
  } catch (error) {
    console.error("Falha ao enviar as últimas mudanças antes de sair.", error);
  }
  try {
    // Revoga de verdade, não só para de escutar: sem sessão, este aparelho não
    // conseguiria mais revogar depois, e quem está vendo ficaria com uma tela
    // congelada em vez de saber que acabou.
    await shareWriter?.stopAllShares();
  } catch (error) {
    console.error("Falha ao encerrar compartilhamentos antes de sair.", error);
  }
  try {
    await firebaseAuth.signOut();
    showToast("Sincronização desligada. Seus dados continuam neste aparelho.");
  } catch (error) {
    console.error("Falha ao sair da conta.", error);
    showToast("Não foi possível sair agora.");
  }
});

syncDeleteCloudButton?.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Apagar os dados guardados na nuvem? Isso também encerra suas conexões e compartilhamentos com outras pessoas. Os dados deste aparelho são mantidos, e a sincronização será desligada."
  );
  if (!confirmed) return;

  syncDeleteCloudButton.disabled = true;
  try {
    await shareWriter?.deleteAllSharingData();
    await cloudSync?.deleteCloudData();
    cloudSync = null;
    await firebaseAuth.signOut();
    showToast("Dados apagados da nuvem.");
  } catch (error) {
    console.error("Falha ao apagar os dados na nuvem.", error);
    showToast("Não foi possível apagar os dados na nuvem.");
  } finally {
    syncDeleteCloudButton.disabled = false;
  }
});

// Separado dos listeners de auto-bloqueio: aqueles só valem com o app instalado
// (IS_STANDALONE_APP), e sincronizar dados não depende do modo de exibição.
document.addEventListener("visibilitychange", () => {
  if (document.body.classList.contains("terms-pending")) return;
  if (document.hidden) cloudSync?.flushPendingWrites().catch(() => { /* melhor esforço */ });
});

window.addEventListener("beforeunload", () => {
  if (document.body.classList.contains("terms-pending")) return;
  cloudSync?.flushPendingWrites().catch(() => { /* melhor esforço */ });
});

if (sharingNodes.sharingConnect) {
  shareUI = createShareUI({
    nodes: sharingNodes,
    getShareWriter: () => shareWriter,
    showToast,
  });
  shareUI.wire();
  shareUI.setPairings([]);
}

sharingNodes.homeShared?.addEventListener("click", openSharedView);
closeSharedButton?.addEventListener("click", closeSharedView);

if (firebaseAuth && isSyncConnected()) {
  firebaseAuth.init().catch((error) => console.error("Falha ao retomar a sincronização.", error));
}

updateSyncSettingsUI();

// app.js é o único script clássico que virou módulo ES nesta fase (ver
// docs/specs/0017). occasions-ui.js, reset.js, navigation.js e ui.js
// continuam scripts clássicos e leem estes identificadores via globalThis
// em vez de identificador solto — publicados aqui em vez de importados por
// eles porque não têm import/export. Vários tests/*.test.cjs também chamam
// funções de app.js diretamente via page.evaluate (mesmo motivo de
// saveData ter virado um shim de teste na spec 0009) — por isso a lista
// abaixo é mais ampla do que só o que os 4 scripts clássicos leem.
Object.assign(globalThis, {
  notifyLocalDataChanged, summarizeOccasionDoses, openShareOccasionDialog,
  openSharedView, closeSharedView,
  render, saveData, effectiveCountingMode, registerDrinkAt, tickDrinkCards,
  closeSettingsView, openDrinkMenuDialog, openEventDialog, saveSecurityConfig,
  editDrinkFromDrinkMenu, getDrinkActivity, persistIconCatalog, unlockApp,
  openDeleteDrinkDialog, openEditDrinkDialog, BACKUP_EXPORT_TYPE,
  state, DATA_STORAGE_KEY, buildCurrentAppData, refreshDataViews, showToast,
  showAppNotification, setCurrentView, createId, closeHistoryView, openHistoryView,
  renderHistory, getEventDrinkIdentity, toLocalDateInputValue, toLocalTimeInputValue,
  PICKER_ICONS, SECURITY_STORAGE_KEY, hideToast, applyInterfacePreferences,
  updateDataSettingsUI, LEGACY_DRINKS_STORAGE_KEY, SHARE_IMPORT_CACHE_NAME,
  SECURITY_SESSION_KEY, getDefaultSecurityConfig, getConfiguredPinLength,
  getPinLockoutRemainingMs, normalizePinInput, verifyPin, PIN_LOCKOUT_ATTEMPTS,
  PIN_LOCKOUT_MS, registerFailedPinAttempt, verifyDeviceCredential, openSecurityMethodDialog, closeDrinkDialog,
  closeDeleteDrinkDialog, closeDrinkMenuDialog, closeStopCountdownDialog,
  closeIntervalWarningDialog, closeLogDialog, closeDoseSizeDialog, closeEventDialog,
  closeDrinkImportDialog, closeBackupRestoreDialog, closeSecurityMethodDialog,
  closePinSetupDialog, iconOptions, openSettingsView, createWheelPicker, setWheelPickerValue,
  getEditingIconCatalog,
  openDrinkDialog, openLogDialog, openIntervalWarningDialog, continueFromIntervalWarning,
  openDoseSizeDialog, openDrinkImportPreview, choosePinSecurity, disableSecurity,
  updateDrinkMenuCountdown, setLogDurationPicker, buildIconPicker, prepareDrinkImportFile,
  prepareBackupRestoreFile, validateBackupPayload, persistDrinkList, readPendingSharedDrinkFile,
  lockApp, closeSensitiveDialogs, showLockScreen, APP_VERSION, DRINK_EXPORT_TYPE, DATA_VERSION,
  backupRestoreDialog, derivePinHash,
});
// tests/navigation-browser.test.cjs lê `editingIconCatalog` solto (não via
// getEditingIconCatalog()) para checar o valor corrente após um toggle — como é
// um `let` reatribuído em runtime dentro de src/ui/icon-catalog.js, precisa de um
// getter vivo, não uma cópia por valor (que o Object.assign acima faria).
Object.defineProperty(globalThis, "editingIconCatalog", { get: getEditingIconCatalog, configurable: true });
