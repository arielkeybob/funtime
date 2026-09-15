export function createIconReorderController({
  state, iconOptions, drinkDialog, getEditingIconCatalog, commitIconMove, removeCatalogIcon,
}) {
  let cancelIconDrag = null;

  function iconTouchPoint(touch, event) {
    return { isTouch: true, button: 0, isPrimary: true, pointerType: 'touch',
      pointerId: touch.identifier, clientX: touch.clientX, clientY: touch.clientY,
      width: touch.radiusX * 2, height: touch.radiusY * 2, pressure: touch.force,
      type: event.type, cancelable: event.cancelable };
  }

  function beginIconDrag(wrapper, handle, icon, event) {
      globalThis.FunTimeTouchDebug?.record('drag-start', event);
      const pointerId = event.pointerId;
      const startX = event.clientX, startY = event.clientY;
      let x = startX, y = startY, targetIndex = null, frame, previewIndex = -1, overTrash = false;
      const trash = document.querySelector('#icon-trash');
      const nodes = [...iconOptions.querySelectorAll('[data-catalog-icon]')];
      nodes.forEach(node => node.getAnimations().forEach(animation => animation.finish()));
      const sourceIndex = nodes.indexOf(wrapper);
      const boundsAtStart = iconOptions.getBoundingClientRect();
      // Posições fixas da grade: os elementos animados não mudam o alvo do gesto.
      const slots = nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left - boundsAtStart.left + iconOptions.scrollLeft, y: rect.top - boundsAtStart.top, width: rect.width, height: rect.height };
      });
      const rect = wrapper.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'icon-drag-ghost';
      ghost.textContent = icon;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      drinkDialog.append(ghost);
      wrapper.classList.add('icon-dragging');
      iconOptions.classList.add('icon-drag-active');
      trash.hidden = false;
      const preview = index => {
        if (previewIndex === index) return;
        previewIndex = index;
        const order = [...nodes];
        order.splice(sourceIndex, 1);
        order.splice(index, 0, wrapper);
        order.forEach((node, position) => {
          const original = slots[nodes.indexOf(node)], destination = slots[position];
          node.style.transform = `translate(${destination.x - original.x}px, ${destination.y - original.y}px)`;
        });
      };
      const update = () => {
        ghost.style.left = (x - (startX - rect.left)) + 'px';
        ghost.style.top = (y - (startY - rect.top)) + 'px';
        const bounds = iconOptions.getBoundingClientRect();
        trash.style.left = bounds.left + 'px';
        trash.style.top = (bounds.bottom + 18) + 'px';
        trash.style.width = bounds.width + 'px';
        const trashBounds = trash.getBoundingClientRect();
        overTrash = x >= trashBounds.left && x <= trashBounds.right && y >= trashBounds.top && y <= trashBounds.bottom;
        trash.classList.toggle('icon-trash-active', overTrash);
        ghost.classList.toggle('icon-drag-delete', overTrash);
        targetIndex = null;
        if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
          if (x < bounds.left + 28) iconOptions.scrollLeft -= 7;
          if (x > bounds.right - 28) iconOptions.scrollLeft += 7;
          let nearest = Infinity;
          slots.forEach((slot, index) => {
            const left = bounds.left + slot.x - iconOptions.scrollLeft, top = bounds.top + slot.y;
            const distance = Math.hypot(x - left - slot.width / 2, y - top - slot.height / 2);
            if (distance < nearest) { nearest = distance; targetIndex = index; }
          });
          // Não aceitar o espaço dos botões +/caneta como uma posição da lista.
          if (nearest > Math.max(rect.width, rect.height)) targetIndex = null;
          if (targetIndex !== null) {
            preview(targetIndex);
          }
        }
        if (targetIndex === null) preview(sourceIndex);
      };
      const tick = () => {
        if (!handle.isConnected || !drinkDialog.open || document.hidden) { cancel(); return; }
        update();
        frame = requestAnimationFrame(tick);
      };
      const move = event => { if (event.pointerId === pointerId) { x = event.clientX; y = event.clientY; globalThis.FunTimeTouchDebug?.record('drag-move', event); } };
      const finish = () => {
        cancelAnimationFrame(frame);
        nodes.forEach(node => { node.style.transform = ''; });
        ghost.remove();
        trash.hidden = true;
        trash.classList.remove('icon-trash-active');
        wrapper.classList.remove('icon-dragging');
        iconOptions.classList.remove('icon-drag-active');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', drop);
        handle.removeEventListener('pointercancel', cancel);
        handle.removeEventListener('lostpointercapture', cancel);
        window.removeEventListener('keydown', escape, true);
        document.removeEventListener('touchmove', preventTouchScroll, true);
        document.removeEventListener('visibilitychange', cancel);
        window.removeEventListener('blur', cancel);
        window.removeEventListener('resize', cancel);
        window.removeEventListener('pointerdown', anotherPointer);
        document.removeEventListener('touchend', touchEnd, true);
        document.removeEventListener('touchcancel', cancel, true);
        document.removeEventListener('touchstart', extraTouch, true);
        handle.removeEventListener('pointercancel', tracePointerCancel);
        cancelIconDrag = null;
        if (!event.isTouch && handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      };
      const cancel = reason => { globalThis.FunTimeTouchDebug?.record('drag-cancel', reason, reason?.type || 'app-cancel'); finish(); };
      const drop = event => {
        if (event.pointerId !== pointerId) return;
        x = event.clientX; y = event.clientY;
        update();
        const destination = targetIndex;
        const shouldDelete = overTrash;
        globalThis.FunTimeTouchDebug?.record('drag-drop', event, shouldDelete ? 'trash' : destination !== null ? 'grid' : 'outside');
        finish();
        if (shouldDelete) removeCatalogIcon(icon);
        else if (destination !== null) commitIconMove(icon, destination);
      };
      const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } };
      const preventTouchScroll = next => {
        if (event.isTouch) {
          const touch = [...next.touches].find(touch => touch.identifier === pointerId);
          if (!touch || next.touches.length !== 1) { cancel(next); return; }
          move(iconTouchPoint(touch, next));
        }
        if (next.cancelable) next.preventDefault();
      };
      const touchEnd = next => {
        const touch = [...next.changedTouches].find(touch => touch.identifier === pointerId);
        if (!touch) return;
        if (next.cancelable) next.preventDefault();
        drop(iconTouchPoint(touch, next));
      };
      const extraTouch = next => { if (next.touches.length !== 1) cancel(next); };
      const tracePointerCancel = next => globalThis.FunTimeTouchDebug?.record('pointer-cancel-ignored', next);
      const anotherPointer = event => { if (event.pointerId !== pointerId) cancel(); };
      cancelIconDrag = cancel;
      if (event.isTouch) {
        document.addEventListener('touchend', touchEnd, true);
        document.addEventListener('touchcancel', cancel, true);
        document.addEventListener('touchstart', extraTouch, true);
        handle.addEventListener('pointercancel', tracePointerCancel);
      } else {
        handle.setPointerCapture(pointerId);
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', drop);
        handle.addEventListener('pointercancel', cancel);
        handle.addEventListener('lostpointercapture', cancel);
        window.addEventListener('pointerdown', anotherPointer);
      }
      window.addEventListener('keydown', escape, true);
      document.addEventListener('touchmove', preventTouchScroll, { capture: true, passive: false });
      document.addEventListener('visibilitychange', cancel);
      window.addEventListener('blur', cancel);
      window.addEventListener('resize', cancel);
      tick();
  }

  function attachIconGestures(wrapper, input, icon) {
    const handle = wrapper.querySelector('label');
    let suppressClick = false;
    input.setAttribute('aria-describedby', 'icon-reorder-help icon-reorder-keyboard');
    input.addEventListener('keydown', event => {
      if (!event.altKey || getEditingIconCatalog()) return;
      const offsets = { ArrowLeft: -2, ArrowRight: 2, ArrowUp: -1, ArrowDown: 1 };
      const index = state.preferences.iconCatalog.indexOf(icon);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? state.preferences.iconCatalog.length - 1 : index + offsets[event.key];
      if (!Number.isFinite(target)) return;
      event.preventDefault();
      if (!cancelIconDrag) commitIconMove(icon, target);
    });
    handle.addEventListener('contextmenu', event => { globalThis.FunTimeTouchDebug?.record('context-menu', event); event.preventDefault(); });
    handle.addEventListener('dragstart', event => event.preventDefault());
    // Registrar antes de touchstart: o navegador precisa saber que o gesto
    // pode ser consumido depois da pressão longa, antes de iniciar a rolagem.
    handle.addEventListener('touchmove', event => {
      if (iconOptions.classList.contains('icon-drag-active') && event.cancelable) event.preventDefault();
    }, { passive: false });
    handle.addEventListener('click', event => {
      if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    const startPress = event => {
      suppressClick = false;
      if (getEditingIconCatalog() || event.button !== 0 || !event.isPrimary || cancelIconDrag) return;
      let latest = event;
      globalThis.FunTimeTouchDebug?.record('press-start', event);
      const cancel = reason => {
        globalThis.FunTimeTouchDebug?.record('press-end', latest, typeof reason === 'string' ? reason : reason?.type || 'app-cancel');
        clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', cancel);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('pointerdown', anotherPointer);
        window.removeEventListener('blur', cancel);
        window.removeEventListener('keydown', escape, true);
        document.removeEventListener('scroll', cancel, true);
        document.removeEventListener('visibilitychange', cancel);
        document.removeEventListener('touchmove', touchMove, true);
        document.removeEventListener('touchend', cancel);
        document.removeEventListener('touchcancel', cancel);
        document.removeEventListener('touchstart', extraTouch);
        cancelIconDrag = null;
      };
      const move = next => {
        if (next.pointerId !== event.pointerId) return;
        latest = next;
        const distance = Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY);
        globalThis.FunTimeTouchDebug?.record('press-move', next, '', distance);
        if (distance > (event.isTouch ? 18 : 10)) cancel('scroll-intent');
      };
      const touchMove = next => {
        const touch = [...next.touches].find(touch => touch.identifier === event.pointerId);
        if (!touch || next.touches.length !== 1) { cancel('multiple-or-missing-touch'); return; }
        move(iconTouchPoint(touch, next));
        // Pequena oscilação durante a espera não deve entregar o gesto ao navegador.
        if (cancelIconDrag === cancel && next.cancelable) next.preventDefault();
      };
      const extraTouch = next => { if (next.touches.length !== 1) cancel('multiple-touch'); };
      const anotherPointer = next => { if (next.pointerId !== event.pointerId) cancel(); };
      const escape = next => { if (next.key === 'Escape') { next.preventDefault(); next.stopImmediatePropagation(); cancel(); } };
      const timer = setTimeout(() => {
        cancel('activated');
        if (!handle.isConnected || !drinkDialog.open || document.hidden || getEditingIconCatalog()) return;
        suppressClick = true;
        input.focus({ preventScroll: true });
        beginIconDrag(wrapper, handle, icon, latest);
      }, 500);
      cancelIconDrag = cancel;
      if (event.isTouch) {
        document.addEventListener('touchmove', touchMove, { capture: true, passive: false });
        document.addEventListener('touchend', cancel);
        document.addEventListener('touchcancel', cancel);
        document.addEventListener('touchstart', extraTouch);
      } else {
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', cancel);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('pointerdown', anotherPointer);
      }
      window.addEventListener('blur', cancel);
      window.addEventListener('keydown', escape, true);
      document.addEventListener('scroll', cancel, true);
      document.addEventListener('visibilitychange', cancel);
    };
    handle.addEventListener('touchstart', event => {
      if (event.touches.length === 1) startPress(iconTouchPoint(event.touches[0], event));
    }, { passive: true });
    handle.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') startPress(event);
    });
  }

  return {
    attachIconGestures,
    cancel: () => cancelIconDrag?.(),
  };
}
