// Agenda e detalhes de eventos; transições são gravadas sob o lock do boot.
const occasionDialog = document.getElementById('occasion-dialog');
const occasionForm = document.getElementById('occasion-form');
const occasionDetailDialog = document.getElementById('occasion-detail-dialog');
let editingOccasionId = null, occasionOriginal = null, occasionSuggestedStart = null;
let agendaTab = null, agendaLimit = 20, detailOccasionId = null;
let reconcilingOccasions = false, occasionRetryAt = 0, agendaStatusKey = "";
const $occasion = id => document.getElementById(id);
function occasionDate(timestamp) { return timestamp == null ? '—' : new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function occasionInput(timestamp) { return toLocalDateInputValue(timestamp) + 'T' + toLocalTimeInputValue(timestamp); }
function occasionError(message) { const node = $occasion('occasion-form-error'); node.textContent = message; node.hidden = !message; }
function commitOccasions(occasions, events = state.events, preferences = state.preferences) {
  const normalized = FunTimeOccasions.normalize({ occasions, events });
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify({ ...buildCurrentAppData(), occasions: normalized, events, preferences }));
  state.occasions = normalized; state.events = events; state.preferences = preferences;
  refreshOccasionFilters(); refreshDataViews();
}
function reconcileOccasions() {
  if (reconcilingOccasions || state.securityLocked || document.body.classList.contains('terms-pending') || document.hidden) return !state.securityLocked;
  if (Date.now() < occasionRetryAt) return false;
  reconcilingOccasions = true;
  try {
    if (!state.preferences.eventsEnabled) {
      if (FunTimeOccasions.active(state.occasions)) {
        const next = FunTimeOccasions.configure(buildCurrentAppData(), false);
        commitOccasions(next.occasions, next.events, next.preferences);
        showToast('Eventos desativados. O evento em andamento foi encerrado; histórico e contagens preservados.');
      }
      refreshOccasionContext(); refreshOccasionReminder(); return true;
    }
    const next = FunTimeOccasions.reconcile(buildCurrentAppData());
    if (next.changes.length) {
      commitOccasions(next.occasions, next.events);
      showToast(next.changes.some(change => change.type === 'ended') ? 'Evento encerrado automaticamente. Confira os detalhes em Eventos.' : 'Agenda atualizada. Confira os eventos.');
    }
    const statusKey = state.occasions.map(item => item.id + ':' + occasionStatus(item)).join('|');
    if (statusKey !== agendaStatusKey) {
      agendaStatusKey = statusKey;
      if (state.currentView === 'occasion') renderOccasions();
      if (occasionDetailDialog.open && !occasionDialog.open && state.occasions.some(item => item.id === detailOccasionId)) openOccasionDetails(detailOccasionId);
    }
    refreshOccasionReminder(); return true;
  } catch {
    occasionRetryAt = Date.now() + 10000;
    showAppNotification('Não foi possível atualizar a agenda. Tente novamente em instantes; os dados foram preservados.', { type: 'error' }); return false;
  } finally { reconcilingOccasions = false; }
}
function openOccasionView() { if (!state.preferences.eventsEnabled) return; reconcileOccasions(); setCurrentView('occasion'); renderOccasions(); window.scrollTo(0, 0); }
function openHomeOccasion() {
  if (!state.preferences.eventsEnabled || !reconcileOccasions()) return;
  const active = FunTimeOccasions.active(state.occasions);
  if (active) openOccasionDetails(active.id);
  else openOccasionView();
}
function closeOccasionEditor() { editingOccasionId = null; occasionOriginal = null; occasionDialog.close(); }
function closeOccasionDetails() { detailOccasionId = null; occasionDetailDialog.close(); }
function editorVisibility() {
  const current = state.occasions.find(item => item.id === editingOccasionId);
  const planned = current ? current.startedAt === null : $occasion('occasion-mode').value === 'scheduled';
  const past = planned && new Date($occasion('occasion-start').value).getTime() < Date.now();
  $occasion('occasion-start').parentElement.hidden = !current && !planned;
  $occasion('occasion-past-notice').hidden = !past;
  $occasion('occasion-end-toggle').querySelector('.setting-toggle-copy').textContent = past ? 'Informar data de término' : 'Encerrar automaticamente em uma data';
  $occasion('occasion-auto-field').hidden = !planned || past;
  $occasion('occasion-end-toggle').hidden = current?.endedAt != null;
  $occasion('occasion-end-field').hidden = !(current?.endedAt != null || $occasion('occasion-has-end').checked);
  $occasion('occasion-submit').textContent = current ? 'Salvar alterações' : past ? 'Cadastrar evento' : planned ? 'Agendar evento' : 'Iniciar evento';
}
function openOccasionEditor(id = null) {
  if (!state.preferences.eventsEnabled) return;
  const current = id ? state.occasions.find(item => item.id === id) : null;
  editingOccasionId = id; occasionOriginal = current ? JSON.stringify(current) : null;
  occasionSuggestedStart = Date.now();
  const planned = current ? current.startedAt === null : Boolean(FunTimeOccasions.active(state.occasions));
  if (planned && !current) occasionSuggestedStart += 3600000;
  occasionForm.reset(); occasionError('');
  $occasion('occasion-form-title').textContent = current ? 'Editar evento' : 'Novo evento';
  $occasion('occasion-mode-field').hidden = Boolean(current);
  $occasion('occasion-mode').value = planned ? 'scheduled' : 'now';
  $occasion('occasion-mode').querySelector('[value="now"]').disabled = Boolean(FunTimeOccasions.active(state.occasions));
  $occasion('occasion-name').value = current?.name || '';
  $occasion('occasion-start').value = occasionInput(current?.startedAt ?? current?.scheduledStartAt ?? occasionSuggestedStart);
  $occasion('occasion-auto').checked = Boolean(current?.autoStart);
  $occasion('occasion-has-end').checked = current?.scheduledEndAt != null;
  $occasion('occasion-end').value = occasionInput(current?.endedAt ?? current?.scheduledEndAt ?? (occasionSuggestedStart + 4 * 3600000));
  for (const id of ['occasion-start', 'occasion-end']) { const input = $occasion(id); initializeDateTimeEditor(input); input._dateTimeEditor.collapse(); }
  editorVisibility(); beginFormDraft(occasionForm); occasionDialog.showModal();
}
$occasion('occasion-mode').addEventListener('change', () => {
  if ($occasion('occasion-mode').value === 'scheduled' && new Date($occasion('occasion-start').value).getTime() <= Date.now()) {
    occasionSuggestedStart = Date.now() + 3600000;
    $occasion('occasion-start').value = occasionInput(occasionSuggestedStart); $occasion('occasion-start')._dateTimeEditor.refresh();
    $occasion('occasion-end').value = occasionInput(occasionSuggestedStart + 4 * 3600000); $occasion('occasion-end')._dateTimeEditor.refresh();
  } else if ($occasion('occasion-mode').value === 'now') {
    occasionSuggestedStart = Date.now(); $occasion('occasion-start').value = occasionInput(occasionSuggestedStart); $occasion('occasion-start')._dateTimeEditor.refresh();
  }
  editorVisibility(); updateFormDraft(occasionForm);
});
$occasion('occasion-has-end').addEventListener('change', editorVisibility);
$occasion('occasion-start').addEventListener('input', editorVisibility);
occasionForm.addEventListener('submit', event => {
  event.preventDefault(); if (state.securityLocked || !occasionDialog.open || !state.preferences.eventsEnabled) return;
  const current = state.occasions.find(item => item.id === editingOccasionId);
  if (editingOccasionId && JSON.stringify(current) !== occasionOriginal) { occasionError('O evento mudou. Feche e abra novamente.'); return; }
  let planned = current ? current.startedAt === null : $occasion('occasion-mode').value === 'scheduled';
  const name = $occasion('occasion-name').value.trim();
  const initialStart = current?.startedAt ?? current?.scheduledStartAt ?? occasionSuggestedStart;
  const readDate = (id, original) => original != null && $occasion(id).value === occasionInput(original) ? original : new Date($occasion(id).value).getTime();
  const start = !current && !planned ? Date.now() : readDate('occasion-start', initialStart);
  const retrospective = planned && start < Date.now() && (!current || start !== current.scheduledStartAt);
  if (retrospective) planned = false;
  const end = current?.endedAt != null || $occasion('occasion-has-end').checked ? readDate('occasion-end', current?.endedAt ?? current?.scheduledEndAt) : null;
  if (!name || !Number.isFinite(start) || (!planned && start > Date.now()) || (end !== null && (!Number.isFinite(end) || end <= start)) || (current?.endedAt != null && end > Date.now())) {
    occasionError('Confira nome e datas. O fim deve ser posterior ao início.'); return;
  }
  const item = { ...current, id: current?.id || createId(), name, startedAt: planned ? null : start, endedAt: current?.endedAt != null ? end : null,
    scheduledStartAt: planned ? start : (current?.scheduledStartAt ?? null), scheduledEndAt: current?.endedAt != null ? (current.scheduledEndAt ?? null) : end,
    autoStart: planned && $occasion('occasion-auto').checked, timeZone: start === initialStart && current?.timeZone ? current.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone };
  if (planned && start !== current?.scheduledStartAt) { item.closedAt = null; item.endReason = null; }
  if (retrospective) {
    item.closedAt = end != null && end <= Date.now() ? Date.now() : null;
    item.endedAt = item.closedAt != null ? end : null;
    item.endReason = item.closedAt != null ? 'manual' : null;
    item.scheduledStartAt = null;
    if (item.endedAt != null) item.scheduledEndAt = null;
  }
  if (!planned && !current && item.endedAt === null && FunTimeOccasions.active(state.occasions)) { occasionError('Já existe um evento em andamento. Informe o término do evento passado ou encerre o atual.'); return; }
  try {
    const periodChanged = current && !planned && (current.startedAt !== item.startedAt || current.endedAt !== item.endedAt);
    const records = !planned && (!current || retrospective || periodChanged) ? FunTimeOccasions.includeUnassigned(state.events, item) : state.events;
    const included = records.filter((record, i) => record !== state.events[i]).length;
    commitOccasions(current ? state.occasions.map(old => old.id === item.id ? item : old) : [...state.occasions, item], records);
    closeOccasionEditor(); if (occasionDetailDialog.open) closeOccasionDetails();
    if (!planned && !current && !retrospective) closeHistoryView(); else { agendaTab = planned ? 'upcoming' : 'past'; openOccasionView(); }
    showToast((current ? 'Evento atualizado.' : retrospective ? 'Evento cadastrado.' : planned ? 'Evento agendado.' : 'Evento iniciado.') + (included ? ' ' + included + ' registro(s) incluído(s).' : ''));
  } catch { occasionError('Não foi possível salvar. Verifique períodos conflitantes, registros fora do período ou tente novamente.'); }
});
async function changeOccasion(id, action) {
  if (!state.preferences.eventsEnabled) return;
  const item = state.occasions.find(occasion => occasion.id === id); if (!item) return;
  const snapshot = JSON.stringify(item);
  const options = {
    end: ['Encerrar evento', 'Encerrar', 'Encerrar ' + item.name + '? Registros e contagens serão preservados.'],
    reopen: ['Reabrir evento', 'Reabrir', 'Reabrir ' + item.name + '? O encerramento programado anterior será desativado.'],
    cancel: ['Cancelar agendamento', 'Cancelar agendamento', 'Cancelar o agendamento de ' + item.name + '?'],
    delete: ['Excluir evento', 'Excluir evento', 'Excluir ' + item.name + '? As doses serão preservadas no histórico, sem evento.'],
  }[action];
  if (action !== 'start' && !(await showAppConfirmation(options[2], { title: options[0], confirmLabel: options[1] }))) return;
  if (state.securityLocked || JSON.stringify(state.occasions.find(occasion => occasion.id === id)) !== snapshot) return;
  try {
    let updated; let records = state.events;
    if (action === 'delete') records = records.map(record => record.occasionId === id ? { ...record, occasionId: null } : record);
    else if (action === 'cancel') updated = { ...item, closedAt: Date.now(), endReason: 'cancelled' };
    else if (action === 'start') {
      if (FunTimeOccasions.active(state.occasions)) throw new Error();
      updated = { ...item, startedAt: Date.now(), closedAt: null, endReason: null };
      if (updated.scheduledEndAt != null && updated.scheduledEndAt <= updated.startedAt) updated.scheduledEndAt = null;
    } else if (action === 'reopen') updated = { ...item, endedAt: null, closedAt: null, endReason: null, scheduledEndAt: null };
    else updated = { ...item, endedAt: records.filter(record => record.occasionId === id).reduce((latest, record) => Math.max(latest, record.consumedAt), Date.now()), closedAt: Date.now(), endReason: 'manual' };
    commitOccasions(action === 'delete' ? state.occasions.filter(occasion => occasion.id !== id) : state.occasions.map(occasion => occasion.id === id ? updated : occasion), records);
    closeOccasionDetails();
    if (action === 'end' || action === 'start') closeHistoryView(); else openOccasionView();
    showToast(action === 'end' ? 'Evento encerrado. Contagens preservadas.' : action === 'start' ? 'Evento iniciado.' : 'Evento atualizado.');
  } catch { showAppNotification('Não foi possível aplicar. Verifique conflitos com outro evento ou tente novamente.', { type: 'error' }); }
}
function occasionButton(label, action, className = 'secondary-button') { const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; button.addEventListener('click', action); return button; }
function openOccasionHistory(id) { closeOccasionDetails(); openHistoryView(); state.historyOccasionId = id; refreshOccasionFilters(); renderHistory(); }
function occasionStatus(item) {
  if (item.startedAt === null) {
    if (item.closedAt != null) return item.endReason === 'cancelled' ? 'Agendamento cancelado' : 'Agendamento expirado';
    if (item.scheduledStartAt <= Date.now()) return item.autoStart ? 'Aguardando revisão' : 'Aguardando início';
    return item.autoStart ? 'Início automático' : 'Início manual';
  }
  return item.endedAt === null ? 'Em andamento' : item.endReason && item.endReason !== 'manual' ? 'Encerrado automaticamente' : 'Encerrado';
}
function occasionRow(item) {
  const button = occasionButton('', () => openOccasionDetails(item.id), 'agenda-row');
  const title = document.createElement('strong'); title.textContent = item.name;
  const sub = document.createElement('span'); sub.textContent = occasionDate(item.startedAt ?? item.scheduledStartAt) + ' · ' + occasionStatus(item);
  const count = document.createElement('small'); const n = state.events.filter(record => record.occasionId === item.id).length; count.textContent = n + (n === 1 ? ' registro' : ' registros') + ' ›';
  button.append(title, sub, count); return button;
}
function openOccasionDetails(id) {
  const item = state.occasions.find(item => item.id === id); if (!item) return;
  detailOccasionId = id; const content = $occasion('occasion-detail-content'); content.replaceChildren();
  const title = document.createElement('h2'); title.textContent = item.name;
  const status = document.createElement('p'); status.className = 'eyebrow'; status.textContent = occasionStatus(item);
  const dates = document.createElement('p'); dates.className = 'occasion-period'; dates.textContent = occasionDate(item.startedAt ?? item.scheduledStartAt) + ' — ' + (item.endedAt != null ? occasionDate(item.endedAt) : item.scheduledEndAt != null ? occasionDate(item.scheduledEndAt) + ' (programado)' : 'Sem fim programado');
  content.append(status, title, dates);
  if (item.startedAt != null && item.scheduledStartAt != null && item.startedAt !== item.scheduledStartAt) { const planned = document.createElement('p'); planned.className = 'settings-description'; planned.textContent = 'Início planejado: ' + occasionDate(item.scheduledStartAt) + '. O período acima mostra o início efetivo.'; content.append(planned); }
  if (FunTimeOccasions.pending(item) && state.occasions.some(other => other.id !== item.id && FunTimeOccasions.pending(other) && other.scheduledStartAt < (item.scheduledEndAt ?? Infinity) && item.scheduledStartAt < (other.scheduledEndAt ?? Infinity))) {
    const warning = document.createElement('p'); warning.className = 'active-warning'; warning.textContent = 'Há outro agendamento nesse período. Apenas um evento poderá ficar em andamento; conflitos exigirão revisão.'; content.append(warning);
  }
  if (item.timeZone && item.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) { const note = document.createElement('p'); note.textContent = 'Agendado no fuso ' + item.timeZone + '. Horários exibidos no fuso atual do aparelho.'; content.append(note); }
  const explanations = { recovery48h: 'Após 48 horas, o evento foi encerrado no término da última contagem. Você pode revisar as datas.', empty48h: 'Encerrado após 48 horas sem registros.', expired: 'O período programado passou sem início. Não foi criado um evento em andamento.', scheduled: 'Encerrado na data programada. Contagens das doses continuam normalmente.' };
  if (explanations[item.endReason]) { const note = document.createElement('p'); note.className = 'settings-description'; note.textContent = explanations[item.endReason] + ' Processado em ' + occasionDate(item.closedAt) + '.'; content.append(note); }
  if (FunTimeOccasions.pending(item) && item.autoStart && item.scheduledStartAt <= Date.now()) { const note = document.createElement('p'); note.className = 'active-warning'; note.textContent = 'O início automático encontrou outro evento no período. Revise as datas ou inicie manualmente.'; content.append(note); }
  const records = state.events.filter(record => record.occasionId === id);
  const summary = document.createElement('p'); summary.textContent = records.length + (records.length === 1 ? ' registro' : ' registros'); content.append(summary);
  const totals = new Map(); records.forEach(record => { const label = getEventDrinkIdentity(record).name; totals.set(label, (totals.get(label) || 0) + 1); });
  for (const [name, count] of totals) { const line = document.createElement('p'); line.className = 'occasion-count'; line.textContent = name + ' · ' + count + ' registro(s)'; content.append(line); }
  const actions = document.createElement('div'); actions.className = 'occasion-actions';
  if (item.startedAt !== null && item.endedAt === null) actions.append(occasionButton('Encerrar evento', () => changeOccasion(id, 'end'), 'primary-button'));
  else if (FunTimeOccasions.pending(item)) actions.append(occasionButton('Iniciar agora', () => changeOccasion(id, 'start'), 'primary-button'));
  if (item.startedAt !== null) actions.append(occasionButton('Ver registros', () => openOccasionHistory(id)));
  content.append(actions);
  const manualStart = FunTimeOccasions.pending(item) && !item.autoStart;
  const more = document.createElement(manualStart ? 'div' : 'details'); more.className = 'agenda-options';
  if (!manualStart) { const caption = document.createElement('summary'); caption.textContent = 'Mais opções'; more.append(caption); }
  more.append(occasionButton(item.startedAt === null && item.closedAt != null ? 'Reagendar' : 'Editar', () => openOccasionEditor(id)));
  if (item.endedAt !== null && !FunTimeOccasions.active(state.occasions)) more.append(occasionButton('Reabrir', () => changeOccasion(id, 'reopen')));
  if (FunTimeOccasions.pending(item)) more.append(occasionButton('Cancelar agendamento', () => changeOccasion(id, 'cancel')));
  more.append(occasionButton('Excluir evento', () => changeOccasion(id, 'delete'), 'delete-event-button')); content.append(more);
  if (!occasionDetailDialog.open) occasionDetailDialog.showModal();
}
function renderOccasions() {
  const current = $occasion('occasion-current'), list = $occasion('occasion-list'); current.replaceChildren(); list.replaceChildren();
  const active = FunTimeOccasions.active(state.occasions); if (active) current.append(occasionRow(active));
  agendaTab ||= state.occasions.some(FunTimeOccasions.pending) ? 'upcoming' : 'past';
  $occasion('agenda-upcoming').setAttribute('aria-pressed', String(agendaTab === 'upcoming')); $occasion('agenda-past').setAttribute('aria-pressed', String(agendaTab === 'past'));
  const search = $occasion('agenda-search').value.trim().toLocaleLowerCase('pt-BR'), month = $occasion('agenda-month').value;
  const items = state.occasions.filter(item => item.id !== active?.id && (agendaTab === 'upcoming' ? FunTimeOccasions.pending(item) : !FunTimeOccasions.pending(item)))
    .filter(item => item.name.toLocaleLowerCase('pt-BR').includes(search) && (!month || toLocalDateInputValue(item.startedAt ?? item.scheduledStartAt).startsWith(month)))
    .sort((a, b) => ((a.startedAt ?? a.scheduledStartAt) - (b.startedAt ?? b.scheduledStartAt)) * (agendaTab === 'upcoming' ? 1 : -1));
  let lastMonth = '';
  for (const item of items.slice(0, agendaLimit)) {
    const date = new Date(item.startedAt ?? item.scheduledStartAt); const key = date.getFullYear() + '-' + date.getMonth();
    if (key !== lastMonth) { const heading = document.createElement('h2'); heading.className = 'agenda-month-heading'; heading.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); list.append(heading); lastMonth = key; }
    list.append(occasionRow(item));
  }
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'agenda-empty'; empty.textContent = search || month ? 'Nenhum evento encontrado.' : agendaTab === 'upcoming' ? 'Nenhum evento agendado. Use + Novo para planejar ou iniciar um.' : 'Seus eventos anteriores aparecerão aqui.'; list.append(empty); }
  $occasion('agenda-more').hidden = items.length <= agendaLimit;
}
function refreshOccasionContext() {
  const enabled = state.preferences.eventsEnabled === true;
  $occasion('events-enabled').checked = enabled;
  $occasion('nav-occasion').hidden = !enabled;
  document.querySelector('.bottom-nav').style.gridTemplateColumns = `repeat(${enabled ? 4 : 3}, minmax(0, 1fr))`;
  $occasion('home-occasion').hidden = !enabled;
  $occasion('home-occasion').classList.toggle('is-active', enabled && !!FunTimeOccasions.active(state.occasions));
  if (!enabled) return;
  const active = FunTimeOccasions.active(state.occasions), button = $occasion('home-occasion');
  const text = active ? '🎉 ' + active.name + ' · Em andamento ›' : 'Sem evento em andamento · Eventos ›'; if (button.textContent !== text) button.textContent = text;
  if (state.currentView === 'occasion') renderOccasions();
}
function refreshOccasionReminder() {
  const box = $occasion('occasion-reminder');
  if (!state.preferences.eventsEnabled) { box.hidden = true; return; }
  const upcoming = [...state.occasions].filter(item => FunTimeOccasions.pending(item) && !item.autoStart && Math.abs(item.scheduledStartAt - Date.now()) <= 3600000).sort((a,b) => a.scheduledStartAt - b.scheduledStartAt)[0];
  const key = upcoming ? upcoming.id + ':' + upcoming.scheduledStartAt : '';
  let dismissed = false; try { dismissed = sessionStorage.getItem('funtime-agenda-dismissed') === key; } catch { dismissed = box.dataset.dismissed === key; }
  if (!upcoming || dismissed || FunTimeOccasions.active(state.occasions)) { box.hidden = true; return; }
  if (box.dataset.key === key && !box.hidden) return;
  box.dataset.key = key; box.replaceChildren(); box.hidden = false;
  const text = document.createElement('p'); text.textContent = upcoming.name + ' · ' + occasionDate(upcoming.scheduledStartAt) + '. Deseja iniciar agora?';
  box.append(text, occasionButton('Iniciar agora', () => changeOccasion(upcoming.id, 'start'), 'primary-button'), occasionButton('Agora não', () => { try { sessionStorage.setItem('funtime-agenda-dismissed', key); } catch {} box.dataset.dismissed = key; box.hidden = true; }));
}
function refreshOccasionFilters() {
  $occasion('history-occasion-filter').parentElement.hidden = !state.preferences.eventsEnabled;
  if (!state.preferences.eventsEnabled) state.historyOccasionId = 'all';
  const select = $occasion('history-occasion-filter'); select.replaceChildren(new Option('Todos os eventos', 'all'), new Option('Sem evento', 'none'));
  for (const item of [...state.occasions].filter(item => item.startedAt !== null).sort((a,b) => b.startedAt-a.startedAt)) select.add(new Option(item.name + ' · ' + toLocalDateInputValue(item.startedAt), item.id));
  if (!['all','none', ...state.occasions.map(item => item.id)].includes(state.historyOccasionId)) state.historyOccasionId = 'all'; select.value = state.historyOccasionId || 'all';
}
function populateRecordOccasions(record) {
  $occasion('record-occasion').parentElement.hidden = !state.preferences.eventsEnabled;
  const select = $occasion('record-occasion'); select.replaceChildren(new Option('Sem evento', ''));
  for (const item of state.occasions.filter(item => item.startedAt !== null)) select.add(new Option(item.name + ' · ' + toLocalDateInputValue(item.startedAt), item.id)); select.value = record.occasionId || '';
}
$occasion('occasion-close').addEventListener('click', closeOccasionEditor); $occasion('occasion-cancel').addEventListener('click', closeOccasionEditor);
$occasion('occasion-detail-close').addEventListener('click', closeOccasionDetails); $occasion('occasion-detail-back').addEventListener('click', closeOccasionDetails);
$occasion('occasion-new').addEventListener('click', () => openOccasionEditor());
$occasion('home-occasion').addEventListener('click', openHomeOccasion); $occasion('nav-occasion').addEventListener('click', openOccasionView); $occasion('nav-home').addEventListener('click', closeHistoryView);
$occasion('history-occasion-filter').addEventListener('change', event => { state.historyOccasionId = event.target.value; renderHistory(); });
for (const [id, tab] of [['agenda-upcoming','upcoming'],['agenda-past','past']]) $occasion(id).addEventListener('click', () => { agendaTab = tab; agendaLimit = 20; renderOccasions(); });
for (const id of ['agenda-search','agenda-month']) $occasion(id).addEventListener('input', () => { agendaLimit = 20; renderOccasions(); });
$occasion('agenda-more').addEventListener('click', () => { agendaLimit += 20; renderOccasions(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcileOccasions(); });
window.addEventListener('focus', reconcileOccasions);
$occasion('events-enabled').addEventListener('change', async event => {
  const input = event.target, enabled = input.checked;
  input.checked = state.preferences.eventsEnabled === true;
  input.disabled = true;
  try {
    if (state.securityLocked) return;
    const current = FunTimeOccasions.active(state.occasions);
    if (!enabled && current && !await showAppConfirmation('“' + current.name + '” será encerrado agora. As contagens continuam e os agendamentos ficam suspensos.', { title: 'Desativar eventos?', confirmLabel: 'Encerrar e desativar' })) return;
    if (state.securityLocked) return;
    const next = FunTimeOccasions.configure(buildCurrentAppData(), enabled);
    commitOccasions(next.occasions, next.events, next.preferences);
    refreshOccasionContext(); refreshOccasionReminder();
    showToast(enabled ? 'Eventos ativados. Agendamentos vencidos aguardam início manual.' : 'Eventos desativados. Histórico e contagens preservados.');
  } catch { showAppNotification('Não foi possível salvar a preferência. Os dados foram preservados.', { type: 'error' }); }
  finally { input.disabled = false; input.checked = state.preferences.eventsEnabled === true; }
});
refreshOccasionContext(); refreshOccasionFilters(); setCurrentView(state.currentView); reconcileOccasions();
