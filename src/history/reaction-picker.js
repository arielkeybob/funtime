export function createHistoryReactionController({
  state, pressMs, moveTolerance,
  reactionPickerPopover, openEventDialog,
  commitAppData, buildCurrentAppData, dataStorageKey,
  showAppNotification, refreshDataViews, REACTIONS,
}) {
  let activeEventId = null;
  let activeTargetButton = null;

  // Depois de soltar um toque, o navegador sintetiza mousedown/mouseup/click nas
  // MESMAS coordenadas do toque - se algo novo (como o seletor) abriu bem naquele
  // ponto durante o toque, o fantasma acaba "clicando" ali sem o usuário ter feito
  // nada. Intercepta e descarta esses três eventos uma única vez, bem na captura
  // (antes de alcançar qualquer alvo), então libera - janela curta o bastante pra
  // não engolir um toque genuíno logo em seguida.
  function suppressGhostClick() {
    const block = (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopImmediatePropagation();
    };
    ["mousedown", "mouseup", "click"].forEach((type) => document.addEventListener(type, block, true));
    setTimeout(() => {
      ["mousedown", "mouseup", "click"].forEach((type) => document.removeEventListener(type, block, true));
    }, 500);
  }

  const heading = document.createElement("p");
  heading.className = "reaction-picker-heading";
  heading.id = "reaction-picker-heading";
  heading.textContent = "Como está se sentindo?";
  reactionPickerPopover.appendChild(heading);

  const optionsRow = document.createElement("div");
  optionsRow.className = "reaction-picker-options";
  reactionPickerPopover.appendChild(optionsRow);

  REACTIONS.forEach((reaction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reaction-picker-button";
    button.dataset.reaction = reaction.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", reaction.label);
    button.textContent = reaction.icon;
    button.addEventListener("click", () => setReaction(reaction.id, button));
    optionsRow.appendChild(button);
  });

  function updateSelection(reactionId) {
    reactionPickerPopover.querySelectorAll(".reaction-picker-button").forEach((button) => {
      const isSelected = button.dataset.reaction === reactionId;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  // Ancora o popover perto do selo no canto (direita do card), acima dele se houver
  // espaço, abaixo senão - mais perto de onde o dedo tocou do que centralizado no
  // card inteiro, igual ao menu de reações de apps de mensagem.
  function positionPopover(targetButton) {
    const anchor = targetButton.querySelector(".history-reaction-badge")
      || targetButton.querySelector(".history-event-body")
      || targetButton;
    const anchorRect = anchor.getBoundingClientRect();
    const gap = 10;
    const popoverRect = reactionPickerPopover.getBoundingClientRect();

    let top = anchorRect.top - popoverRect.height - gap;
    if (top < 8) top = Math.min(anchorRect.bottom + gap, window.innerHeight - popoverRect.height - 8);

    let left = anchorRect.right - popoverRect.width;
    left = Math.max(8, Math.min(left, window.innerWidth - popoverRect.width - 8));

    reactionPickerPopover.style.top = `${Math.max(8, top)}px`;
    reactionPickerPopover.style.left = `${left}px`;
  }

  // Emoji efêmero que sobe e some de cima do botão tocado no seletor - mesma técnica
  // do balão "N BPM" do easter egg (elemento fixo em document.body, anima por CSS
  // puro, se autodestrói por setTimeout), só que mais sutil. Precisa rodar com o
  // seletor AINDA visível: refreshDataViews()/closePicker() rodam logo em seguida.
  function spawnReactionPop(icon, anchorElement) {
    const rect = anchorElement.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "reaction-pop";
    pop.textContent = icon;
    pop.setAttribute("aria-hidden", "true");
    pop.style.left = `${rect.left + rect.width / 2}px`;
    pop.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1500);
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
    // O selo (de qualquer registro) não conta como "fora": ele é a própria
    // entrada para abrir/trocar/fechar o seletor. Sem isso, o pointerdown do
    // segundo toque no mesmo selo fechava aqui, ANTES do click de alternar
    // (abaixo, em attachReactionBadge) rodar - que então via "já fechado" e
    // reabria, parecendo que tocar de novo nunca fechava.
    if (event.target.closest?.(".history-reaction-badge")) return;
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

  function setReaction(reactionId, sourceButton) {
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
    // Só anima ao escolher/trocar, não ao remover (tocar de nova no ícone já
    // selecionado) - desfazer não precisa de celebração visual.
    if (nextReaction && sourceButton) {
      const reaction = REACTIONS.find((item) => item.id === nextReaction);
      if (reaction) spawnReactionPop(reaction.icon, sourceButton);
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
        // O seletor abre perto de onde o dedo está (ancorado no selo); o clique
        // fantasma que o navegador sintetiza ao soltar o toque usa essas MESMAS
        // coordenadas, então pode cair em cima de um botão do seletor e escolher
        // uma reação sozinho. suppressClick (acima) só protege o clique do PRÓPRIO
        // registro - isto aqui intercepta o fantasma antes que ele alcance
        // qualquer elemento, inclusive os botões do seletor recém-aberto.
        if (origin.isTouch) suppressGhostClick();
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

  // Selo no canto do card: clicável independente do toque-e-segurar, segundo
  // caminho até o mesmo seletor. stopPropagation() evita que o clique "vaze" pro
  // botão do registro inteiro (que abriria "Editar registro" junto). Alterna:
  // tocar de novo no mesmo selo com o seletor já aberto para ESTE registro fecha
  // em vez de só fechar-e-reabrir (openPicker() já faz closePicker() primeiro,
  // então sem essa checagem o segundo toque parecia não fazer nada).
  function attachReactionBadge(badge, event, rowButton) {
    badge.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      if (!reactionPickerPopover.hidden && activeEventId === event.id) {
        closePicker();
        return;
      }
      openPicker(event.id, rowButton);
    });
  }

  return { attachEventButton, attachReactionBadge, closePicker };
}
