export function createDrinkReorderController({
  state, drinkList, pressMs, moveTolerance,
  captureDrinkCardPositions, animateManualDrinkShift, persistManualDrinkOrder,
  showToast, showAppNotification, render,
}) {
  let cancelActiveDrinkReorder = null;
  let cancelPendingDrinkReorder = null;

  function beginDrinkReorder(card, icon, drink, point) {
    if (state.draggingDrinkId || !card.isConnected || card.dataset.reorderEligible !== "true") return;

    const sourceRect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.className = `${card.className} drink-reorder-ghost`;
    ghost.style.width = `${sourceRect.width}px`;
    ghost.style.height = `${sourceRect.height}px`;
    ghost.querySelectorAll("button").forEach((button) => { button.tabIndex = -1; });
    document.body.appendChild(ghost);

    const offsetX = point.clientX - sourceRect.left;
    const offsetY = point.clientY - sourceRect.top;
    const originalIcon = icon.querySelector(".drink-icon-symbol")?.textContent || drink.icon;
    let latestPoint = point;
    let autoScrollFrame = null;
    const setGhostPosition = (nextPoint) => {
      ghost.style.transform = `translate3d(${nextPoint.clientX - offsetX}px, ${nextPoint.clientY - offsetY}px, 0)`;
    };

    state.draggingDrinkId = drink.id;
    card.classList.add("is-drink-drag-source");
    icon.classList.add("is-dragging");
    const symbol = icon.querySelector(".drink-icon-symbol");
    if (symbol) symbol.textContent = "⠿";
    setGhostPosition(point);
    if (typeof navigator.vibrate === "function") navigator.vibrate(30);

    const move = (nextPoint) => {
      latestPoint = nextPoint;
      setGhostPosition(nextPoint);
      const candidates = [...drinkList.querySelectorAll('.drink-card[data-reorder-eligible="true"]')]
        .filter((candidate) => candidate !== card);
      const target = candidates.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return nextPoint.clientY < rect.top + rect.height / 2;
      });
      if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScroll);
      const alreadyPlaced = target ? card.nextElementSibling === target : card === drinkList.lastElementChild;
      if (alreadyPlaced) return;
      const before = captureDrinkCardPositions();
      if (target) drinkList.insertBefore(card, target);
      else drinkList.appendChild(card);
      animateManualDrinkShift(before);

    };

    const autoScroll = () => {
      autoScrollFrame = null;
      const ghostTop = latestPoint.clientY - offsetY;
      const ghostBottom = ghostTop + sourceRect.height;
      const speed = ghostTop < 0
        ? -Math.ceil(Math.abs(ghostTop) / 7)
        : ghostBottom > innerHeight
          ? Math.ceil((ghostBottom - innerHeight) / 7)
          : 0;
      if (!speed) return;
      window.scrollBy(0, Math.max(-14, Math.min(14, speed)));
      move(latestPoint);
    };

    const finish = (save) => {
      if (state.draggingDrinkId !== drink.id) return;
      state.draggingDrinkId = null;
      cancelActiveDrinkReorder = null;
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerCancel);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("touchend", touchEnd, true);
      document.removeEventListener("touchcancel", touchCancel, true);
      document.removeEventListener("pointerup", touchPointerUp, true);
      document.removeEventListener("pointercancel", touchPointerCancel, true);
      document.removeEventListener("pointermove", touchPointerMove, true);
      window.removeEventListener("blur", cancelExternally);
      document.removeEventListener("visibilitychange", cancelExternally);
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
      ghost.remove();
      card.classList.remove("is-drink-drag-source");
      icon.classList.remove("is-dragging");
      if (symbol) symbol.textContent = originalIcon;
      if (save) {
        const ids = [...drinkList.querySelectorAll('.drink-card[data-reorder-eligible="true"]')]
          .map((item) => item.dataset.drinkId);
        try {
          persistManualDrinkOrder(ids);
          showToast("Ordem das bebidas salva.");
        } catch (error) {
          showAppNotification("Não foi possível salvar a ordem. A ordem anterior foi mantida.", { type: "error", persistent: true });
        }
      }
      render();
    };

    const pointerMove = (event) => {
      if (event.pointerId !== point.pointerId) return;
      move(event);
    };
    const pointerUp = (event) => { if (event.pointerId === point.pointerId) finish(true); };
    const pointerCancel = (event) => { if (event.pointerId === point.pointerId) finish(false); };
    const touchMove = (event) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1) return finish(false);
      if (event.cancelable) event.preventDefault();
      move(touch);
    };
    const touchEnd = () => finish(true);
    const touchCancel = () => finish(false);
    const touchPointerUp = () => finish(true);
    const touchPointerCancel = () => setTimeout(() => finish(true), 0);
    const touchPointerMove = (event) => move(event);
    const cancelExternally = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) finish(false);
    };
    cancelActiveDrinkReorder = () => finish(false);

    window.addEventListener("blur", cancelExternally);
    document.addEventListener("visibilitychange", cancelExternally);

    if (point.isTouch) {
      document.addEventListener("touchmove", touchMove, { capture: true, passive: false });
      document.addEventListener("touchend", touchEnd, true);
      document.addEventListener("touchcancel", touchCancel, true);
      document.addEventListener("pointerup", touchPointerUp, true);
      document.addEventListener("pointercancel", touchPointerCancel, true);
      document.addEventListener("pointermove", touchPointerMove, true);
    } else {
      window.addEventListener("pointermove", pointerMove);
      window.addEventListener("pointerup", pointerUp);
      window.addEventListener("pointercancel", pointerCancel);
    }
  }

  function attachDrinkReorderGesture(card, dragSurface, icon, drink) {
    let pressTimer = null;
    let suppressClick = false;
    const cancelPending = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      icon.classList.remove("is-reorder-pressing");
    };
    const start = (point) => {
      if (state.draggingDrinkId || state.pendingDrinkReorderId || !card.isConnected || card.dataset.reorderEligible !== "true") return;
      const origin = { ...point };
      state.pendingDrinkReorderId = drink.id;
      icon.classList.add("is-reorder-pressing");
      pressTimer = setTimeout(() => {
        cleanup();
        suppressClick = true;
        beginDrinkReorder(card, icon, drink, origin);
      }, pressMs);

      const move = (next) => {
        if (Math.hypot(next.clientX - origin.clientX, next.clientY - origin.clientY) <= moveTolerance) return true;
        cleanup();
        return false;
      };
      const cleanup = () => {
        cancelPending();
        if (state.pendingDrinkReorderId === drink.id) state.pendingDrinkReorderId = null;
        if (cancelPendingDrinkReorder === cleanup) cancelPendingDrinkReorder = null;
        window.removeEventListener("pointermove", pointerMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        document.removeEventListener("touchmove", touchMove, true);
        document.removeEventListener("touchend", cleanup, true);
        document.removeEventListener("touchcancel", cleanup, true);
        window.removeEventListener("blur", cleanup);
        document.removeEventListener("visibilitychange", cleanup);
      };
      cancelPendingDrinkReorder = cleanup;
      window.addEventListener("blur", cleanup);
      document.addEventListener("visibilitychange", cleanup);
      const pointerMove = (event) => { if (event.pointerId === origin.pointerId) move(event); };
      const touchMove = (event) => {
        const touch = [...event.touches].find((item) => item.identifier === origin.pointerId);
        if (touch && move(touch) && event.cancelable) event.preventDefault();
      };
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

    dragSurface.addEventListener("click", (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }, true);
    dragSurface.addEventListener("contextmenu", (event) => event.preventDefault());
    dragSurface.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      start({ isTouch: true, pointerId: touch.identifier, clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: true });
    dragSurface.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      start({ isTouch: false, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
    });
  }

  return {
    attachDrinkReorderGesture,
    cancelPending: () => cancelPendingDrinkReorder?.(),
    cancelActive: () => cancelActiveDrinkReorder?.(),
  };
}
