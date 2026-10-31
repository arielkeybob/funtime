import { setWheelPickerValue } from "../ui/wheel-picker.js";
import { resolveLogTimestamp, formatLogDay, agendaDateParts } from "../format/datetime.js";

export function createDrinkInteractions({
  state,
  // DOM — editor de bebida
  drinkForm, nameInput, drinkNameField, drinkIconField, formError,
  drinkDialogEyebrow, drinkDialogTitle, drinkSubmitButton, deleteDrinkFromEditorButton,
  drinkIntervalEditNote, askDoseSizeInput, drinkDialog,
  deleteDrinkDialog, deleteDrinkName, deleteDrinkSummary,
  // DOM — registro de consumo (menu/dose/log/aviso de intervalo)
  intervalWarningDialog, intervalWarningDrinkName, intervalWarningRemaining,
  intervalWarningMessage, intervalWarningContext,
  drinkMenuDialog, drinkMenuName,
  logDialog, logForm, logDrinkName, activeIntervalWarning, activeIntervalWarningTitle,
  activeIntervalWarningText, logHourInput, logMinuteInput,
  logHourWheel, logMinuteWheel, logDateInput, logDayLabel, intervalHoursWheel, intervalMinutesWheel,
  intervalHoursInput, intervalMinutesInput, logFormError,
  doseSizeDialog, doseSizeDrinkName, doseHalfButton, doseFullButton, toastUndo,
  // Dependências externas
  createDurationPicker, validateDrinkDraft,
  setDrinkFieldError, clearDrinkFieldError, clearDrinkValidation,
  showFormError, showLogFormError,
  commitAppData, buildCurrentAppData, dataStorageKey,
  refreshDataViews, showToast, showAppNotification, hideToast, closeHistoryView,
  normalizeIcon, normalizeDoseSize, createId,
  getEventDrinkIdentity, getDoseLabel, getDrinkActivity, formatClock, formatTime, formatInterval,
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
    drinkDialogTitle.textContent = `${drink.icon} ${drink.name}`;
    drinkSubmitButton.textContent = "Salvar alterações";
    deleteDrinkFromEditorButton.hidden = false;
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
    // Com registros, a pergunta é o que fazer com eles, e manter vem marcado; sem nenhum,
    // é só confirmar.
    const one = eventCount === 1;
    deleteDrinkSummary.hidden = eventCount > 0;
    document.getElementById("delete-drink-history-choice").hidden = !eventCount;
    document.getElementById("delete-drink-question").textContent = `O que fazer com ${one ? "o registro" : `os ${eventCount} registros`} dela?`;
    document.getElementById("delete-drink-keep-note").textContent = `${one ? "Continua" : "Continuam"} lá, com o nome e o ícone dela.`;
    document.getElementById("delete-drink-erase-note").textContent = `${one ? "Some" : "Somem"} com a bebida. Não dá para desfazer.`;
    deleteDrinkDialog.querySelector('input[name="delete-drink-history"][value="keep"]').checked = true;
    deleteDrinkDialog.showModal();
  }

  // Sem registros não há o que manter: exclui direto (e o aviso não fala de histórico mantido).
  function confirmDeleteDrink() {
    const hasHistory = state.events.some((event) => event.drinkId === state.deleteDrinkId);
    const erase = deleteDrinkDialog.querySelector('input[name="delete-drink-history"][value="erase"]').checked;
    if (hasHistory && !erase) deleteDrinkKeepingHistory();
    else deleteDrinkWithHistory();
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
      // Editou pelo menu ⋮: o menu atrás mostraria o nome e o intervalo antigos.
      if (drinkMenuDialog.open) closeDrinkMenuDialog();
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
      reaction: null,
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
    document.querySelector('#drink-menu-interval').textContent = formatInterval(drink.intervalMinutes) + ' ›';
    updateDrinkMenuCountdown();
    drinkMenuDialog.showModal();
  }

  let pendingCountdownStop = null;

  function updateDrinkMenuCountdown() {
    // A linha "Cancelar contagem" só existe durante a contagem e mostra quanto falta.
    const drink = state.drinks.find(item => item.id === state.menuDrinkId);
    const remainingMs = drink ? getDrinkActivity(drink).remainingMs : 0;
    document.querySelector('#drink-menu-stop').hidden = remainingMs <= 0;
    document.querySelector('#drink-menu-remaining').textContent = remainingMs > 0 ? formatTime(remainingMs) : '';
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
    // A bebida é o título; o alerta diz quanto falta.
    document.querySelector("#interval-warning-title").textContent = `${drink.icon} ${drink.name}`;
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
    logDrinkName.textContent = `${drink.icon} ${drink.name}`;
    document.querySelector("#log-dose-field").hidden = !drink.askDoseSize;
    document.querySelector('input[name="logDoseSize"][value="full"]').checked = true;
    const now = new Date();
    logDateChosen = false;
    setLogClock(now.getHours(), now.getMinutes());
    updateLogDay();
    logFormError.hidden = true;

    if (activity.state === "waiting" || activity.state === "danger") {
      activeIntervalWarning.hidden = false;
      activeIntervalWarningTitle.textContent = "O registro anterior será mantido";
      activeIntervalWarningText.textContent = "Este consumo será adicionado ao histórico. O app não substitui nem apaga os registros anteriores.";
    } else {
      activeIntervalWarning.hidden = true;
    }

    beginFormDraft(logForm);
    updateLogSubmitLabel();
    logDialog.showModal();
    // Com o diálogo fechado a rolagem não acontece; reaplica agora que as roletas estão visíveis.
    setLogClock(now.getHours(), now.getMinutes());
  }

  // "Foi que horas?": sem data tocada, a roleta vale para hoje ou, se a hora ainda não chegou,
  // para ontem; tocando na data, o calendário permite qualquer dia passado. Ver docs/specs/0030.
  let logDateChosen = false;

  function toDateInputValue(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function readLogMoment(now = Date.now()) {
    if (logDateChosen && !logDateInput.value) logDateChosen = false;
    return resolveLogTimestamp({
      hour: logHourInput.value, minute: logMinuteInput.value,
      date: logDateChosen ? logDateInput.value : null, now,
    });
  }

  function updateLogDay() {
    const now = Date.now();
    const moment = readLogMoment(now);
    logDateInput.max = toDateInputValue(now);
    if (!logDateChosen) logDateInput.value = toDateInputValue(moment.timestamp);
    logDayLabel.textContent = formatLogDay(moment.timestamp, now);
    return moment;
  }

  // O botão diz quando vai ser anotado ("Anotar às 20:10", "Anotar ontem às 23:00"); ele só aparece depois de mexer nas roletas.
  function updateLogSubmitLabel() {
    const moment = updateLogDay();
    const button = document.querySelector("#log-submit-button");
    if (!button) return;
    const clock = formatClock(moment.timestamp);
    if (moment.daysAgo === 0 || moment.isFuture) button.textContent = `Anotar às ${clock}`;
    else if (moment.daysAgo === 1) button.textContent = `Anotar ontem às ${clock}`;
    else button.textContent = `Anotar em ${agendaDateParts(moment.timestamp).date} às ${clock}`;
  }

  function closeLogDialog() {
    state.selectedDrinkId = null;
    logDialog.close();
  }

  function registerMinutesAgo(minutesAgo) {
    registerLogAt(Date.now() - minutesAgo * 60 * 1000);
  }

  function registerLogAt(timestamp) {
    if (!state.selectedDrinkId) return;

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

    const hour = Number(logHourInput.value);
    const minute = Number(logMinuteInput.value);

    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      showLogFormError("Escolha um horário válido.");
      return;
    }

    const now = new Date();
    const moment = readLogMoment(now.getTime());
    if (moment.isFuture) {
      showLogFormError("Esse horário ainda não chegou. Escolha outra hora ou outra data.");
      return;
    }

    // No minuto de agora, vale o instante exato (como o botão Agora), não o começo do minuto.
    const isCurrentMinute = moment.daysAgo === 0 && hour === now.getHours() && minute === now.getMinutes();
    registerLogAt(isCurrentMinute ? now.getTime() : moment.timestamp);
  }

  // --- Roleta de intervalo (bebida) e "Foi que horas?" (log) ---

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

  const logClockPicker = createDurationPicker({
    maxHours: 23, hoursWheel: logHourWheel, minutesWheel: logMinuteWheel,
    hoursInput: logHourInput, minutesInput: logMinuteInput,
  });
  function setLogClock(hours, minutes) { logClockPicker.set(hours, minutes); }
  function initializeLogDurationPickers() { logClockPicker.initialize(0, 0); }

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
  deleteDrinkFromEditorButton.addEventListener("click", () => {
    if (state.editingDrinkId) openDeleteDrinkDialog(state.editingDrinkId, { returnToEditorOnCancel: true });
  });
  drinkForm.addEventListener("submit", handleDrinkSubmit);
  nameInput.addEventListener("input", () => {
    if (nameInput.value.trim()) clearDrinkFieldError("name");
  });

  document.querySelector("#cancel-delete-drink").addEventListener("click", () => closeDeleteDrinkDialog());
  document.querySelector("#confirm-delete-drink").addEventListener("click", confirmDeleteDrink);

  document.querySelector("#cancel-interval-warning-dialog").addEventListener("click", closeIntervalWarningDialog);
  document.querySelector("#confirm-interval-warning").addEventListener("click", continueFromIntervalWarning);

  document.querySelector("#close-drink-menu-dialog").addEventListener("click", closeDrinkMenuDialog);
  document.querySelector("#drink-menu-other-time").addEventListener("click", openOtherTimeFromDrinkMenu);
  document.querySelector('#drink-menu-stop').addEventListener('click', openStopCountdownDialog);
  document.querySelector('#cancel-stop-countdown').addEventListener('click', closeStopCountdownDialog);
  document.querySelector('#confirm-stop-countdown').addEventListener('click', confirmStopCountdown);
  document.querySelector("#drink-menu-edit").addEventListener("click", editDrinkFromDrinkMenu);

  document.querySelector("#close-log-dialog").addEventListener("click", closeLogDialog);
  // A data escolhida no calendário passa a mandar; apagada, volta a valer hoje/ontem.
  logDateInput.addEventListener("input", () => { logDateChosen = Boolean(logDateInput.value); });
  for (const type of ["input", "change"]) logForm.addEventListener(type, updateLogSubmitLabel);
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
    setDurationPicker, initializeDurationPickers, setLogClock, initializeLogDurationPickers,
  };
}
