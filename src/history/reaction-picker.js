export function createHistoryReactionController({
  state, pressMs, moveTolerance,
  reactionPickerPopover, openEventDialog,
  commitAppData, buildCurrentAppData, dataStorageKey,
  showAppNotification, refreshDataViews, REACTIONS,
}) {
  let activeEventId = null;
  let activeTargetButton = null;

  REACTIONS.forEach((reaction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reaction-picker-button";
    button.dataset.reaction = reaction.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", reaction.label);
    button.textContent = reaction.icon;
    button.addEventListener("click", () => setReaction(reaction.id));
    reactionPickerPopover.appendChild(button);
  });

  function updateSelection(reactionId) {
    reactionPickerPopover.querySelectorAll(".reaction-picker-button").forEach((button) => {
      const isSelected = button.dataset.reaction === reactionId;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  // Ancora o popover perto do card tocado, acima dele se houver espaço, abaixo senão -
  // igual ao menu de reações de apps de mensagem, em vez de um modal centralizado na tela.
  function positionPopover(targetButton) {
    const card = targetButton.querySelector(".history-event-body") || targetButton;
    const cardRect = card.getBoundingClientRect();
    const gap = 10;
    const popoverRect = reactionPickerPopover.getBoundingClientRect();

    let top = cardRect.top - popoverRect.height - gap;
    if (top < 8) top = Math.min(cardRect.bottom + gap, window.innerHeight - popoverRect.height - 8);

    let left = cardRect.left + cardRect.width / 2 - popoverRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popoverRect.width - 8));

    reactionPickerPopover.style.top = `${Math.max(8, top)}px`;
    reactionPickerPopover.style.left = `${left}px`;
  }

  function openPicker(eventId, targetButton) {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    // Trocar de reação reabre sobre o mesmo card: fecha a instância anterior primeiro
    // para não deixar destaque/estado da vez passada para trás.
    closePicker();
    activeEventId = eventId;
    activeTargetButton = targetButton;
    targetButton.classList.add("is-reacting");
    updateSelection(event.reaction || null);
    reactionPickerPopover.hidden = false;
    positionPopover(targetButton);
  }

  function closePicker() {
    if (reactionPickerPopover.hidden) return;
    reactionPickerPopover.hidden = true;
    activeTargetButton?.classList.remove("is-reacting");
    activeTargetButton = null;
    activeEventId = null;
  }

  // Elemento simples com `hidden` (não a Popover API): em teste automatizado o
  // showPopover()/fechar manual funcionava, mas no aparelho real o popover ficava
  // preso na tela - não fechava ao tocar fora nem ao trocar de tela, e por tabela
  // impedia reagir de novo (o gesto já considerava um seletor sempre aberto). Esta
  // versão não depende de nenhum comportamento nativo de popover: abrir/fechar é
  // só a flag `hidden`, e quem decide fechar somos nós, nos dois lugares abaixo e
  // em setCurrentView() (troca de tela) em app.js.
  const handleOutsideStart = (event) => {
    if (reactionPickerPopover.hidden) return;
    if (reactionPickerPopover.contains(event.target)) return;
    closePicker();
  };
  document.addEventListener("touchstart", handleOutsideStart, true);
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    handleOutsideStart(event);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !reactionPickerPopover.hidden) closePicker();
  });

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

  // Dono único do listener de clique do registro: evita a corrida entre o
  // clique normal (abrir "Editar registro") e o clique fantasma que o
  // navegador sintetiza depois de um toque-e-segurar bem-sucedido.
  function attachEventButton(button, event) {
    let pressTimer = null;
    let suppressClick = false;

    const start = (point) => {
      if (state.pendingHistoryReactionId || !reactionPickerPopover.hidden) return;
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
        openPicker(event.id, button);
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
