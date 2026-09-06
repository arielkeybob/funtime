// A autorização é vinculada à prévia e consumida uma única vez.
const resetDialog = document.querySelector('#reset-dialog');
const resetForm = document.querySelector('#reset-form');
let resetPending = null;
let resetBusy = false;

function planDataReset(data, action, options = {}, now = Date.now()) {
  const drinkIds = new Set(options.drinkIds || []);
  const minutes = options.period === 'all' ? null : Number(options.period);
  if (!['icons', 'history', 'drinks', 'all'].includes(action)) throw new Error('Ação inválida.');
  if (action === 'history' && minutes !== null && ![30, 60, 120, 300, 1440, 2880, 10080, 43200].includes(minutes)) throw new Error('Período inválido.');
  const from = minutes === null ? null : now - minutes * 60000;
  const removedDrinks = action === 'all' ? data.drinks : action === 'drinks' ? data.drinks.filter(drink => drinkIds.has(drink.id)) : [];
  const actualIds = new Set(removedDrinks.map(drink => drink.id));
  const removedEvents = data.events.filter(event => action === 'all' ||
    (action === 'drinks' && options.withHistory && actualIds.has(event.drinkId)) ||
    (action === 'history' && (minutes === null || (event.consumedAt >= from && event.consumedAt <= now))));
  return { action, from, until: now, drinkIds: removedDrinks.map(drink => drink.id), eventIds: removedEvents.map(event => event.id) };
}

function applyDataReset(data, plan) {
  const drinkIds = new Set(plan.drinkIds), eventIds = new Set(plan.eventIds);
  return {
    ...data,
    drinks: data.drinks.filter(drink => !drinkIds.has(drink.id)),
    events: data.events.filter(event => !eventIds.has(event.id)),
    preferences: plan.action === 'all' ? { cleanInterface: true, iconCatalog: [...PICKER_ICONS] } :
      plan.action === 'icons' ? { ...data.preferences, iconCatalog: [...PICKER_ICONS] } : { ...data.preferences },
  };
}

function resetError(message) {
  const error = document.querySelector('#reset-error');
  error.textContent = message;
  error.hidden = !message;
}

function updateResetPreview() {
  if (!resetPending || resetPending.confirmed) return;
  const data = buildCurrentAppData();
  const options = {
    period: document.querySelector('#reset-period').value,
    drinkIds: [...document.querySelectorAll('#reset-drinks-list input:checked')].map(input => input.value),
    withHistory: document.querySelector('#reset-drinks-history').checked,
  };
  const plan = planDataReset(data, resetPending.action, options);
  document.querySelector('#reset-selection-count').textContent = `${options.drinkIds.length} de ${data.drinks.length} selecionadas`;
  document.querySelector('#reset-select-all').disabled = options.drinkIds.length === data.drinks.length;
  document.querySelector('#reset-select-none').disabled = options.drinkIds.length === 0;
  resetPending.plan = plan;
  resetPending.snapshot = JSON.stringify(data);
  resetPending.storedSnapshot = localStorage.getItem(DATA_STORAGE_KEY);
  let message;
  if (plan.action === 'icons') message = `O catálogo pessoal será substituído pelos ${PICKER_ICONS.length} ícones padrão desta versão. Os ícones das bebidas e do histórico serão preservados.`;
  if (plan.action === 'drinks') message = `${plan.drinkIds.length} bebida(s) e ${plan.eventIds.length} registro(s) serão apagados.\n${options.withHistory ? 'O histórico das bebidas selecionadas será apagado.' : 'O histórico será preservado com os nomes e ícones registrados.'}`;
  if (plan.action === 'history') message = `${plan.eventIds.length} registro(s) serão apagados. Bebidas e preferências serão preservadas. Os contadores serão recalculados.\n${options.period === 'all' ? 'Todo o histórico, de qualquer data.' : 'De ' + new Date(plan.from).toLocaleString('pt-BR') + ' até ' + new Date(plan.until).toLocaleString('pt-BR') + '.'}`;
  if (plan.action === 'all') message = `${plan.drinkIds.length} bebida(s), ${plan.eventIds.length} registro(s), personalizações, preferências e proteção local serão apagados.\nO app continuará instalado. O aceite atual das políticas será preservado. Backups baixados, outros aparelhos e credenciais mantidas pelo sistema operacional não serão apagados.`;
  document.querySelector('#reset-preview').textContent = message + '\nEsta ação não pode ser desfeita.';
  document.querySelector('#reset-submit').disabled = (plan.action === 'drinks' && !plan.drinkIds.length) || (plan.action === 'history' && !plan.eventIds.length);
}

function openDataReset(action) {
  resetForm.reset();
  document.querySelector('#reset-step').textContent = '1 de 2 · Revisar';
  document.querySelector('#reset-submit').className = 'reset-confirm';
  document.querySelector('#reset-history-option').hidden = action !== 'drinks';
  resetPending = { action, confirmed: false };
  resetBusy = false;
  resetError('');
  document.querySelector('#reset-title').textContent = { icons: 'Restaurar ícones padrão', history: 'Apagar histórico', drinks: 'Apagar bebidas', all: 'EMERGÊNCIA — APAGAR TUDO' }[action];
  document.querySelector('#reset-options').hidden = false;
  document.querySelector('#reset-auth-note').hidden = true;
  document.querySelector('#reset-pin-field').hidden = true;
  document.querySelector('#reset-setup').hidden = true;
  document.querySelector('#reset-submit').textContent = 'Confirmar seleção';
  document.querySelector('#reset-period-field').hidden = action !== 'history';
  document.querySelector('#reset-drinks-field').hidden = action !== 'drinks';
  const list = document.querySelector('#reset-drinks-list');
  list.replaceChildren();
  if (action === 'drinks') state.drinks.forEach(drink => {
    const label = document.createElement('label');
    label.className = 'reset-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.value = drink.id; checkbox.checked = false;
    const text = document.createElement('span'); text.textContent = `${drink.icon} ${drink.name}`;
    label.append(checkbox, text); list.append(label);
  });
  try { updateResetPreview(); } catch (error) { resetPending = null; resetError('Não foi possível preparar a ação. Nenhum dado foi alterado.'); document.querySelector('#reset-submit').disabled = true; }
  resetDialog.showModal();
  requestAnimationFrame(updateResetListHint);
}

function resetAuthorizationIsCurrent(pending) {
  return resetPending === pending && resetDialog.open && !state.securityLocked &&
    JSON.stringify(buildCurrentAppData()) === pending.snapshot &&
    localStorage.getItem(DATA_STORAGE_KEY) === pending.storedSnapshot &&
    JSON.stringify(state.securityConfig) === pending.securitySnapshot &&
    localStorage.getItem(SECURITY_STORAGE_KEY) === pending.storedSecuritySnapshot;
}

async function executeDataReset(pending) {
  if (!resetAuthorizationIsCurrent(pending)) throw new Error('Os dados ou a sessão mudaram. Feche e confirme uma nova prévia.');
  const next = applyDataReset(buildCurrentAppData(), pending.plan);
  // Uma gravação para o estado restaurável, antes de alterar memória ou interface.
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(next));
  pending.applied = true;
  state.drinks = next.drinks; state.events = next.events; state.preferences = next.preferences;
  state.undo = null; hideToast();
  state.pendingBackupRestore = null; state.pendingDrinkImport = null;
  applyInterfacePreferences(); refreshDataViews(); updateDataSettingsUI();
  if (pending.action === 'all') {
    // O estado vazio válido impede ressuscitar dados legados, inclusive se a limpeza falhar.
    localStorage.removeItem(LEGACY_DRINKS_STORAGE_KEY);
    if ('caches' in window) await caches.delete(SHARE_IMPORT_CACHE_NAME);
    sessionStorage.removeItem(SECURITY_SESSION_KEY);
    sessionStorage.removeItem('intervalo-restore-success-v1');
    sessionStorage.removeItem('intervalo-terms-draft-v1');
    // Proteção é removida por último. Não usar clear(): a origem pode hospedar outros apps.
    localStorage.removeItem(SECURITY_STORAGE_KEY);
    state.securityConfig = getDefaultSecurityConfig();
    clearTimeout(state.pinLockoutTimer);
    state.pinFailedAttempts = 0; state.pinLockoutUntil = 0;
    resetPending = null;
    resetDialog.close();
    showAppNotification('Bebidas, histórico, personalizações e proteção local foram apagados.', { title: 'Limpeza concluída', type: 'success', persistent: true, onDismiss: () => window.location.reload() });
    return;
  }
  resetPending = null;
  resetDialog.close();
  const message = pending.action === 'icons' ? 'O catálogo de ícones padrão foi restaurado.' : `${pending.plan.drinkIds.length} bebida(s) e ${pending.plan.eventIds.length} registro(s) apagados.`;
  showAppNotification(message, { title: pending.action === 'icons' ? 'Ícones restaurados' : 'Exclusão concluída', type: 'success', persistent: true });
}

async function submitDataReset(event) {
  event.preventDefault();
  if (!resetPending || resetBusy) return;
  const pending = resetPending;
  resetError('');
  if (!state.securityConfig.enabled || !state.securityConfig.method) {
    resetError('Configure PIN ou autenticação do aparelho em Privacidade antes de executar esta ação.');
    document.querySelector('#reset-setup').hidden = false;
    return;
  }
  if (!pending.confirmed) {
    try {
      pending.securitySnapshot = JSON.stringify(state.securityConfig);
      pending.storedSecuritySnapshot = localStorage.getItem(SECURITY_STORAGE_KEY);
    } catch {
      resetError('Não foi possível acessar a proteção local. Nenhum dado foi alterado.');
      return;
    }
    pending.confirmed = true;
    document.querySelector('#reset-history-option').hidden = true;
    document.querySelector('#reset-step').textContent = '2 de 2 · Autenticar';
    document.querySelector('#reset-submit').className = 'reset-danger';
    document.querySelector('#reset-step').focus();
    document.querySelector('#reset-options').hidden = true;
    document.querySelector('#reset-auth-note').hidden = false;
    document.querySelector('#reset-pin-field').hidden = state.securityConfig.method !== 'pin';
    document.querySelector('#reset-pin').maxLength = getConfiguredPinLength();
    document.querySelector('#reset-submit').textContent = 'Autenticar e executar';
    if (state.securityConfig.method === 'pin') document.querySelector('#reset-pin').focus();
    return;
  }
  resetBusy = true;
  const submit = document.querySelector('#reset-submit'); submit.disabled = true;
  try {
    if (!resetAuthorizationIsCurrent(pending)) throw new Error('Os dados ou a sessão mudaram. Feche e confirme uma nova prévia.');
    let ok;
    if (state.securityConfig.method === 'pin') {
      const remaining = getPinLockoutRemainingMs();
      if (remaining > 0) throw new Error(`Muitas tentativas. Aguarde ${Math.ceil(remaining / 1000)} s.`);
      if (state.pinLockoutUntil) { state.pinFailedAttempts = 0; state.pinLockoutUntil = 0; }
      const input = document.querySelector('#reset-pin');
      const pin = normalizePinInput(input, getConfiguredPinLength());
      input.value = '';
      if (pin.length !== getConfiguredPinLength()) throw new Error(`Digite os ${getConfiguredPinLength()} dígitos do PIN.`);
      ok = await verifyPin(pin);
      if (!ok) {
        state.pinFailedAttempts += 1;
        if (state.pinFailedAttempts >= PIN_LOCKOUT_ATTEMPTS) state.pinLockoutUntil = Date.now() + PIN_LOCKOUT_MS;
        throw new Error(state.pinFailedAttempts >= PIN_LOCKOUT_ATTEMPTS ? 'Muitas tentativas. Aguarde 30 segundos.' : 'PIN incorreto. Nenhum dado foi alterado.');
      }
    } else if (state.securityConfig.method === 'device') ok = await verifyDeviceCredential();
    if (!ok) throw new Error('Autenticação não confirmada. Nenhum dado foi alterado.');
    if (!resetAuthorizationIsCurrent(pending)) throw new Error('A confirmação foi cancelada ou os dados mudaram. Nenhum dado foi alterado.');
    state.pinFailedAttempts = 0; state.pinLockoutUntil = 0;
    await executeDataReset(pending);
  } catch (error) {
    if (resetPending === pending && resetDialog.open) {
      resetError(pending.applied ? 'Os dados principais foram apagados, mas a limpeza complementar não terminou. Feche e repita APAGAR TUDO para concluir.' : error.name === 'NotAllowedError' ? 'Autenticação cancelada. Nenhum dado foi alterado.' : (error.message || 'Não foi possível executar a ação.'));
    }
  } finally {
    resetBusy = false;
    submit.disabled = false;
  }
}

document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => openDataReset(button.dataset.reset)));
resetForm.addEventListener('submit', submitDataReset);
resetForm.addEventListener('change', () => {
  try { updateResetPreview(); } catch { resetPending = null; resetError('Não foi possível preparar a prévia. Feche e tente novamente.'); }
});
function closeDataReset() {
  resetPending = null;
  document.querySelector('#reset-pin').value = '';
  resetDialog.close();
}
document.querySelector('#reset-close').addEventListener('click', closeDataReset);
document.querySelector('#reset-cancel').addEventListener('click', closeDataReset);
resetDialog.addEventListener('cancel', closeDataReset);
resetDialog.addEventListener('close', () => { resetPending = null; document.querySelector('#reset-pin').value = ''; });
document.querySelector('#reset-setup').addEventListener('click', () => { closeDataReset(); openSecurityMethodDialog('enable'); });

function updateResetListHint() {
  const list = document.querySelector('#reset-drinks-list');
  document.querySelector('#reset-list-hint').hidden = list.scrollHeight - list.clientHeight - list.scrollTop < 2;
}
function selectResetDrinks(checked) {
  if (!resetPending || resetPending.confirmed || resetBusy) return;
  document.querySelectorAll('#reset-drinks-list input').forEach(input => { input.checked = checked; });
  try { updateResetPreview(); } catch { resetPending = null; resetError('Não foi possível preparar a prévia. Feche e tente novamente.'); }
}
document.querySelector('#reset-select-all').addEventListener('click', () => selectResetDrinks(true));
document.querySelector('#reset-select-none').addEventListener('click', () => selectResetDrinks(false));
document.querySelector('#reset-drinks-list').addEventListener('scroll', updateResetListHint, { passive: true });
window.addEventListener('resize', updateResetListHint);
