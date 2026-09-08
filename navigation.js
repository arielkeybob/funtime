// Histórico de interface apenas: nunca serializar rascunhos, PINs ou autorizações.
(function () {
  const key = 'funtimeNavigation';
  const previous = history.state?.[key];
  const session = previous?.session || `${Date.now()}-${Math.random()}`;
  let depth = previous?.depth || 0;
  let travelling = false;
  let reloading = false;
  globalThis.FunTimeNavigation = { prepareReload() { reloading = true; } };
  let layers = [];
  let restoreView = previous?.view;
  const dialogs = [];
  const write = (method, value) => history[method]({ ...history.state, [key]: {
    session, depth: value, view: state.currentView,
    filter: state.currentView === 'history' ? state.historyDrinkId : null,
  } }, '');
  write('replaceState', depth);

  const closers = {
    'drink-dialog': () => closeDrinkDialog(),
    'delete-drink-dialog': () => closeDeleteDrinkDialog(),
    'drink-menu-dialog': () => closeDrinkMenuDialog(),
    'interval-warning-dialog': () => closeIntervalWarningDialog(),
    'log-dialog': () => closeLogDialog(),
    'dose-size-dialog': () => closeDoseSizeDialog(),
    'event-dialog': () => closeEventDialog(),
    'drink-import-dialog': () => closeDrinkImportDialog(),
    'backup-restore-dialog': () => closeBackupRestoreDialog(),
    'security-method-dialog': () => closeSecurityMethodDialog(),
    'pin-setup-dialog': () => closePinSetupDialog(),
    'reset-dialog': () => closeDataReset(),
  };
  function readLayers() {
    if (state.securityLocked || document.body.classList.contains('terms-pending')) return [];
    const next = [];
    if (state.currentView !== 'home') next.push({ id: state.currentView, close: () => closeHistoryView() });
    if (state.currentView === 'settings') {
      document.querySelectorAll('#settings-view details[open]').forEach(details => {
        next.push({ id: details.id || 'reset-section', close: () => { details.open = false; } });
      });
    }
    for (const dialog of dialogs.filter(item => item.open)) {
      next.push({ id: dialog.id, close: closers[dialog.id] || (() => dialog.close()) });
      if (dialog.id === 'drink-dialog') {
        if (editingIconCatalog) next.push({ id: 'icon-edit', close: () => iconOptions.querySelector('.icon-edit').click() });
        if (!document.querySelector('#icon-add-panel').hidden) next.push({ id: 'emoji', close: () => document.querySelector('#cancel-add-icon').click() });
      }
      if (dialog.id === 'reset-dialog' && resetPending?.confirmed) next.push({ id: 'reset-auth', close: () => returnToResetPreview() });
    }
    return next;
  }
  function sync() {
    if (travelling || reloading) return;
    if (restoreView && !state.securityLocked && !document.body.classList.contains('terms-pending')) {
      const view = restoreView;
      restoreView = null;
      if (view === 'settings') openSettingsView();
      else if (view === 'history') openHistoryView(previous.filter);
    }
    layers = readLayers();
    if (depth > layers.length) {
      travelling = true;
      history.go(layers.length - depth);
      return;
    }
    while (depth < layers.length) write('pushState', ++depth);
    if (history.state?.[key]?.view !== state.currentView ||
        history.state?.[key]?.filter !== (state.currentView === 'history' ? state.historyDrinkId : null)) write('replaceState', depth);
  }
  window.addEventListener('popstate', event => {
    const entry = event.state?.[key];
    if (!entry || entry.session !== session) return;
    const target = entry.depth;
    if (!travelling) {
      // Usar as rotinas de cancelar invalida prévias e limpa os campos secretos.
      const active = readLayers();
      for (let i = active.length - 1; i >= target; i--) active[i].close();
    }
    depth = target;
    travelling = false;
    // Avançar/refresh não ressuscita formulários nem operações já concluídas.
    sync();
  });
  function back(event) {
    const active = readLayers();
    if (!active.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!travelling) active.at(-1).close();
    sync();
  }
  document.querySelectorAll('dialog').forEach(dialog => {
    if (dialog.open) dialogs.push(dialog);
    const show = dialog.showModal.bind(dialog);
    dialog.showModal = () => {
      if (!dialog.open) {
        const index = dialogs.indexOf(dialog);
        if (index >= 0) dialogs.splice(index, 1);
        dialogs.push(dialog);
      }
      show();
    };
    // Um único consumidor do Voltar: History API; Escape é tratado abaixo.
    dialog.setAttribute('closedby', 'none');
    dialog.addEventListener('cancel', back, true);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') back(event); }, true);
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden', 'class', 'aria-pressed'] });
  sync();
})();
