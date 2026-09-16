export function createEventDialog({
  state, eventDialog, eventForm, eventDrinkName, eventDateInput, eventTimeInput,
  eventInterval, eventWarning, eventWarningText, eventDeletedNote, eventFormError, eventDoseField,
  getEventDrinkIdentity, getEventContext, formatInterval, formatElapsed, formatClock,
  toLocalDateInputValue, toLocalTimeInputValue, normalizeDoseSize,
  createWheelPicker, setWheelPickerValue, beginFormDraft,
  showEventFormError, commitAppData, buildCurrentAppData, dataStorageKey,
  refreshDataViews, showToast, showAppNotification, showAppConfirmation,
}) {
  function updateEventDateLabel() {
    const date = new Date(eventDateInput.value + 'T12:00:00');
    const label = document.getElementById('event-date-label');
    if (!Number.isFinite(date.getTime())) { label.textContent = 'Selecionar data'; return; }
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    label.textContent = date.toLocaleDateString('pt-BR') + ' (' + weekday[0].toUpperCase() + weekday.slice(1) + ')';
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
    const [hour, minute] = eventTimeInput.value.split(':');
    updateEventDateLabel();
    for (const [id, value] of [['event-hour', hour], ['event-minute', minute]]) {
      const wheel = document.getElementById(id + '-wheel');
      const input = document.getElementById(id);
      if (!wheel._wheelState) createWheelPicker(wheel, input, id === 'event-hour' ? 23 : 59);
      setWheelPickerValue(wheel, Number(value));
    }
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
    setWheelPickerValue(document.getElementById('event-hour-wheel'), Number(hour));
    setWheelPickerValue(document.getElementById('event-minute-wheel'), Number(minute));
    globalThis.populateRecordOccasions?.(event);
    beginFormDraft(eventForm);
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
    const timeValue = document.getElementById('event-hour').value.padStart(2, '0') + ':' + document.getElementById('event-minute').value.padStart(2, '0');

    if (!dateValue || !/^\d{2}:\d{2}$/.test(timeValue)) {
      showEventFormError("Informe a data e o horário do registro.");
      return;
    }

    const timestamp = dateValue === toLocalDateInputValue(selectedEvent.consumedAt) && timeValue === toLocalTimeInputValue(selectedEvent.consumedAt)
      ? selectedEvent.consumedAt : new Date(`${dateValue}T${timeValue}:00`).getTime();

    if (!Number.isFinite(timestamp)) {
      showEventFormError("A data ou o horário informado é inválido.");
      return;
    }

    if (timestamp > Date.now() + 60000) {
      showEventFormError("O registro não pode ficar no futuro.");
      return;
    }

    const occasionId = state.preferences.eventsEnabled ? document.getElementById("record-occasion").value || null : selectedEvent.occasionId || null;
    const occasion = state.occasions.find(item => item.id === occasionId);
    if (occasionId && (!occasion || !globalThis.FunTimeOccasions.contains(occasion, timestamp))) {
      showEventFormError(state.preferences.eventsEnabled ? "O horário está fora deste evento. Escolha outro evento ou Sem evento." : "O horário está fora do período original deste registro."); return;
    }
    const updatedEvent = { ...selectedEvent, occasionId, consumedAt: timestamp };

    if (!eventDoseField.hidden) {
      const selectedDose = eventForm.querySelector('input[name="eventDoseSize"]:checked')?.value;
      updatedEvent.doseSize = normalizeDoseSize(selectedDose) || selectedEvent.doseSize || "full";
    }

    try {
      const events = state.events.map(item => item.id === updatedEvent.id ? updatedEvent : item);
      state.events = commitAppData(dataStorageKey, buildCurrentAppData(), { events }).events;
    } catch { showEventFormError("Não foi possível salvar. A anotação anterior foi mantida."); return; }
    closeEventDialog();
    refreshDataViews();
    showToast("Anotação atualizada. Os intervalos foram recalculados.");
  }

  async function deleteSelectedEvent() {
    const selectedEvent = state.events.find((item) => item.id === state.selectedEventId);
    if (!selectedEvent) return;

    const drink = getEventDrinkIdentity(selectedEvent);
    const drinkName = drink.name || "esta bebida";
    const confirmed = await showAppConfirmation(`Excluir o registro de ${drinkName} das ${formatClock(selectedEvent.consumedAt)}? Os intervalos serão recalculados.`, { title: "Excluir registro", confirmLabel: "Excluir registro" });
    if (!confirmed) return;

    if (state.securityLocked || state.selectedEventId !== selectedEvent.id || !state.events.includes(selectedEvent)) return;
    const nextEvents = state.events.filter((item) => item.id !== selectedEvent.id);
    try {
      state.events = commitAppData(dataStorageKey, buildCurrentAppData(), { events: nextEvents }).events;
    } catch {
      showAppNotification("Não foi possível excluir o registro. Tente novamente.", { type: "error" });
      return;
    }
    closeEventDialog();
    refreshDataViews();
    showToast("Anotação excluída. Os intervalos foram recalculados.");
  }

  document.querySelector("#close-event-dialog").addEventListener("click", closeEventDialog);
  document.querySelector("#cancel-event-dialog").addEventListener("click", closeEventDialog);
  document.querySelector("#delete-event").addEventListener("click", deleteSelectedEvent);
  eventForm.addEventListener("submit", handleEventSubmit);
  eventDateInput.addEventListener("input", updateEventDateLabel);
  eventDateInput.addEventListener("change", updateEventDateLabel);

  return { openEventDialog, closeEventDialog, handleEventSubmit, deleteSelectedEvent };
}
