const DATA_STORAGE_KEY = "balada-v1-data";
const LEGACY_DRINKS_STORAGE_KEY = "balada-v1-drinks";
const DATA_VERSION = 7;
const SECURITY_STORAGE_KEY = "intervalo-security-v1";
const SECURITY_SESSION_KEY = "intervalo-security-session-v1";
const SECURITY_CONFIG_VERSION = 3;
const PIN_LENGTH = 4;
const LEGACY_PIN_LENGTH = 6;
const PIN_PBKDF2_ITERATIONS = 210000;
const PIN_LOCKOUT_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30000;

const PICKER_ICONS = [
  "🍬", "💊", "🍍", "🍭", "🥃", "🍺", "🍷", "🥂",
  "👃", "🐽", "🌿", "🚬", "🌻", "❄️", "🍫", "🍄",
  "🍪", "🌵", "💧", "💦", "😵‍💫", "🕳️", "💤", "💫",
  "🥶", "🥵", "🌊", "🪄", "🧪", "👽", "😈", "🧙‍♂️"
];
const DEFAULT_ICON = "🍺";

const WHEEL_REPEAT_COUNT = 7;
const WHEEL_MIDDLE_REPEAT = Math.floor(WHEEL_REPEAT_COUNT / 2);
const WHEEL_ITEM_HEIGHT = 44;

const REORDER_ANIMATION_MS = 880;
const REORDER_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const LONG_PRESS_MS = 600;
const LONG_PRESS_FEEDBACK_MS = 280;
const LONG_PRESS_MOVE_TOLERANCE = 12;
const DOUBLE_TAP_MAX_DELAY_MS = 430;
const DOUBLE_TAP_FEEDBACK_MS = 430;

const initialData = loadAppData();

const state = {
  drinks: initialData.drinks,
  events: initialData.events,
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
  pendingDoubleTap: null,
  securityConfig: loadSecurityConfig(),
  securityLocked: false,
  securityHiddenAt: null,
  privacyShieldVisible: false,
  pinFailedAttempts: 0,
  pinLockoutUntil: 0,
  pinLockoutTimer: null,
  deviceAuthSupported: false,
  securitySetupContext: "enable",
};

const homeHeader = document.querySelector("#home-header");
const historyHeader = document.querySelector("#history-header");
const homeView = document.querySelector("#home-view");
const historyView = document.querySelector("#history-view");
const historyList = document.querySelector("#history-list");
const historyEmptyState = document.querySelector("#history-empty-state");
const historyCount = document.querySelector("#history-count");
const historyDescription = document.querySelector("#history-description");
const historyHeaderEyebrow = document.querySelector("#history-header-eyebrow");
const historyHeaderTitle = document.querySelector("#history-header-title");

const drinkList = document.querySelector("#drink-list");
const emptyState = document.querySelector("#empty-state");
const homeAddZone = document.querySelector("#home-add-zone");
const drinkDialog = document.querySelector("#drink-dialog");
const drinkForm = document.querySelector("#drink-form");
const nameInput = document.querySelector("#drink-name");
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


function getDefaultSecurityConfig() {
  return {
    version: SECURITY_CONFIG_VERSION,
    enabled: false,
    method: null,
    relockSeconds: 300,
    pin: null,
    webauthn: null,
  };
}

function loadSecurityConfig() {
  try {
    const raw = localStorage.getItem(SECURITY_STORAGE_KEY);
    if (!raw) return getDefaultSecurityConfig();
    const parsed = JSON.parse(raw);
    const config = getDefaultSecurityConfig();
    config.enabled = Boolean(parsed.enabled);
    config.method = parsed.method === "pin" || parsed.method === "device" ? parsed.method : null;
    const storedRelock = Number(parsed.relockSeconds);
    const allowedRelock = [0, 30, 60, 300, 900];
    config.relockSeconds = allowedRelock.includes(storedRelock) ? storedRelock : 300;
    // V1.8.0/1.8.1 usavam 1 minuto como padrão. Na migração para V1.8.3,
    // configurações antigas ainda no padrão anterior passam para o novo padrão de 5 min.
    if (Number(parsed.version || 0) < 3 && storedRelock === 60) config.relockSeconds = 300;
    config.pin = parsed.pin && parsed.pin.salt && parsed.pin.hash ? {
      salt: String(parsed.pin.salt),
      hash: String(parsed.pin.hash),
      iterations: Number(parsed.pin.iterations) || PIN_PBKDF2_ITERATIONS,
      length: [PIN_LENGTH, LEGACY_PIN_LENGTH].includes(Number(parsed.pin.length))
        ? Number(parsed.pin.length)
        : LEGACY_PIN_LENGTH,
    } : null;
    config.webauthn = parsed.webauthn && parsed.webauthn.credentialId && parsed.webauthn.publicKey ? {
      credentialId: String(parsed.webauthn.credentialId),
      publicKey: String(parsed.webauthn.publicKey),
      algorithm: Number(parsed.webauthn.algorithm),
    } : null;
    if (config.enabled && !config.method) config.enabled = false;
    if (config.method === "pin" && !config.pin) config.enabled = false;
    if (config.method === "device" && !config.webauthn) config.enabled = false;
    return config;
  } catch (error) {
    console.warn("Não foi possível carregar as configurações de segurança.", error);
    return getDefaultSecurityConfig();
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

function saveSecurityConfig() {
  localStorage.setItem(SECURITY_STORAGE_KEY, JSON.stringify(state.securityConfig));
}

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

async function derivePinHash(pin, saltBytes, iterations = PIN_PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: saltBytes,
    iterations,
    hash: "SHA-256",
  }, material, 256);
  return new Uint8Array(bits);
}

function getConfiguredPinLength() {
  return state.securityConfig.pin?.length === LEGACY_PIN_LENGTH ? LEGACY_PIN_LENGTH : PIN_LENGTH;
}

function normalizePinInput(input, maxLength = PIN_LENGTH) {
  const digits = input.value.replace(/\D/g, "").slice(0, maxLength);
  if (input.value !== digits) input.value = digits;
  return digits;
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

function derEcdsaSignatureToRaw(signature, coordinateLength = 32) {
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
  if (bytes.length === coordinateLength * 2 && bytes[0] !== 0x30) return bytes;
  if (bytes[0] !== 0x30) throw new Error("Assinatura ECDSA inválida.");

  let offset = 1;
  let sequenceLength = bytes[offset++];
  if (sequenceLength & 0x80) {
    const lengthBytes = sequenceLength & 0x7f;
    sequenceLength = 0;
    for (let i = 0; i < lengthBytes; i += 1) sequenceLength = (sequenceLength << 8) | bytes[offset++];
  }

  if (bytes[offset++] !== 0x02) throw new Error("Assinatura ECDSA sem R.");
  let rLength = bytes[offset++];
  let r = bytes.slice(offset, offset + rLength);
  offset += rLength;
  if (bytes[offset++] !== 0x02) throw new Error("Assinatura ECDSA sem S.");
  let sLength = bytes[offset++];
  let s = bytes.slice(offset, offset + sLength);

  while (r.length > coordinateLength && r[0] === 0) r = r.slice(1);
  while (s.length > coordinateLength && s[0] === 0) s = s.slice(1);
  if (r.length > coordinateLength || s.length > coordinateLength) throw new Error("Assinatura ECDSA fora do tamanho esperado.");

  const raw = new Uint8Array(coordinateLength * 2);
  raw.set(r, coordinateLength - r.length);
  raw.set(s, coordinateLength * 2 - s.length);
  return raw;
}

async function createDeviceCredential() {
  if (!state.deviceAuthSupported) throw new Error("A autenticação do aparelho não está disponível neste dispositivo.");

  const challenge = randomBytes(32);
  const userId = randomBytes(16);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Intervalo" },
      user: {
        id: userId,
        name: `intervalo-${Date.now()}@local`,
        displayName: "Intervalo",
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
}

function openSettingsView() {
  setCurrentView("settings");
  updateSecuritySettingsUI();
  window.scrollTo(0, 0);
}

function closeSettingsView() {
  setCurrentView("home");
  render();
  window.scrollTo(0, 0);
}

function openSecurityMethodDialog(context = "enable") {
  state.securitySetupContext = context;
  securityMethodError.hidden = true;
  securityMethodError.textContent = "";
  updateSecuritySettingsUI();
  securityMethodDialog.showModal();
}

function closeSecurityMethodDialog({ cancelEnable = true } = {}) {
  if (securityMethodDialog.open) securityMethodDialog.close();
  if (cancelEnable && state.securitySetupContext === "enable" && !state.securityConfig.enabled) {
    securityEnabledInput.checked = false;
  }
}

function openPinSetupDialog() {
  pinSetupValue.value = "";
  pinSetupConfirm.value = "";
  pinSetupError.hidden = true;
  pinSetupDialog.showModal();
  setTimeout(() => pinSetupValue.focus(), 50);
}

function closePinSetupDialog({ cancelEnable = true } = {}) {
  if (pinSetupDialog.open) pinSetupDialog.close();
  if (cancelEnable && state.securitySetupContext === "enable" && !state.securityConfig.enabled) {
    securityEnabledInput.checked = false;
  }
}

async function configurePinSecurity(pin) {
  const salt = randomBytes(16);
  const hash = await derivePinHash(pin, salt);
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

async function configureDeviceSecurity() {
  const credential = await createDeviceCredential();
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

function closeSensitiveDialogs() {
  document.querySelectorAll("dialog[open]").forEach((dialog) => {
    try { dialog.close(); } catch (error) { /* noop */ }
  });
  hideUpdateAvailable();
  if (!toast.hidden) toast.hidden = true;
}

function showLockScreen() {
  document.body.classList.add("app-locked");
  lockScreen.hidden = false;
  lockError.hidden = true;
  lockError.textContent = "";
  const method = state.securityConfig.method;
  deviceUnlockPanel.hidden = method !== "device";
  pinUnlockForm.hidden = method !== "pin";
  pinUnlockValue.value = "";
  if (method === "pin") {
    const pinLength = getConfiguredPinLength();
    pinUnlockValue.maxLength = pinLength;
    pinUnlockValue.placeholder = "•".repeat(pinLength);
    setTimeout(() => pinUnlockValue.focus(), 80);
  }
}

function lockApp() {
  if (!state.securityConfig.enabled) return;
  state.securityLocked = true;
  clearSecuritySession();
  hidePrivacyShield();
  closeSensitiveDialogs();
  showLockScreen();
}

function unlockApp({ persistSession = true } = {}) {
  state.securityLocked = false;
  state.securityHiddenAt = null;
  state.pinFailedAttempts = 0;
  state.pinLockoutUntil = 0;
  clearTimeout(state.pinLockoutTimer);
  lockScreen.hidden = true;
  document.body.classList.remove("app-locked");
  hidePrivacyShield();
  if (persistSession) markSecurityActive();
  if (state.currentView === "home") render();
  else if (state.currentView === "history") renderHistory();
}

function showPrivacyShield() {
  if (!state.securityConfig.enabled) return;
  state.privacyShieldVisible = true;
  privacyShield.hidden = false;
}

function hidePrivacyShield() {
  state.privacyShieldVisible = false;
  privacyShield.hidden = true;
}

function getPinLockoutRemainingMs() {
  return Math.max(0, state.pinLockoutUntil - Date.now());
}

function updatePinLockoutMessage() {
  const remaining = getPinLockoutRemainingMs();
  if (remaining <= 0) {
    lockError.hidden = true;
    lockError.textContent = "";
    state.pinFailedAttempts = 0;
    state.pinLockoutUntil = 0;
    return;
  }
  lockError.hidden = false;
  lockError.textContent = `Muitas tentativas. Tente novamente em ${Math.ceil(remaining / 1000)} s.`;
  state.pinLockoutTimer = setTimeout(updatePinLockoutMessage, 1000);
}

async function verifyPin(pin) {
  const stored = state.securityConfig.pin;
  if (!stored) return false;
  const salt = base64UrlToBytes(stored.salt);
  const derived = await derivePinHash(pin, salt, stored.iterations);
  return equalBytes(derived, base64UrlToBytes(stored.hash));
}

async function handlePinUnlock(event) {
  event.preventDefault();
  if (getPinLockoutRemainingMs() > 0) {
    updatePinLockoutMessage();
    return;
  }

  const pinLength = getConfiguredPinLength();
  const pin = normalizePinInput(pinUnlockValue, pinLength);
  if (pin.length !== pinLength) {
    lockError.hidden = false;
    lockError.textContent = `Digite os ${pinLength} dígitos do PIN.`;
    return;
  }

  try {
    if (await verifyPin(pin)) {
      unlockApp();
      return;
    }
  } catch (error) {
    console.warn("Falha ao verificar PIN.", error);
  }

  state.pinFailedAttempts += 1;
  pinUnlockValue.value = "";
  if (state.pinFailedAttempts >= PIN_LOCKOUT_ATTEMPTS) {
    state.pinLockoutUntil = Date.now() + PIN_LOCKOUT_MS;
    updatePinLockoutMessage();
  } else {
    lockError.hidden = false;
    lockError.textContent = `PIN incorreto. Restam ${PIN_LOCKOUT_ATTEMPTS - state.pinFailedAttempts} tentativa(s).`;
    pinUnlockValue.focus();
  }
}

async function handleDeviceUnlock() {
  deviceUnlockButton.disabled = true;
  deviceUnlockButton.textContent = "Verificando…";
  lockError.hidden = true;
  try {
    const ok = await verifyDeviceCredential();
    if (!ok) throw new Error("Não foi possível confirmar a autenticação.");
    unlockApp();
  } catch (error) {
    lockError.hidden = false;
    lockError.textContent = error?.name === "NotAllowedError" ? "Autenticação cancelada ou não concluída." : (error?.message || "Não foi possível desbloquear.");
  } finally {
    deviceUnlockButton.disabled = false;
    deviceUnlockButton.textContent = "Entrar";
  }
}

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
  try {
    await configurePinSecurity(pin);
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
  try {
    await configureDeviceSecurity();
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
  securityMethodDialog.close();
  openPinSetupDialog();
}

function disableSecurity() {
  const confirmed = window.confirm("Desativar o bloqueio do aplicativo?");
  if (!confirmed) {
    securityEnabledInput.checked = true;
    return;
  }
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
    const session = loadSecuritySession();
    const referenceAt = session?.hiddenAt || session?.lastActiveAt || 0;
    const relockMs = state.securityConfig.relockSeconds * 1000;
    const mayResume = state.securityConfig.relockSeconds > 0 && referenceAt > 0 && (Date.now() - referenceAt) < relockMs;

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
  try {
    const raw = localStorage.getItem(DATA_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeData(parsed);

      if (normalized) {
        return normalized;
      }
    }
  } catch (error) {
    console.error("Não foi possível carregar os dados atuais.", error);
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
        intervalMinutes: normalizeIntervalMinutes(event.intervalMinutes),
        doseSize: normalizeDoseSize(event.doseSize),
      };
    });

  return {
    version: DATA_VERSION,
    drinks,
    events,
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

function saveData() {
  const data = {
    version: DATA_VERSION,
    drinks: state.drinks,
    events: state.events,
  };

  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatClock(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatHistoryElapsed(timestamp, now = Date.now()) {
  const elapsedMs = Math.max(0, now - Number(timestamp));
  const totalMinutes = Math.floor(elapsedMs / 60000);

  if (totalMinutes < 1) return "menos de 1 min atrás";
  if (totalMinutes < 60) return `${totalMinutes} min atrás`;

  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}h atrás`;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  return `${days} ${days === 1 ? "dia" : "dias"} atrás`;
}

function setHistoryClockLabel(element, timestamp) {
  element.replaceChildren();
  element.append(document.createTextNode(`às ${formatClock(timestamp)}`));

  const unit = document.createElement("span");
  unit.className = "time-unit";
  unit.textContent = "h";
  element.append(unit);
}

function updateHistoryElapsedLabels() {
  const now = Date.now();

  document.querySelectorAll(".history-event-elapsed[data-consumed-at]").forEach((element) => {
    const timestamp = Number(element.dataset.consumedAt);
    const intervalMinutes = Number(element.dataset.intervalMinutes);
    if (!Number.isFinite(timestamp)) return;

    const label = formatHistoryElapsed(timestamp, now);
    const intervalMs = Number.isFinite(intervalMinutes) ? Math.max(0, intervalMinutes) * 60 * 1000 : 0;
    const intervalCompleted = intervalMs === 0 || now - timestamp >= intervalMs;

    element.textContent = label;
    element.classList.toggle("is-within-interval", !intervalCompleted);
    element.classList.toggle("is-after-interval", intervalCompleted);
    element.setAttribute(
      "aria-label",
      intervalCompleted
        ? `Tempo desde o consumo: ${label}. O intervalo configurado já terminou.`
        : `Tempo desde o consumo: ${label}. O intervalo configurado ainda está em andamento.`
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

function formatInterval(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
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
  const remainingMs = availableAt - Date.now();
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
  let longPressTimer = null;
  let feedbackTimer = null;
  let doubleTapFeedbackTimer = null;
  let startX = 0;
  let startY = 0;
  let activePointerId = null;
  let longPressTriggered = false;

  const clearPressTimers = () => {
    clearTimeout(longPressTimer);
    clearTimeout(feedbackTimer);
    longPressTimer = null;
    feedbackTimer = null;
    mainButton.classList.remove("is-long-pressing");
  };

  const cancelPress = () => {
    clearPressTimers();
    activePointerId = null;
  };

  const showFirstTapFeedback = () => {
    clearTimeout(doubleTapFeedbackTimer);
    mainButton.classList.add("is-awaiting-second-tap");
    doubleTapFeedbackTimer = setTimeout(() => {
      mainButton.classList.remove("is-awaiting-second-tap");
    }, DOUBLE_TAP_FEEDBACK_MS);
  };

  mainButton.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearPressTimers();
    longPressTriggered = false;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;

    feedbackTimer = setTimeout(() => {
      if (activePointerId === event.pointerId) {
        mainButton.classList.add("is-long-pressing");
      }
    }, LONG_PRESS_FEEDBACK_MS);

    longPressTimer = setTimeout(() => {
      if (activePointerId !== event.pointerId) return;

      longPressTriggered = true;
      state.pendingDoubleTap = null;
      clearPressTimers();
      mainButton.classList.remove("is-awaiting-second-tap");

      if (typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(30);
        } catch (error) {
          // Vibração é apenas feedback opcional; alguns browsers a bloqueiam.
        }
      }

      openLogDialog(drink.id);
    }, LONG_PRESS_MS);
  });

  mainButton.addEventListener("pointermove", (event) => {
    if (activePointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (distance > LONG_PRESS_MOVE_TOLERANCE) cancelPress();
  }, { passive: true });

  mainButton.addEventListener("pointerup", (event) => {
    if (activePointerId === event.pointerId) cancelPress();
  });

  mainButton.addEventListener("pointercancel", (event) => {
    if (activePointerId === event.pointerId) cancelPress();
  });

  mainButton.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  mainButton.addEventListener("click", (event) => {
    if (longPressTriggered) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggered = false;
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
    clearTimeout(doubleTapFeedbackTimer);
    mainButton.classList.remove("is-awaiting-second-tap");

    performNormalDrinkTap(drink, getDrinkActivity(drink));
  });
}

function render() {
  drinkList.innerHTML = "";
  emptyState.hidden = state.drinks.length > 0;
  homeAddZone.hidden = state.drinks.length === 0;

  getSortedDrinks().forEach((drink) => {
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".drink-card");
    const mainButton = fragment.querySelector(".drink-main");
    const historyButton = fragment.querySelector(".drink-history-button");
    const menuButton = fragment.querySelector(".more-button");
    const icon = fragment.querySelector(".drink-icon");
    const name = fragment.querySelector(".drink-name");
    const stateLabel = fragment.querySelector(".drink-state");
    const status = fragment.querySelector(".drink-status");
    const time = fragment.querySelector(".drink-time");

    card.dataset.drinkId = drink.id;
    icon.textContent = drink.icon;
    name.textContent = drink.name;

    const activity = getDrinkActivity(drink);
    card.classList.add(activity.state);

    if (activity.state === "new") {
      stateLabel.textContent = "SEM REGISTRO";
      status.textContent = `Intervalo configurado: ${formatInterval(drink.intervalMinutes)}`;
      time.textContent = "Anotar primeira dose";
      mainButton.setAttribute("aria-label", `Anotar ${drink.name} agora com dois toques rápidos. Toque e segure para anotar outra dose.`);
    } else if (activity.state === "waiting") {
      stateLabel.hidden = true;
      setClockStatus(status, "Tomou às", activity.latestEvent.consumedAt, getDoseStatusSuffix(activity.latestEvent));
      time.textContent = `⛔ Aguarde: ${formatTime(activity.remainingMs)}`;
      mainButton.setAttribute(
        "aria-label",
        `${drink.name}: intervalo em andamento. ${formatTime(activity.remainingMs)} restantes. Toque duas vezes para abrir as opções de anotação ou toque e segure para anotar outra dose.`
      );
    } else if (activity.state === "danger") {
      stateLabel.textContent = "⚠ TOMOU DOSE POR CIMA DA OUTRA";
      setClockStatus(
        status,
        "Tomou às",
        activity.latestEvent.consumedAt,
        `${getDoseStatusSuffix(activity.latestEvent)} · ${activity.violationClusterCount} registros em sequência`
      );
      time.textContent = `⛔ Aguarde: ${formatTime(activity.remainingMs)}`;
      mainButton.setAttribute(
        "aria-label",
        `${drink.name}: atenção. ${activity.violationClusterCount} anotações em sequência antes do intervalo terminar. ${formatTime(activity.remainingMs)} restantes. Toque duas vezes para abrir as opções ou toque e segure para anotar outra dose.`
      );
    } else {
      stateLabel.textContent = "✓ INTERVALO CONCLUÍDO";
      setClockStatus(status, "Anterior:", activity.latestEvent.consumedAt, getDoseStatusSuffix(activity.latestEvent));
      time.textContent = "Anotar nova dose";
      mainButton.setAttribute("aria-label", `Anotar nova dose de ${drink.name} agora com dois toques rápidos. Toque e segure para anotar outra dose.`);
    }

    attachDrinkInteractions(mainButton, drink);

    historyButton.setAttribute("aria-label", `Ver histórico de ${drink.name}`);
    historyButton.addEventListener("click", () => openHistoryView(drink.id));

    menuButton.setAttribute("aria-label", `Mais opções para ${drink.name}`);
    menuButton.addEventListener("click", () => openDrinkMenuDialog(drink.id));

    drinkList.appendChild(fragment);
  });
}

function renderHistory() {
  historyList.innerHTML = "";

  const filterDrink = state.historyDrinkId
    ? state.drinks.find((drink) => drink.id === state.historyDrinkId) || null
    : null;

  const entries = state.events
    .filter((event) => !state.historyDrinkId || event.drinkId === state.historyDrinkId)
    .map((event) => ({ event, drink: getEventDrinkIdentity(event) }))
    .sort((a, b) => b.event.consumedAt - a.event.consumedAt || b.event.id.localeCompare(a.event.id));

  historyCount.textContent = `${entries.length} registro${entries.length === 1 ? "" : "s"}`;
  historyDescription.textContent = filterDrink
    ? `${filterDrink.icon} ${filterDrink.name} · toque em um registro para corrigir o horário ou excluí-lo.`
    : "Toque em um registro para corrigir o horário ou excluí-lo.";
  historyEmptyState.hidden = entries.length > 0;

  if (!entries.length) return;

  const groups = new Map();

  entries.forEach((entry) => {
    const key = getLocalDateKey(entry.event.consumedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  groups.forEach((groupEntries) => {
    const daySection = document.createElement("section");
    daySection.className = "history-day";

    const title = document.createElement("h2");
    title.className = "history-day-title";
    title.textContent = formatHistoryDay(groupEntries[0].event.consumedAt);

    const timeline = document.createElement("div");
    timeline.className = "history-timeline";

    groupEntries.forEach(({ event, drink }) => {
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

      const elapsed = document.createElement("span");
      const intervalCompleted = Date.now() - event.consumedAt >= event.intervalMinutes * 60 * 1000;
      elapsed.className = `history-event-elapsed ${intervalCompleted ? "is-after-interval" : "is-within-interval"}`;
      elapsed.dataset.consumedAt = String(event.consumedAt);
      elapsed.dataset.intervalMinutes = String(event.intervalMinutes);
      elapsed.textContent = formatHistoryElapsed(event.consumedAt);
      elapsed.setAttribute(
        "aria-label",
        intervalCompleted
          ? `Tempo desde o consumo: ${elapsed.textContent}. O intervalo configurado já terminou.`
          : `Tempo desde o consumo: ${elapsed.textContent}. O intervalo configurado ainda está em andamento.`
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
      timeline.appendChild(button);
    });

    daySection.append(title, timeline);
    historyList.appendChild(daySection);
  });
}

function refreshDataViews() {
  render();
  if (state.currentView === "history") renderHistory();
}

function openHistoryView(drinkId = null) {
  const drink = drinkId ? state.drinks.find((item) => item.id === drinkId) : null;
  state.historyDrinkId = drink?.id || null;
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

function closeHistoryView() {
  state.currentView = "home";
  state.historyDrinkId = null;
  setCurrentView("home");
  render();
  window.scrollTo(0, 0);
}

function registerDrinkAt(id, timestamp) {
  const drink = state.drinks.find((item) => item.id === id);
  if (!drink) return;

  // Capturamos as posições antes de alterar os dados. Depois do render,
  // usamos FLIP para mostrar visualmente a bebida mudando de posição.
  const previousPositions = state.currentView === "home"
    ? captureDrinkCardPositions()
    : null;

  const event = {
    id: createId(),
    drinkId: id,
    drinkName: drink.name,
    drinkIcon: drink.icon,
    consumedAt: timestamp,
    intervalMinutes: drink.intervalMinutes,
    doseSize: drink.askDoseSize ? "full" : null,
  };

  state.events.push(event);
  saveData();
  refreshDataViews();

  const reorder = state.currentView === "home"
    ? animateDrinkReorder(previousPositions, drink.id)
    : { movedFocus: false, promise: Promise.resolve() };

  if (drink.askDoseSize) {
    // Se o card realmente mudou de lugar, deixamos o usuário enxergar o
    // movimento antes de abrir a escolha de meia/inteira. O registro já foi
    // salvo como inteiro, então a espera é apenas visual.
    if (reorder.movedFocus) {
      reorder.promise.finally(() => openDoseSizeDialog(event.id));
    } else {
      openDoseSizeDialog(event.id);
    }
    return;
  }

  showRegistrationToast(event);
}

function showRegistrationToast(event) {
  const drink = getEventDrinkIdentity(event);
  const doseLabel = getDoseLabel(event.doseSize);
  const doseText = doseLabel ? ` · ${doseLabel}` : "";

  showToast(`Consumo de ${drink.name} anotado às ${formatClock(event.consumedAt)}${doseText}.`, {
    type: "add-event",
    eventId: event.id,
  });
}

function openDoseSizeDialog(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  const drink = getEventDrinkIdentity(event);
  state.pendingDoseEventId = eventId;
  doseSizeDrinkName.textContent = `${drink.icon} ${drink.name}`;
  updateDoseDialogSelection(event.doseSize || "full");
  doseSizeDialog.showModal();
}

function updateDoseDialogSelection(value) {
  const isHalf = value === "half";
  doseHalfButton.classList.toggle("is-selected", isHalf);
  doseFullButton.classList.toggle("is-selected", !isHalf);
  doseHalfButton.setAttribute("aria-pressed", String(isHalf));
  doseFullButton.setAttribute("aria-pressed", String(!isHalf));
}

function choosePendingDoseSize(value) {
  const event = state.events.find((item) => item.id === state.pendingDoseEventId);
  if (!event) {
    closeDoseSizeDialog({ showResult: false });
    return;
  }

  event.doseSize = value === "half" ? "half" : "full";
  saveData();
  refreshDataViews();
  updateDoseDialogSelection(event.doseSize);
  closeDoseSizeDialog();
}

function closeDoseSizeDialog({ showResult = true } = {}) {
  const eventId = state.pendingDoseEventId;
  const event = state.events.find((item) => item.id === eventId);
  state.pendingDoseEventId = null;

  if (doseSizeDialog.open) doseSizeDialog.close();

  // O registro nasce como dose inteira. Fechar o popup sem escolher mantém esse padrão.
  if (showResult && event) showRegistrationToast(event);
}

function undoLastRegistration() {
  if (!state.undo || state.undo.type !== "add-event") return;

  state.events = state.events.filter((event) => event.id !== state.undo.eventId);
  saveData();
  refreshDataViews();
  state.undo = null;
  hideToast();
}

function showToast(message, undo = null) {
  clearTimeout(state.toastTimerId);
  state.undo = undo;
  toastMessage.textContent = message;
  toastUndo.hidden = !undo;
  toast.hidden = false;

  state.toastTimerId = setTimeout(() => {
    state.undo = null;
    hideToast();
  }, 7000);
}

function hideToast() {
  clearTimeout(state.toastTimerId);
  toast.hidden = true;
  toastUndo.hidden = false;
}

function openDrinkDialog() {
  state.editingDrinkId = null;
  drinkForm.reset();
  setDurationPicker(1, 0);
  formError.hidden = true;
  drinkDialogEyebrow.textContent = "Nova bebida";
  drinkDialogTitle.textContent = "Cadastrar";
  drinkSubmitButton.textContent = "Salvar";
  deleteDrinkFromEditorButton.hidden = true;
  drinkDangerZone.hidden = true;
  drinkIntervalEditNote.hidden = true;
  askDoseSizeInput.checked = false;

  buildIconPicker(DEFAULT_ICON);

  drinkDialog.showModal();
  requestAnimationFrame(() => {
    setDurationPicker(1, 0);
    nameInput.focus();
  });
}

function openEditDrinkDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.editingDrinkId = drinkId;
  drinkForm.reset();
  formError.hidden = true;
  drinkDialogEyebrow.textContent = "Editar bebida";
  drinkDialogTitle.textContent = drink.name;
  drinkSubmitButton.textContent = "Salvar alterações";
  deleteDrinkFromEditorButton.hidden = false;
  drinkDangerZone.hidden = false;
  drinkIntervalEditNote.hidden = false;

  nameInput.value = drink.name;
  askDoseSizeInput.checked = Boolean(drink.askDoseSize);
  setDurationPicker(Math.floor(drink.intervalMinutes / 60), drink.intervalMinutes % 60);

  buildIconPicker(drink.icon);

  drinkDialog.showModal();
  requestAnimationFrame(() => {
    setDurationPicker(Math.floor(drink.intervalMinutes / 60), drink.intervalMinutes % 60);
    nameInput.focus();
  });
}

function openDeleteDrinkDialog(drinkId, { returnToEditorOnCancel = false } = {}) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.deleteDrinkId = drinkId;
  state.deleteReturnToEditor = returnToEditorOnCancel;
  const eventCount = state.events.filter((event) => event.drinkId === drinkId).length;

  deleteDrinkName.textContent = drink.name;
  deleteDrinkSummary.textContent = eventCount > 0
    ? `Existem ${eventCount} registro${eventCount === 1 ? "" : "s"} desta bebida no histórico.`
    : "Esta bebida ainda não possui registros no histórico.";

  if (drinkDialog.open) drinkDialog.close();
  deleteDrinkDialog.showModal();
}

function closeDeleteDrinkDialog({ returnToEditor = state.deleteReturnToEditor } = {}) {
  const drinkId = state.deleteDrinkId;
  state.deleteDrinkId = null;
  state.deleteReturnToEditor = false;
  deleteDrinkDialog.close();

  if (returnToEditor && drinkId && state.drinks.some((drink) => drink.id === drinkId)) {
    openEditDrinkDialog(drinkId);
  }
}

function deleteDrinkKeepingHistory() {
  const drinkId = state.deleteDrinkId;
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.events = state.events.map((event) => {
    if (event.drinkId !== drinkId) return event;
    return {
      ...event,
      drinkName: drink.name,
      drinkIcon: drink.icon,
    };
  });

  state.drinks = state.drinks.filter((item) => item.id !== drinkId);
  state.editingDrinkId = null;
  saveData();
  closeDeleteDrinkDialog();
  refreshDataViews();
  showToast(`${drink.name} foi excluída da lista. O histórico foi mantido.`);
}

function deleteDrinkWithHistory() {
  const drinkId = state.deleteDrinkId;
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.drinks = state.drinks.filter((item) => item.id !== drinkId);
  state.events = state.events.filter((event) => event.drinkId !== drinkId);
  state.editingDrinkId = null;
  saveData();
  closeDeleteDrinkDialog();
  refreshDataViews();
  showToast(`${drink.name} e seus registros foram excluídos.`);
}

function closeDrinkDialog() {
  state.editingDrinkId = null;
  drinkDialog.close();
}

function openDrinkMenuDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.menuDrinkId = drinkId;
  drinkMenuName.textContent = `${drink.icon} ${drink.name}`;
  drinkMenuDialog.showModal();
}

function closeDrinkMenuDialog() {
  state.menuDrinkId = null;
  if (drinkMenuDialog.open) drinkMenuDialog.close();
}

function openOtherTimeFromDrinkMenu() {
  const drinkId = state.menuDrinkId;
  closeDrinkMenuDialog();
  if (drinkId) openLogDialog(drinkId);
}

function editDrinkFromDrinkMenu() {
  const drinkId = state.menuDrinkId;
  closeDrinkMenuDialog();
  if (drinkId) openEditDrinkDialog(drinkId);
}

function deleteDrinkFromDrinkMenu() {
  const drinkId = state.menuDrinkId;
  closeDrinkMenuDialog();
  if (drinkId) openDeleteDrinkDialog(drinkId);
}

function openIntervalWarningDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  const activity = getDrinkActivity(drink);

  if (activity.state !== "waiting" && activity.state !== "danger") {
    openLogDialog(drinkId);
    return;
  }

  state.pendingDrinkId = drinkId;
  intervalWarningDrinkName.textContent = drink.name;
  intervalWarningDialog.showModal();
  updateIntervalWarningDialog();
}

function updateIntervalWarningDialog() {
  if (!state.pendingDrinkId || !intervalWarningDialog.open) return;

  const drink = state.drinks.find((item) => item.id === state.pendingDrinkId);
  if (!drink) return;

  const activity = getDrinkActivity(drink);

  if (activity.remainingMs > 0) {
    intervalWarningRemaining.textContent = `Ainda faltam ${formatTime(activity.remainingMs)} do intervalo atual.`;
  } else {
    intervalWarningRemaining.textContent = "O intervalo terminou enquanto esta tela estava aberta.";
  }

  if (activity.state === "danger") {
    intervalWarningContext.hidden = false;
    intervalWarningContext.textContent = `${activity.violationClusterCount} registros já ocorreram em sequência antes de completar o intervalo configurado.`;
    intervalWarningMessage.textContent = "Se houve outro consumo, anote-o. O app manterá os registros anteriores e atualizará o alerta com base na sequência real.";
  } else {
    intervalWarningContext.hidden = true;
    intervalWarningMessage.textContent = "Se você já consumiu novamente, anote o horário.";
  }
}

function closeIntervalWarningDialog() {
  state.pendingDrinkId = null;
  intervalWarningDialog.close();
}

function continueFromIntervalWarning() {
  if (!state.pendingDrinkId) return;

  const drinkId = state.pendingDrinkId;
  intervalWarningDialog.close();
  state.pendingDrinkId = null;
  openLogDialog(drinkId);
}

function openLogDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  const activity = getDrinkActivity(drink);

  state.selectedDrinkId = drinkId;
  logDrinkName.textContent = drink.name;
  setLogDurationPicker(0, 0);
  logFormError.hidden = true;

  if (activity.state === "waiting" || activity.state === "danger") {
    activeIntervalWarning.hidden = false;
    activeIntervalWarningTitle.textContent = "O registro anterior será mantido";
    activeIntervalWarningText.textContent = "Este consumo será adicionado ao histórico. O app não substitui nem apaga os registros anteriores.";
  } else {
    activeIntervalWarning.hidden = true;
  }

  logDialog.showModal();
}

function closeLogDialog() {
  state.selectedDrinkId = null;
  logDialog.close();
}

function registerMinutesAgo(minutesAgo) {
  if (!state.selectedDrinkId) return;

  const timestamp = Date.now() - minutesAgo * 60 * 1000;
  const id = state.selectedDrinkId;
  closeLogDialog();
  registerDrinkAt(id, timestamp);
}

function openEventDialog(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  const drink = getEventDrinkIdentity(event);

  state.selectedEventId = eventId;
  eventDrinkName.textContent = `${drink.icon} ${drink.name}`;
  eventDeletedNote.hidden = !drink.isDeleted;
  eventDateInput.value = toLocalDateInputValue(event.consumedAt);
  eventTimeInput.value = toLocalTimeInputValue(event.consumedAt);
  eventInterval.textContent = formatInterval(event.intervalMinutes);
  eventFormError.hidden = true;

  eventDoseField.hidden = !event.doseSize;
  eventForm.querySelectorAll('input[name="eventDoseSize"]').forEach((input) => {
    input.checked = input.value === event.doseSize;
  });

  const context = getEventContext(eventId);
  if (context?.isViolation) {
    eventWarning.hidden = false;
    eventWarningText.textContent = `Você tomou ${formatElapsed(context.elapsedMs)} após o anterior, quando ainda faltava ${formatElapsed(context.remainingAtConsumptionMs)}.`;
  } else {
    eventWarning.hidden = true;
  }

  eventDialog.showModal();
}

function closeEventDialog() {
  state.selectedEventId = null;
  eventDialog.close();
}

function handleEventSubmit(event) {
  event.preventDefault();

  const selectedEvent = state.events.find((item) => item.id === state.selectedEventId);
  if (!selectedEvent) {
    showEventFormError("Este registro não foi encontrado.");
    return;
  }

  const dateValue = eventDateInput.value;
  const timeValue = eventTimeInput.value;

  if (!dateValue || !timeValue) {
    showEventFormError("Informe a data e o horário do registro.");
    return;
  }

  const timestamp = new Date(`${dateValue}T${timeValue}:00`).getTime();

  if (!Number.isFinite(timestamp)) {
    showEventFormError("A data ou o horário informado é inválido.");
    return;
  }

  if (timestamp > Date.now() + 60000) {
    showEventFormError("O registro não pode ficar no futuro.");
    return;
  }

  selectedEvent.consumedAt = timestamp;

  if (!eventDoseField.hidden) {
    const selectedDose = eventForm.querySelector('input[name="eventDoseSize"]:checked')?.value;
    selectedEvent.doseSize = normalizeDoseSize(selectedDose) || selectedEvent.doseSize || "full";
  }

  saveData();
  closeEventDialog();
  refreshDataViews();
  showToast("Anotação atualizada. Os intervalos foram recalculados.");
}

function deleteSelectedEvent() {
  const selectedEvent = state.events.find((item) => item.id === state.selectedEventId);
  if (!selectedEvent) return;

  const drink = getEventDrinkIdentity(selectedEvent);
  const drinkName = drink.name || "esta bebida";
  const confirmed = window.confirm(`Excluir o registro de ${drinkName} das ${formatClock(selectedEvent.consumedAt)}? Os intervalos serão recalculados.`);
  if (!confirmed) return;

  state.events = state.events.filter((item) => item.id !== selectedEvent.id);
  saveData();
  closeEventDialog();
  refreshDataViews();
  showToast("Anotação excluída. Os intervalos foram recalculados.");
}

function createWheelPicker(element, input, maxValue) {
  const track = element.querySelector(".wheel-picker-track");
  const valueCount = maxValue + 1;
  const fragment = document.createDocumentFragment();

  for (let repeat = 0; repeat < WHEEL_REPEAT_COUNT; repeat += 1) {
    for (let value = 0; value <= maxValue; value += 1) {
      const item = document.createElement("div");
      item.className = "wheel-picker-item";
      item.dataset.value = String(value);
      item.dataset.index = String(repeat * valueCount + value);
      item.textContent = String(value).padStart(2, "0");
      fragment.appendChild(item);
    }
  }

  track.replaceChildren(fragment);

  const wheelState = {
    input,
    maxValue,
    valueCount,
    track,
    selectedIndex: -1,
    scrollRaf: null,
    settleTimer: null,
  };

  element._wheelState = wheelState;

  const updateFromScroll = () => {
    wheelState.scrollRaf = null;
    const maxIndex = track.children.length - 1;
    const index = Math.max(0, Math.min(maxIndex, Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT)));
    const item = track.children[index];
    if (!item) return;

    const value = Number(item.dataset.value);
    input.value = String(value);
    element.setAttribute("aria-valuenow", String(value));
    element.setAttribute("aria-valuetext", String(value).padStart(2, "0"));

    if (wheelState.selectedIndex !== index) {
      if (wheelState.selectedIndex >= 0 && track.children[wheelState.selectedIndex]) {
        track.children[wheelState.selectedIndex].classList.remove("is-selected");
      }
      item.classList.add("is-selected");
      wheelState.selectedIndex = index;
    }

    if (element === intervalHoursWheel) {
      updateMinuteWheelAvailability(value);
    }
  };

  const settle = () => {
    const index = Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT);
    const repeat = Math.floor(index / valueCount);
    const value = Number(input.value);

    if (repeat <= 1 || repeat >= WHEEL_REPEAT_COUNT - 2) {
      const middleIndex = WHEEL_MIDDLE_REPEAT * valueCount + value;
      element.scrollTo({ top: middleIndex * WHEEL_ITEM_HEIGHT, behavior: "auto" });
      updateFromScroll();
    }
  };

  element.addEventListener("scroll", () => {
    if (!wheelState.scrollRaf) {
      wheelState.scrollRaf = requestAnimationFrame(updateFromScroll);
    }

    clearTimeout(wheelState.settleTimer);
    wheelState.settleTimer = setTimeout(settle, 120);
  }, { passive: true });

  element.addEventListener("click", (event) => {
    const item = event.target.closest(".wheel-picker-item");
    if (!item || element.classList.contains("is-disabled")) return;

    element.scrollTo({
      top: Number(item.dataset.index) * WHEEL_ITEM_HEIGHT,
      behavior: "smooth",
    });
  });

  element.addEventListener("keydown", (event) => {
    if (element.classList.contains("is-disabled")) return;

    let direction = 0;
    if (event.key === "ArrowUp") direction = -1;
    if (event.key === "ArrowDown") direction = 1;
    if (!direction) return;

    event.preventDefault();
    const currentIndex = Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT);
    element.scrollTo({
      top: (currentIndex + direction) * WHEEL_ITEM_HEIGHT,
      behavior: "smooth",
    });
  });

  setWheelPickerValue(element, Number(input.value) || 0);
}

function setWheelPickerValue(element, rawValue, behavior = "auto") {
  const wheelState = element._wheelState;
  if (!wheelState) return;

  const value = Math.max(0, Math.min(wheelState.maxValue, Number(rawValue) || 0));
  const targetIndex = WHEEL_MIDDLE_REPEAT * wheelState.valueCount + value;

  wheelState.input.value = String(value);
  element.setAttribute("aria-valuenow", String(value));
  element.setAttribute("aria-valuetext", String(value).padStart(2, "0"));
  element.scrollTo({ top: targetIndex * WHEEL_ITEM_HEIGHT, behavior });

  if (wheelState.selectedIndex >= 0 && wheelState.track.children[wheelState.selectedIndex]) {
    wheelState.track.children[wheelState.selectedIndex].classList.remove("is-selected");
  }
  wheelState.selectedIndex = targetIndex;
  wheelState.track.children[targetIndex]?.classList.add("is-selected");

  if (element === intervalHoursWheel) {
    updateMinuteWheelAvailability(value);
  }
}

function updateMinuteWheelAvailability(hours = Number(intervalHoursInput.value)) {
  const isMaxHours = Number(hours) === 24;
  const wasDisabled = intervalMinutesWheel.classList.contains("is-disabled");

  if (isMaxHours && !wasDisabled) {
    intervalMinutesWheel.dataset.valueBeforeMax = intervalMinutesInput.value;
    setWheelPickerValue(intervalMinutesWheel, 0);
  } else if (!isMaxHours && wasDisabled) {
    const restoreValue = Number(intervalMinutesWheel.dataset.valueBeforeMax || 0);
    setWheelPickerValue(intervalMinutesWheel, restoreValue);
    delete intervalMinutesWheel.dataset.valueBeforeMax;
  }

  intervalMinutesWheel.classList.toggle("is-disabled", isMaxHours);
  intervalMinutesWheel.setAttribute("aria-disabled", String(isMaxHours));
  intervalMinutesWheel.tabIndex = isMaxHours ? -1 : 0;
}

function setLogDurationPicker(hours, minutes) {
  const safeHours = Math.max(0, Math.min(48, Number(hours) || 0));
  const safeMinutes = Math.max(0, Math.min(59, Number(minutes) || 0));

  logHoursAgoInput.value = String(safeHours);
  logMinutesAgoInput.value = String(safeMinutes);
  setWheelPickerValue(logHoursWheel, safeHours);
  setWheelPickerValue(logMinutesWheel, safeMinutes);
}

function initializeLogDurationPickers() {
  createWheelPicker(logHoursWheel, logHoursAgoInput, 48);
  createWheelPicker(logMinutesWheel, logMinutesAgoInput, 59);
  setLogDurationPicker(0, 0);
}

function setDurationPicker(hours, minutes) {
  const safeHours = Math.max(0, Math.min(24, Number(hours) || 0));
  const safeMinutes = safeHours === 24 ? 0 : Math.max(0, Math.min(59, Number(minutes) || 0));

  delete intervalMinutesWheel.dataset.valueBeforeMax;
  intervalMinutesWheel.classList.remove("is-disabled");
  intervalMinutesWheel.setAttribute("aria-disabled", "false");
  intervalMinutesWheel.tabIndex = 0;

  intervalHoursInput.value = String(safeHours);
  intervalMinutesInput.value = String(safeMinutes);
  setWheelPickerValue(intervalMinutesWheel, safeMinutes);
  setWheelPickerValue(intervalHoursWheel, safeHours);
}

function initializeDurationPickers() {
  createWheelPicker(intervalHoursWheel, intervalHoursInput, 24);
  createWheelPicker(intervalMinutesWheel, intervalMinutesInput, 59);
  setDurationPicker(1, 0);
}

function buildIconPicker(selectedIcon = DEFAULT_ICON) {
  iconOptions.innerHTML = "";

  const normalizedSelectedIcon = normalizeIcon(selectedIcon);
  const icons = PICKER_ICONS.includes(normalizedSelectedIcon)
    ? [...PICKER_ICONS]
    : [normalizedSelectedIcon, ...PICKER_ICONS];

  icons.forEach((icon) => {
    const label = document.createElement("label");
    label.className = "icon-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "icon";
    input.value = icon;
    input.checked = icon === normalizedSelectedIcon;

    const visual = document.createElement("span");
    visual.textContent = icon;
    visual.setAttribute("aria-hidden", "true");

    label.append(input, visual);
    iconOptions.appendChild(label);
  });
}

function handleDrinkSubmit(event) {
  event.preventDefault();

  const formData = new FormData(drinkForm);
  const name = String(formData.get("name") || "").trim();
  const currentDrink = state.editingDrinkId
    ? state.drinks.find((item) => item.id === state.editingDrinkId)
    : null;
  const icon = normalizeIcon(formData.get("icon"), currentDrink?.icon || DEFAULT_ICON);
  const hours = Number(formData.get("intervalHours"));
  const minutes = Number(formData.get("intervalMinutes"));
  const askDoseSize = formData.get("askDoseSize") === "on";

  if (!name) {
    showFormError("Informe um nome para a bebida.");
    return;
  }

  if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
    showFormError("Use um valor de horas entre 0 e 24.");
    return;
  }

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    showFormError("Use um valor de minutos entre 0 e 59.");
    return;
  }

  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes < 1 || totalMinutes > 1440) {
    showFormError("O intervalo deve ficar entre 1 minuto e 24 horas.");
    return;
  }

  if (state.editingDrinkId) {
    const drink = currentDrink;

    if (!drink) {
      showFormError("Esta bebida não foi encontrada.");
      return;
    }

    drink.name = name;
    drink.icon = icon;
    drink.intervalMinutes = totalMinutes;
    drink.askDoseSize = askDoseSize;

    // Nome e ícone representam a identidade da bebida e acompanham correções.
    // O intervalo histórico NÃO é alterado: cada evento mantém seu snapshot.
    state.events = state.events.map((event) => {
      if (event.drinkId !== drink.id) return event;
      return {
        ...event,
        drinkName: name,
        drinkIcon: icon,
      };
    });

    saveData();
    closeDrinkDialog();
    refreshDataViews();
    showToast(`${name} atualizada. Novas anotações usarão o novo intervalo.`);
    return;
  }

  state.drinks.push({
    id: createId(),
    name,
    icon,
    intervalMinutes: totalMinutes,
    askDoseSize,
  });

  saveData();
  closeDrinkDialog();
  refreshDataViews();
}

function handleLogSubmit(event) {
  event.preventDefault();

  const hours = Number(logHoursAgoInput.value);
  const minutes = Number(logMinutesAgoInput.value);

  if (!Number.isInteger(hours) || hours < 0 || hours > 48) {
    showLogFormError("Use um valor de horas entre 0 e 48.");
    return;
  }

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    showLogFormError("Use um valor de minutos entre 0 e 59.");
    return;
  }

  const totalMinutesAgo = hours * 60 + minutes;
  registerMinutesAgo(totalMinutesAgo);
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function showLogFormError(message) {
  logFormError.textContent = message;
  logFormError.hidden = false;
}

function showEventFormError(message) {
  eventFormError.textContent = message;
  eventFormError.hidden = false;
}

function closeDialogOnBackdrop(dialogElement, event, closeFunction) {
  const rect = dialogElement.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;

  if (!inside) closeFunction();
}


function showUpdateAvailable(worker) {
  if (!worker) return;

  state.waitingServiceWorker = worker;
  applyUpdateButton.disabled = false;
  applyUpdateButton.textContent = "Atualizar";
  updateToast.hidden = false;
}

function hideUpdateAvailable() {
  updateToast.hidden = true;
}

async function checkForAppUpdate({ force = false } = {}) {
  const registration = state.serviceWorkerRegistration;
  if (!registration || state.updateCheckInFlight) return;

  const now = Date.now();
  if (!force && now - state.lastUpdateCheckAt < 30000) return;

  state.updateCheckInFlight = true;
  state.lastUpdateCheckAt = now;

  try {
    await registration.update();
    if (registration.waiting) {
      showUpdateAvailable(registration.waiting);
    }
  } catch (error) {
    // Offline é um estado normal da PWA; não mostramos erro ao usuário.
    if (navigator.onLine) {
      console.warn("Não foi possível verificar atualização da PWA.", error);
    }
  } finally {
    state.updateCheckInFlight = false;
  }
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
    if (state.currentView === "home" && Date.now() >= state.reorderAnimationUntil) {
      render();
    } else if (state.currentView === "history") {
      updateHistoryElapsedLabels();
    }
    updateIntervalWarningDialog();
  }, 1000);
}

document.querySelector("#open-history").addEventListener("click", () => openHistoryView());
document.querySelector("#close-history").addEventListener("click", closeHistoryView);
document.querySelector("#open-settings").addEventListener("click", openSettingsView);
document.querySelector("#close-settings").addEventListener("click", closeSettingsView);

securityEnabledInput.addEventListener("change", () => {
  if (securityEnabledInput.checked) {
    openSecurityMethodDialog("enable");
  } else {
    disableSecurity();
  }
});

document.querySelector("#change-security-method").addEventListener("click", () => openSecurityMethodDialog("change"));
document.querySelector("#lock-now").addEventListener("click", lockApp);
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

document.querySelector("#open-add-dialog").addEventListener("click", openDrinkDialog);
document.querySelector("#empty-add-button").addEventListener("click", openDrinkDialog);
document.querySelector("#close-dialog").addEventListener("click", closeDrinkDialog);
document.querySelector("#cancel-dialog").addEventListener("click", closeDrinkDialog);
deleteDrinkFromEditorButton.addEventListener("click", () => {
  if (state.editingDrinkId) openDeleteDrinkDialog(state.editingDrinkId, { returnToEditorOnCancel: true });
});
drinkForm.addEventListener("submit", handleDrinkSubmit);

document.querySelector("#cancel-delete-drink").addEventListener("click", () => closeDeleteDrinkDialog());
document.querySelector("#delete-drink-keep-history").addEventListener("click", deleteDrinkKeepingHistory);
document.querySelector("#delete-drink-with-history").addEventListener("click", deleteDrinkWithHistory);

document.querySelector("#close-interval-warning-dialog").addEventListener("click", closeIntervalWarningDialog);
document.querySelector("#cancel-interval-warning-dialog").addEventListener("click", closeIntervalWarningDialog);
document.querySelector("#confirm-interval-warning").addEventListener("click", continueFromIntervalWarning);

document.querySelector("#close-drink-menu-dialog").addEventListener("click", closeDrinkMenuDialog);
document.querySelector("#drink-menu-other-time").addEventListener("click", openOtherTimeFromDrinkMenu);
document.querySelector("#drink-menu-edit").addEventListener("click", editDrinkFromDrinkMenu);
document.querySelector("#drink-menu-delete").addEventListener("click", deleteDrinkFromDrinkMenu);

document.querySelector("#close-log-dialog").addEventListener("click", closeLogDialog);
document.querySelector("#cancel-log-dialog").addEventListener("click", closeLogDialog);
logForm.addEventListener("submit", handleLogSubmit);

document.querySelector("#close-dose-size-dialog").addEventListener("click", closeDoseSizeDialog);
doseHalfButton.addEventListener("click", () => choosePendingDoseSize("half"));
doseFullButton.addEventListener("click", () => choosePendingDoseSize("full"));

document.querySelector("#close-event-dialog").addEventListener("click", closeEventDialog);
document.querySelector("#cancel-event-dialog").addEventListener("click", closeEventDialog);
document.querySelector("#delete-event").addEventListener("click", deleteSelectedEvent);
eventForm.addEventListener("submit", handleEventSubmit);

document.querySelectorAll(".quick-time-button").forEach((button) => {
  button.addEventListener("click", () => {
    const minutesAgo = Number(button.dataset.minutesAgo);
    registerMinutesAgo(minutesAgo);
  });
});

toastUndo.addEventListener("click", undoLastRegistration);

drinkDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(drinkDialog, event, closeDrinkDialog);
});

deleteDrinkDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(deleteDrinkDialog, event, () => closeDeleteDrinkDialog());
});

deleteDrinkDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDeleteDrinkDialog();
});

intervalWarningDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(intervalWarningDialog, event, closeIntervalWarningDialog);
});

drinkMenuDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(drinkMenuDialog, event, closeDrinkMenuDialog);
});

drinkMenuDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDrinkMenuDialog();
});

logDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(logDialog, event, closeLogDialog);
});

doseSizeDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(doseSizeDialog, event, closeDoseSizeDialog);
});

doseSizeDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDoseSizeDialog();
});

eventDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(eventDialog, event, closeEventDialog);
});

securityMethodDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(securityMethodDialog, event, () => closeSecurityMethodDialog());
});
securityMethodDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSecurityMethodDialog();
});
pinSetupDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(pinSetupDialog, event, () => closePinSetupDialog());
});
pinSetupDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePinSetupDialog();
});

document.addEventListener("visibilitychange", () => {
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
      if (state.securityConfig.relockSeconds === 0) lockApp();
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

  if (state.securityConfig.enabled && state.securityHiddenAt) {
    const elapsedSeconds = (Date.now() - state.securityHiddenAt) / 1000;
    if (elapsedSeconds >= state.securityConfig.relockSeconds) {
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
    else if (state.currentView === "settings") updateSecuritySettingsUI();
    updateIntervalWarningDialog();
  }
  checkForAppUpdate();
});

// Mantém a sessão de desbloqueio durante um refresh/pull-to-refresh.
// sessionStorage sobrevive à recarga da mesma PWA, mas não substitui a autenticação
// quando a sessão expira pelo tempo configurado.
window.addEventListener("beforeunload", () => {
  if (state.securityConfig.enabled && !state.securityLocked) markSecurityActive();
});

document.addEventListener("pointerdown", () => {
  if (state.securityConfig.enabled && !state.securityLocked && !document.hidden) markSecurityActive();
}, { passive: true });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!state.updateReloadRequested) return;

    state.updateReloadRequested = false;
    window.location.reload();
  });

  window.addEventListener("load", initializeServiceWorker);
  window.addEventListener("online", () => checkForAppUpdate({ force: true }));
}

applyUpdateButton.addEventListener("click", applyPendingAppUpdate);
dismissUpdateButton.addEventListener("click", hideUpdateAvailable);

async function bootstrapApp() {
  initializeDurationPickers();
  initializeLogDurationPickers();
  buildIconPicker(DEFAULT_ICON);
  setCurrentView("home");
  render();
  startClock();
  await initializeSecurity();
}

bootstrapApp().catch((error) => {
  console.error("Falha ao inicializar o aplicativo.", error);
  document.body.classList.remove("security-booting");
});
