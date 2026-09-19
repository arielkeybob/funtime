import { derivePinHash, PIN_PBKDF2_ITERATIONS } from "./pin-crypto.js";

export const SECURITY_CONFIG_VERSION = 4;
export const PIN_LENGTH = 4;
export const LEGACY_PIN_LENGTH = 6;
export const PIN_LOCKOUT_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 30000;

export function createSecurityConfig({
  state, localStorage, securityStorageKey, validateStoredShape, base64UrlToBytes, equalBytes,
}) {
  function getDefaultSecurityConfig() {
    return {
      version: SECURITY_CONFIG_VERSION,
      enabled: false,
      method: null,
      relockSeconds: 300,
      // Além do tempo fora do app, bloqueia também parado com o app aberto (v4+). Config
      // nova nasce ligada; config antiga em uso fica desligada até a pessoa escolher um tempo.
      relockIdle: true,
      eventUnlockOccasionId: null,
      pin: null,
      webauthn: null,
    };
  }

  function loadSecurityConfig() {
    try {
      const raw = localStorage.getItem(securityStorageKey);
      if (!raw) return getDefaultSecurityConfig();
      validateStoredShape(raw, securityStorageKey);
      const parsed = JSON.parse(raw);
      const config = getDefaultSecurityConfig();
      config.enabled = Boolean(parsed.enabled);
      config.method = parsed.method === "pin" || parsed.method === "device" ? parsed.method : null;
      const storedRelock = Number(parsed.relockSeconds);
      const allowedRelock = [0, 30, 60, 300, 900];
      config.relockSeconds = allowedRelock.includes(storedRelock) ? storedRelock : 300;
      config.relockIdle = typeof parsed.relockIdle === "boolean" ? parsed.relockIdle : parsed.enabled !== true;
      config.eventUnlockOccasionId = typeof parsed.eventUnlockOccasionId === "string" && parsed.eventUnlockOccasionId
        ? parsed.eventUnlockOccasionId
        : null;
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
      throw new Error("Não foi possível ler a proteção do app. Tente novamente.");
    }
  }

  function saveSecurityConfig() {
    localStorage.setItem(securityStorageKey, JSON.stringify(state.securityConfig));
  }

  function getConfiguredPinLength() {
    return state.securityConfig.pin?.length === LEGACY_PIN_LENGTH ? LEGACY_PIN_LENGTH : PIN_LENGTH;
  }

  function normalizePinInput(input, maxLength = PIN_LENGTH) {
    const digits = input.value.replace(/\D/g, "").slice(0, maxLength);
    if (input.value !== digits) input.value = digits;
    return digits;
  }

  function getPinLockoutRemainingMs() {
    return Math.max(0, state.pinLockoutUntil - Date.now());
  }

  async function verifyPin(pin) {
    const stored = state.securityConfig.pin;
    if (!stored) return false;
    const salt = base64UrlToBytes(stored.salt);
    const derived = await derivePinHash(pin, salt, stored.iterations);
    return equalBytes(derived, base64UrlToBytes(stored.hash));
  }

  // Único ponto que soma uma tentativa errada e decide o bloqueio temporário -
  // app.js (tela de bloqueio) e reset.js (reautenticar para APAGAR TUDO)
  // reimplementavam isso cada um a seu modo antes desta extração (spec 0021).
  // Cada chamador continua livre para reagir à sua maneira ao retorno (mostrar
  // contagem regressiva, lançar erro, etc.) - só a contagem em si é única.
  function registerFailedPinAttempt() {
    state.pinFailedAttempts += 1;
    const lockedOut = state.pinFailedAttempts >= PIN_LOCKOUT_ATTEMPTS;
    if (lockedOut) state.pinLockoutUntil = Date.now() + PIN_LOCKOUT_MS;
    return lockedOut;
  }

  return {
    getDefaultSecurityConfig, loadSecurityConfig, saveSecurityConfig,
    getConfiguredPinLength, normalizePinInput, getPinLockoutRemainingMs, verifyPin,
    registerFailedPinAttempt,
  };
}
