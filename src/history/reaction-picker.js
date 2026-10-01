export function createHistoryReactionController({
  state, pressMs, moveTolerance,
  reactionPickerDialog, reactionPickerDrinkName, reactionPickerOptions,
  getEventDrinkIdentity, openEventDialog,
  commitAppData, buildCurrentAppData, dataStorageKey,
  showAppNotification, refreshDataViews, REACTIONS,
}) {
  let activeEventId = null;

  REACTIONS.forEach((reaction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reaction-picker-button";
    button.dataset.reaction = reaction.id;
    button.setAttribute("aria-pressed", "false");

    const icon = document.createElement("span");
    icon.className = "reaction-picker-icon";
    icon.textContent = reaction.icon;
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "reaction-picker-label";
    label.textContent = reaction.label;

    button.append(icon, label);
    button.addEventListener("click", () => setReaction(reaction.id));
    reactionPickerOptions.appendChild(button);
  });

  function updateSelection(reactionId) {
    reactionPickerOptions.querySelectorAll(".reaction-picker-button").forEach((button) => {
      const isSelected = button.dataset.reaction === reactionId;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function openPicker(eventId) {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    activeEventId = eventId;
    const drink = getEventDrinkIdentity(event);
    reactionPickerDrinkName.textContent = `${drink.icon} ${drink.name}`;
    updateSelection(event.reaction || null);
    reactionPickerDialog.showModal();
  }

  function closePicker() {
    activeEventId = null;
    if (reactionPickerDialog.open) reactionPickerDialog.close();
  }

  function setReaction(reactionId) {
    const event = state.events.find((item) => item.id === activeEventId);
    if (!event) { closePicker(); return; }

    const nextReaction = event.reaction === reactionId ? null : reactionId;
    const nextEvents = state.events.map((item) => (item.id === event.id ? { ...item, reaction: nextReaction } : item));
    try {
      state.events = commitAppData(dataStorageKey, buildCurrentAppData(), { events: nextEvents }).events;
    } catch {
      showAppNotification("Não foi possível salvar a reação. Tente novamente.", { type: "error" });
      return;
    }
    refreshDataViews();
    closePicker();
  }

  document.querySelector("#close-reaction-picker-dialog")?.addEventListener("click", closePicker);

  // Dono único do listener de clique do registro: evita a corrida entre o
  // clique normal (abrir "Editar registro") e o clique fantasma que o
  // navegador sintetiza depois de um toque-e-segurar bem-sucedido.
  function attachEventButton(button, event) {
    let pressTimer = null;
    let suppressClick = false;

    const start = (point) => {
      if (state.pendingHistoryReactionId || reactionPickerDialog.open) return;
      const origin = { ...point };
      state.pendingHistoryReactionId = event.id;
      button.classList.add("is-reaction-pressing");

      const cleanup = () => {
        clearTimeout(pressTimer);
        pressTimer = null;
        button.classList.remove("is-reaction-pressing");
        if (state.pendingHistoryReactionId === event.id) state.pendingHistoryReactionId = null;
        window.removeEventListener("pointermove", pointerMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        document.removeEventListener("touchmove", touchMove, true);
        document.removeEventListener("touchend", cleanup, true);
        document.removeEventListener("touchcancel", cleanup, true);
        window.removeEventListener("blur", cleanup);
        document.removeEventListener("visibilitychange", cleanup);
      };

      pressTimer = setTimeout(() => {
        cleanup();
        suppressClick = true;
        if (typeof navigator.vibrate === "function") navigator.vibrate(30);
        openPicker(event.id);
      }, pressMs);

      const move = (next) => {
        if (Math.hypot(next.clientX - origin.clientX, next.clientY - origin.clientY) <= moveTolerance) return true;
        cleanup();
        return false;
      };
      const pointerMove = (pointerEvent) => { if (pointerEvent.pointerId === origin.pointerId) move(pointerEvent); };
      const touchMove = (touchEvent) => {
        const touch = [...touchEvent.touches].find((item) => item.identifier === origin.pointerId);
        if (touch && move(touch) && touchEvent.cancelable) touchEvent.preventDefault();
      };

      window.addEventListener("blur", cleanup);
      document.addEventListener("visibilitychange", cleanup);
      if (origin.isTouch) {
        document.addEventListener("touchmove", touchMove, { capture: true, passive: false });
        document.addEventListener("touchend", cleanup, true);
        document.addEventListener("touchcancel", cleanup, true);
      } else {
        window.addEventListener("pointermove", pointerMove);
        window.addEventListener("pointerup", cleanup);
        window.addEventListener("pointercancel", cleanup);
      }
    };

    button.addEventListener("contextmenu", (contextEvent) => contextEvent.preventDefault());
    button.addEventListener("touchstart", (touchEvent) => {
      if (touchEvent.touches.length !== 1) return;
      const touch = touchEvent.touches[0];
      start({ isTouch: true, pointerId: touch.identifier, clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: true });
    button.addEventListener("pointerdown", (pointerEvent) => {
      if (pointerEvent.pointerType === "touch" || pointerEvent.button !== 0) return;
      start({ isTouch: false, pointerId: pointerEvent.pointerId, clientX: pointerEvent.clientX, clientY: pointerEvent.clientY });
    });
    button.addEventListener("click", () => {
      if (suppressClick) { suppressClick = false; return; }
      openEventDialog(event.id);
    });
  }

  return { attachEventButton, closePicker };
}
