import { PIN_LOCKOUT_ATTEMPTS } from "./config.js";

export function createSecurityLock({
  state,
  lockScreen, lockError, deviceUnlockPanel, pinUnlockForm, pinUnlockValue, deviceUnlockButton,
  privacyShield, pinSetupValue, pinSetupConfirm, toast,
  getConfiguredPinLength, normalizePinInput, verifyPin, verifyDeviceCredential,
  getPinLockoutRemainingMs, registerFailedPinAttempt,
  clearSecuritySession, markSecurityActive,
  hideToast, hideUpdateAvailable, render, renderHistory, maybeHandleSharedDrinkImport,
}) {
  function closeSensitiveDialogs() {
    state.securitySetupGeneration++;
    pinSetupValue.value = '';
    pinSetupConfirm.value = '';
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      try { dialog.close(); } catch (error) { /* noop */ }
    });
    hideUpdateAvailable();
    if (!toast.hidden) hideToast();
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
    if (state.pendingSharedImportCheck) {
      state.pendingSharedImportCheck = false;
      setTimeout(() => maybeHandleSharedDrinkImport(), 80);
    }
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

    pinUnlockValue.value = "";
    if (registerFailedPinAttempt()) {
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

  return {
    closeSensitiveDialogs, showLockScreen, lockApp, unlockApp,
    showPrivacyShield, hidePrivacyShield, updatePinLockoutMessage,
    handlePinUnlock, handleDeviceUnlock,
  };
}
