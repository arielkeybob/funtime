import { setWheelPickerValue } from "../ui/wheel-picker.js";

export function createDrinkInteractions({
  state,
  // DOM — editor de bebida
  drinkForm, nameInput, drinkNameField, drinkIconField, formError,
  drinkDialogEyebrow, drinkDialogTitle, drinkSubmitButton, deleteDrinkFromEditorButton,
  drinkDangerZone, drinkIntervalEditNote, askDoseSizeInput, drinkDialog,
  deleteDrinkDialog, deleteDrinkName, deleteDrinkSummary,
  // DOM — registro de consumo (menu/dose/log/aviso de intervalo)
  intervalWarningDialog, intervalWarningDrinkName, intervalWarningRemaining,
  intervalWarningMessage, intervalWarningContext,
  drinkMenuDialog, drinkMenuName,
  logDialog, logForm, logDrinkName, activeIntervalWarning, activeIntervalWarningTitle,
  activeIntervalWarningText, logHoursAgoInput, logMinutesAgoInput,
  logHoursWheel, logMinutesWheel, intervalHoursWheel, intervalMinutesWheel,
  intervalHoursInput, intervalMinutesInput, logFormError,
  doseSizeDialog, doseSizeDrinkName, doseHalfButton, doseFullButton, toastUndo,
  // Dependências externas
  createDurationPicker, validateDrinkDraft,
  setDrinkFieldError, clearDrinkFieldError, clearDrinkValidation,
  showFormError, showLogFormError,
  commitAppData, buildCurrentAppData, dataStorageKey,
  refreshDataViews, showToast, showAppNotification, hideToast, closeHistoryView,
  normalizeIcon, normalizeDoseSize, createId,
  getEventDrinkIdentity, getDoseLabel, getDrinkActivity, formatClock, formatTime,
  buildIconPicker, cancelIconReorder, beginFormDraft, captureDrinkCardPositions, animateDrinkReorder,
  wireDialogDismissal,
}) {
  // --- Editor de bebida: cadastro, edição, exclusão ---

  function openDrinkDialog() {
    state.editingDrinkId = null;
    drinkForm.reset();
    clearDrinkValidation();
    setDurationPicker(1, 0);
    formError.hidden = true;
    drinkDialogEyebrow.textContent = "Nova bebida";
    drinkDialogTitle.textContent = "Cadastrar";
    drinkSubmitButton.textContent = "Salvar";
    deleteDrinkFromEditorButton.hidden = true;
    drinkDangerZone.hidden = true;
    drinkIntervalEditNote.hidden = true;
    askDoseSizeInput.checked = false;

    // Novo cadastro começa neutro: o usuário escolhe conscientemente o ícone.
    buildIconPicker(null);

    beginFormDraft(drinkForm);
    drinkDialog.showModal();
    requestAnimationFrame(() => {
      setDurationPicker(1, 0);
      // Sem autofocus: o teclado só abre quando o usuário tocar no campo.
      nameInput.blur();
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

    clearDrinkValidation();
    beginFormDraft(drinkForm);
    drinkDialog.showModal();
    requestAnimationFrame(() => {
      setDurationPicker(Math.floor(drink.intervalMinutes / 60), drink.intervalMinutes % 60);
      nameInput.blur();
    });
  }

  function openDeleteDrinkDialog(drinkId, { returnToEditorOnCancel = false } = {}) {
    const drink = state.drinks.find((item) => item.id === drinkId);
    if (!drink) return;

    state.deleteDrinkId = drinkId;
    state.deleteReturnToEditor = returnToEditorOnCancel;
    const eventCount = state.events.filter((event) => event.drinkId === drinkId).length;

    deleteDrinkName.textContent = `${drink.icon} ${drink.name}`;
    deleteDrinkSummary.textContent = eventCount > 0
      ? `Existem ${eventCount} registro${eventCount === 1 ? "" : "s"} desta bebida no histórico.`
      : "Esta bebida ainda não possui registros no histórico.";

    document.getElementById('delete-drink-question').textContent = eventCount ? 'O que deseja fazer com o histórico?' : 'Excluir esta bebida?';
    document.getElementById('delete-drink-history-help').hidden = !eventCount;
    document.getElementById('delete-drink-keep-history').hidden = !eventCount;
    document.getElementById('delete-drink-with-history').textContent = eventCount ? 'Excluir bebida e histórico' : 'Excluir bebida';
    deleteDrinkDialog.showModal();
  }

  function closeDeleteDrinkDialog({ returnToEditor = state.deleteReturnToEditor } = {}) {
    const drinkId = state.deleteDrinkId;
    state.deleteDrinkId = null;
    state.deleteReturnToEditor = false;
    deleteDrinkDialog.close();

    if (drinkId && !state.drinks.some((drink) => drink.id === drinkId)) {
      if (drinkDialog.open) closeDrinkDialog();
      if (drinkMenuDialog.open) closeDrinkMenuDialog();
    } else if (returnToEditor && drinkId && !drinkDialog.open) {
      openEditDrinkDialog(drinkId);
    }
  }

  function deleteDrinkKeepingHistory() {
    const drinkId = state.deleteDrinkId;
    const drink = state.drinks.find((item) => item.id === drinkId);
    if (!drink) return;

    const nextEvents = state.events.map((event) => {
      if (event.drinkId !== drinkId) return event;
      return {
        ...event,
        drinkName: drink.name,
        drinkIcon: drink.icon,
      };
    });
    const nextDrinks = state.drinks.filter((item) => item.id !== drinkId);
    state.editingDrinkId = null;

    try {
      const result = commitAppData(dataStorageKey, buildCurrentAppData(), { events: nextEvents, drinks: nextDrinks });
      state.events = result.events;
      state.drinks = result.drinks;
    } catch {
      showAppNotification("Não foi possível excluir a bebida. Tente novamente.", { type: "error" });
      return;
    }
    closeDeleteDrinkDialog();
    refreshDataViews();
    showToast(`${drink.name} foi excluída da lista. O histórico foi mantido.`);
  }

  function deleteDrinkWithHistory() {
    const drinkId = state.deleteDrinkId;
    const drink = state.drinks.find((item) => item.id === drinkId);
    if (!drink) return;

    const hadHistory = state.events.some(item => item.drinkId === drinkId);
    const nextDrinks = state.drinks.filter((item) => item.id !== drinkId);
    const nextEvents = state.events.filter((event) => event.drinkId !== drinkId);
    state.editingDrinkId = null;

    try {
      const result = commitAppData(dataStorageKey, buildCurrentAppData(), { drinks: nextDrinks, events: nextEvents });
      state.drinks = result.drinks;
      state.events = result.events;
    } catch {
      showAppNotification("Não foi possível excluir a bebida. Tente novamente.", { type: "error" });
      return;
    }
    closeDeleteDrinkDialog();
    refreshDataViews();
    showToast(hadHistory ? `${drink.name} e seus registros foram excluídos.` : `${drink.name} foi excluída.`);
  }

  function closeDrinkDialog() {
    cancelIconReorder();
    state.editingDrinkId = null;
    drinkDialog.close();
  }

  function handleDrinkSubmit(event) {
    event.preventDefault();

    clearDrinkValidation();
    formError.hidden = true;

    const formData = new FormData(drinkForm);
    const name = String(formData.get("name") || "").trim();
    const rawIcon = formData.get("icon");
    const currentDrink = state.editingDrinkId
      ? state.drinks.find((item) => item.id === state.editingDrinkId)
      : null;
    const icon = rawIcon ? normalizeIcon(rawIcon) : null;
    const hours = Number(formData.get("intervalHours"));
    const minutes = Number(formData.get("intervalMinutes"));
    const askDoseSize = formData.get("askDoseSize") === "on";

    const draft = validateDrinkDraft({ name, icon, hours, minutes });
    if (!draft.ok) {
      if (draft.fieldErrors) {
        let firstInvalidField = null;
        for (const field of draft.fieldErrors) {
          setDrinkFieldError(field, true);
          if (!firstInvalidField) firstInvalidField = field === "name" ? drinkNameField : drinkIconField;
        }
        requestAnimationFrame(() => {
          firstInvalidField.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }
      showFormError(draft.message);
      return;
    }
    const totalMinutes = draft.totalMinutes;

    if (state.editingDrinkId) {
      const drink = currentDrink;

      if (!drink) {
        showFormError("Esta bebida não foi encontrada.");
        return;
      }

      const updatedDrink = { ...drink, name, icon, intervalMinutes: totalMinutes, askDoseSize };
      const nextDrinks = state.drinks.map((item) => (item.id === drink.id ? updatedDrink : item));

      // Nome e ícone representam a identidade da bebida e acompanham correções.
      // O intervalo histórico NÃO é alterado: cada evento mantém seu snapshot.
      const nextEvents = state.events.map((event) => {
        if (event.drinkId !== drink.id) return event;
        return {
          ...event,
          drinkName: name,
          drinkIcon: icon,
        };
      });

      try {
        const result = commitAppData(dataStorageKey, buildCurrentAppData(), { drinks: nextDrinks, events: nextEvents });
        state.drinks = result.drinks;
        state.events = result.events;
      } catch {
        showFormError("Não foi possível salvar. Tente novamente.");
        return;
      }
      closeDrinkDialog();
      refreshDataViews();
      showToast(`${name} atualizada. Novas anotações usarão o novo intervalo.`);
      return;
    }

    const nextDrinks = [...state.drinks, {
      id: createId(),
      name,
      icon,
      intervalMinutes: totalMinutes,
      askDoseSize,
    }];

    try {
      state.drinks = commitAppData(dataStorageKey, buildCurrentAppData(), { drinks: nextDrinks }).drinks;
    } catch {
      showFormError("Não foi possível salvar. Tente novamente.");
      return;
    }
    closeDrinkDialog();
    refreshDataViews();
  }

  // --- Registro de consumo: menu da bebida, dose, log manual, aviso de intervalo ---

  function registerDrinkAt(id, timestamp, { doseSize = null, onSaved = null } = {}) {
    if (globalThis.reconcileOccasions && !globalThis.reconcileOccasions()) return;
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
      occasionId: (() => { if (!state.preferences.eventsEnabled) return null; const match = state.occasions.find((item) => globalThis.FunTimeOccasions.contains(item, timestamp)); return match ? match.id : null; })(),
      intervalMinutes: drink.intervalMinutes,
      doseSize: drink.askDoseSize ? (normalizeDoseSize(doseSize) || "full") : null,
    };

    const events = [...state.events, event];
    try {
      state.events = commitAppData(dataStorageKey, buildCurrentAppData(), { events }).events;
    } catch {
      showAppNotification('Não foi possível salvar a dose. Tente novamente.', { type: 'error' }); return;
    }
    onSaved?.();
    refreshDataViews();
    if (state.preferences.eventsEnabled && !event.occasionId && globalThis.FunTimeOccasions.active(state.occasions)) showToast("Registro fora do período do evento em andamento: salvo sem evento.");

    const reorder = state.currentView === "home"
      ? animateDrinkReorder(previousPositions, drink.id)
      : { movedFocus: false, promise: Promise.resolve() };

    if (drink.askDoseSize && !normalizeDoseSize(doseSize)) {
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

    const doseSize = value === "half" ? "half" : "full";
    const nextEvents = state.events.map((item) => (item.id === event.id ? { ...item, doseSize } : item));
    try {
      state.events = commitAppData(dataStorageKey, buildCurrentAppData(), { events: nextEvents }).events;
    } catch {
      showAppNotification("Não foi possível salvar. Tente novamente.", { type: "error" });
      return;
    }
    refreshDataViews();
    updateDoseDialogSelection(doseSize);
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

    const nextEvents = state.events.filter((event) => event.id !== state.undo.eventId);
    try {
      state.events = commitAppData(dataStorageKey, buildCurrentAppData(), { events: nextEvents }).events;
    } catch {
      showAppNotification("Não foi possível desfazer. Tente novamente.", { type: "error" });
      return;
    }
    refreshDataViews();
    state.undo = null;
    hideToast();
  }

  function openDrinkMenuDialog(drinkId) {
    const drink = state.drinks.find((item) => item.id === drinkId);
    if (!drink) return;

    state.menuDrinkId = drinkId;
    drinkMenuName.textContent = `${drink.icon} ${drink.name}`;
    updateDrinkMenuCountdown();
    drinkMenuDialog.showModal();
  }

  let pendingCountdownStop = null;

  function updateDrinkMenuCountdown() {
    const drink = state.drinks.find(item => item.id === state.menuDrinkId);
    document.querySelector('#drink-menu-stop').hidden = !drink || getDrinkActivity(drink).remainingMs <= 0;
  }

  function openStopCountdownDialog() {
    const drink = state.drinks.find(item => item.id === state.menuDrinkId);
    const activity = drink && getDrinkActivity(drink);
    if (!activity || activity.remainingMs <= 0) { updateDrinkMenuCountdown(); return; }
    pendingCountdownStop = { drinkId: drink.id, eventId: activity.latestEvent.id, consumedAt: activity.latestEvent.consumedAt, intervalMinutes: activity.latestEvent.intervalMinutes };
    document.querySelector('#stop-countdown-name').textContent = `${drink.icon} ${drink.name}`;
    document.querySelector('#stop-countdown-error').hidden = true;
    document.querySelector('#stop-countdown-dialog').showModal();
  }

  function closeStopCountdownDialog() {
    pendingCountdownStop = null;
    document.querySelector('#stop-countdown-dialog').close();
  }

  function confirmStopCountdown() {
    if (!document.querySelector('#stop-countdown-dialog').open || state.securityLocked) { pendingCountdownStop = null; return; }
    const target = pendingCountdownStop;
    const drink = state.drinks.find(item => item.id === target?.drinkId);
    const activity = drink && getDrinkActivity(drink);
    const latest = activity?.latestEvent;
    if (!target || !latest || activity.remainingMs <= 0 || latest.id !== target.eventId || latest.consumedAt !== target.consumedAt || latest.intervalMinutes !== target.intervalMinutes) {
      closeStopCountdownDialog(); updateDrinkMenuCountdown();
      showToast('A contagem mudou ou já terminou. Abra novamente o menu da bebida.');
      return;
    }
    const events = state.events.filter(event => event.id !== latest.id);
    try {
      state.events = commitAppData(dataStorageKey, buildCurrentAppData(), { events }).events;
    } catch (error) {
      const message = document.querySelector('#stop-countdown-error');
      message.textContent = 'Não foi possível salvar. A contagem foi mantida. Tente novamente.';
      message.hidden = false;
      return;
    }
    closeStopCountdownDialog();
    closeDrinkMenuDialog();
    closeHistoryView();
    refreshDataViews();
    showToast('Contagem cancelada. A dose foi removida do histórico.');
  }

  function closeDrinkMenuDialog() {
    state.menuDrinkId = null;
    if (drinkMenuDialog.open) drinkMenuDialog.close();
  }

  function openOtherTimeFromDrinkMenu() {
    const drinkId = state.menuDrinkId;
    if (drinkId) openLogDialog(drinkId);
  }

  function editDrinkFromDrinkMenu() {
    const drinkId = state.menuDrinkId;
    if (drinkId) openEditDrinkDialog(drinkId);
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
    openLogDialog(drinkId);
  }

  function openLogDialog(drinkId) {
    const drink = state.drinks.find((item) => item.id === drinkId);
    if (!drink) return;

    const activity = getDrinkActivity(drink);

    state.selectedDrinkId = drinkId;
    logDrinkName.textContent = drink.name;
    document.querySelector("#log-dose-field").hidden = !drink.askDoseSize;
    document.querySelector('input[name="logDoseSize"][value="full"]').checked = true;
    setLogDurationPicker(0, 0);
    logFormError.hidden = true;

    if (activity.state === "waiting" || activity.state === "danger") {
      activeIntervalWarning.hidden = false;
      activeIntervalWarningTitle.textContent = "O registro anterior será mantido";
      activeIntervalWarningText.textContent = "Este consumo será adicionado ao histórico. O app não substitui nem apaga os registros anteriores.";
    } else {
      activeIntervalWarning.hidden = true;
    }

    beginFormDraft(logForm);
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
    const doseSize = document.querySelector('input[name="logDoseSize"]:checked')?.value || "full";
    registerDrinkAt(id, timestamp, { doseSize, onSaved: () => {
      closeLogDialog();
      closeIntervalWarningDialog();
      closeDrinkMenuDialog();
      closeHistoryView();
    } });
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

  // --- Roleta de intervalo (bebida) e "há quanto tempo" (log) ---

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

  const logDurationPicker = createDurationPicker({
    maxHours: 48, hoursWheel: logHoursWheel, minutesWheel: logMinutesWheel,
    hoursInput: logHoursAgoInput, minutesInput: logMinutesAgoInput,
  });
  function setLogDurationPicker(hours, minutes) { logDurationPicker.set(hours, minutes); }
  function initializeLogDurationPickers() { logDurationPicker.initialize(0, 0); }

  const intervalDurationPicker = createDurationPicker({
    maxHours: 24, hoursWheel: intervalHoursWheel, minutesWheel: intervalMinutesWheel,
    hoursInput: intervalHoursInput, minutesInput: intervalMinutesInput,
    capMinutesAtMaxHours: true, onHoursChange: updateMinuteWheelAvailability,
  });
  function setDurationPicker(hours, minutes) { intervalDurationPicker.set(hours, minutes); }
  function initializeDurationPickers() { intervalDurationPicker.initialize(1, 0); }

  // --- Listeners próprios do domínio ---

  document.querySelector("#open-add-dialog").addEventListener("click", openDrinkDialog);
  document.querySelector("#empty-add-button").addEventListener("click", openDrinkDialog);
  document.querySelector("#empty-add-icon").addEventListener("click", openDrinkDialog);
  document.querySelector("#close-dialog").addEventListener("click", closeDrinkDialog);
  document.querySelector("#cancel-dialog").addEventListener("click", closeDrinkDialog);
  deleteDrinkFromEditorButton.addEventListener("click", () => {
    if (state.editingDrinkId) openDeleteDrinkDialog(state.editingDrinkId, { returnToEditorOnCancel: true });
  });
  drinkForm.addEventListener("submit", handleDrinkSubmit);
  nameInput.addEventListener("input", () => {
    if (nameInput.value.trim()) clearDrinkFieldError("name");
  });

  document.querySelector("#cancel-delete-drink").addEventListener("click", () => closeDeleteDrinkDialog());
  document.querySelector("#delete-drink-keep-history").addEventListener("click", deleteDrinkKeepingHistory);
  document.querySelector("#delete-drink-with-history").addEventListener("click", deleteDrinkWithHistory);

  document.querySelector("#close-interval-warning-dialog").addEventListener("click", closeIntervalWarningDialog);
  document.querySelector("#cancel-interval-warning-dialog").addEventListener("click", closeIntervalWarningDialog);
  document.querySelector("#confirm-interval-warning").addEventListener("click", continueFromIntervalWarning);

  document.querySelector("#close-drink-menu-dialog").addEventListener("click", closeDrinkMenuDialog);
  document.querySelector("#drink-menu-other-time").addEventListener("click", openOtherTimeFromDrinkMenu);
  document.querySelector('#drink-menu-stop').addEventListener('click', openStopCountdownDialog);
  document.querySelector('#cancel-stop-countdown').addEventListener('click', closeStopCountdownDialog);
  document.querySelector('#confirm-stop-countdown').addEventListener('click', confirmStopCountdown);
  document.querySelector("#drink-menu-edit").addEventListener("click", editDrinkFromDrinkMenu);

  document.querySelector("#close-log-dialog").addEventListener("click", closeLogDialog);
  document.querySelector("#cancel-log-dialog").addEventListener("click", closeLogDialog);
  logForm.addEventListener("submit", handleLogSubmit);

  document.querySelector("#close-dose-size-dialog").addEventListener("click", closeDoseSizeDialog);
  doseHalfButton.addEventListener("click", () => choosePendingDoseSize("half"));
  doseFullButton.addEventListener("click", () => choosePendingDoseSize("full"));

  document.querySelectorAll(".quick-time-button").forEach((button) => {
    button.addEventListener("click", () => {
      const minutesAgo = Number(button.dataset.minutesAgo);
      registerMinutesAgo(minutesAgo);
    });
  });

  toastUndo.addEventListener("click", undoLastRegistration);

  wireDialogDismissal(drinkDialog, closeDrinkDialog);
  wireDialogDismissal(deleteDrinkDialog, () => closeDeleteDrinkDialog(), { cancel: true });
  wireDialogDismissal(intervalWarningDialog, closeIntervalWarningDialog);
  wireDialogDismissal(drinkMenuDialog, closeDrinkMenuDialog, { cancel: true });
  wireDialogDismissal(logDialog, closeLogDialog);
  wireDialogDismissal(doseSizeDialog, closeDoseSizeDialog, { cancel: true });

  return {
    openDrinkDialog, openEditDrinkDialog, openDeleteDrinkDialog, closeDeleteDrinkDialog,
    deleteDrinkKeepingHistory, deleteDrinkWithHistory, closeDrinkDialog, handleDrinkSubmit,
    registerDrinkAt, openDoseSizeDialog, choosePendingDoseSize, closeDoseSizeDialog,
    undoLastRegistration, openDrinkMenuDialog, updateDrinkMenuCountdown, openStopCountdownDialog,
    closeStopCountdownDialog, confirmStopCountdown, closeDrinkMenuDialog, openOtherTimeFromDrinkMenu,
    editDrinkFromDrinkMenu, openIntervalWarningDialog, updateIntervalWarningDialog,
    closeIntervalWarningDialog, continueFromIntervalWarning, openLogDialog, closeLogDialog,
    registerMinutesAgo, handleLogSubmit,
    setDurationPicker, initializeDurationPickers, setLogDurationPicker, initializeLogDurationPickers,
  };
}
