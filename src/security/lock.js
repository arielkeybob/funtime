import { PIN_LOCKOUT_ATTEMPTS } from "./config.js";

export function createSecurityLock({
  state,
  lockScreen, lockError, deviceUnlockPanel, pinUnlockForm, pinUnlockValue, deviceUnlockButton,
  privacyShield, pinSetupValue, pinSetupConfirm, toast,
  getConfiguredPinLength, normalizePinInput, verifyPin, verifyDeviceCredential,
  getPinLockoutRemainingMs, registerFailedPinAttempt,
  clearSecuritySession, markSecurityActive,
  hideToast, hideUpdateAvailable, render, renderHistory, maybeHandleSharedDrinkImport,
  applyPendingSyncData, applyPendingSharedViewData, renderSharedView, applyViewTheme,
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

  let deviceUnlockPending = false;
  let hiddenDuringDeviceUnlock = false;
  let waitingFocusForDevice = false;

  // promptDevice: abrir o app ou voltar a ele já pede a biometria, sem esperar o toque
  // em Entrar. "Bloquear agora" e o bloqueio por inatividade não pedem: o app está à
  // vista e a pessoa não está tentando entrar.
  function showLockScreen({ promptDevice = false } = {}) {
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
    } else if (method === "device" && promptDevice) {
      promptDeviceUnlock();
    }
  }

  function promptDeviceUnlock() {
    if (!state.securityLocked || state.securityConfig.method !== "device" || deviceUnlockPending) return;
    // O próprio pedido de biometria pode esconder a página em alguns aparelhos; pedir de
    // novo ao voltar dele faria cancelar virar um laço. Fica o Entrar.
    if (hiddenDuringDeviceUnlock) {
      hiddenDuringDeviceUnlock = false;
      return;
    }
    // O navegador recusa o pedido com a página escondida ou sem foco.
    if (document.hidden) return;
    if (document.hasFocus?.() === false) {
      if (waitingFocusForDevice) return;
      waitingFocusForDevice = true;
      window.addEventListener("focus", () => {
        waitingFocusForDevice = false;
        promptDeviceUnlock();
      }, { once: true });
      return;
    }
    handleDeviceUnlock({ automatic: true });
  }

  function lockApp({ promptDevice = false } = {}) {
    if (!state.securityConfig.enabled) return;
    state.securityLocked = true;
    // A tela de bloqueio fica nas cores neutras, não nas do módulo aberto (Eventos, Amigos).
    applyViewTheme?.();
    clearSecuritySession();
    hidePrivacyShield();
    closeSensitiveDialogs();
    showLockScreen({ promptDevice });
  }

  function unlockApp({ persistSession = true } = {}) {
    hiddenDuringDeviceUnlock = false;
    state.securityLocked = false;
    state.securityHiddenAt = null;
    state.pinFailedAttempts = 0;
    state.pinLockoutUntil = 0;
    clearTimeout(state.pinLockoutTimer);
    lockScreen.hidden = true;
    document.body.classList.remove("app-locked");
    applyViewTheme?.();
    hidePrivacyShield();
    if (persistSession) markSecurityActive();
    if (state.currentView === "home") render();
    else if (state.currentView === "history") renderHistory();
    else if (state.currentView === "shared") renderSharedView?.();
    if (state.pendingSharedImportCheck) {
      state.pendingSharedImportCheck = false;
      setTimeout(() => maybeHandleSharedDrinkImport(), 80);
    }
    if (state.pendingSyncApply) {
      const pending = state.pendingSyncApply;
      state.pendingSyncApply = null;
      applyPendingSyncData?.(pending);
    }
    if (state.pendingSharedViewApply) {
      const pending = state.pendingSharedViewApply;
      state.pendingSharedViewApply = null;
      applyPendingSharedViewData?.(pending);
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

  async function handleDeviceUnlock({ automatic = false } = {}) {
    if (deviceUnlockPending) return;
    deviceUnlockPending = true;
    hiddenDuringDeviceUnlock = false;
    const noteHidden = () => { if (document.hidden) hiddenDuringDeviceUnlock = true; };
    document.addEventListener("visibilitychange", noteHidden);
    deviceUnlockButton.disabled = true;
    deviceUnlockButton.textContent = "Verificando…";
    lockError.hidden = true;
    try {
      const ok = await verifyDeviceCredential();
      if (!ok) throw new Error("Não foi possível confirmar a autenticação.");
      unlockApp();
    } catch (error) {
      // No pedido automático, cancelar (ou o navegador exigir um toque antes) só
      // deixa a tela como antes, com o Entrar; não é um erro a mostrar.
      if (!(automatic && error?.name === "NotAllowedError")) {
        lockError.hidden = false;
        lockError.textContent = error?.name === "NotAllowedError" ? "Autenticação cancelada ou não concluída." : (error?.message || "Não foi possível desbloquear.");
      }
    } finally {
      deviceUnlockPending = false;
      document.removeEventListener("visibilitychange", noteHidden);
      // Já de volta à página: a volta que o pedido causou já passou.
      if (!document.hidden) hiddenDuringDeviceUnlock = false;
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
