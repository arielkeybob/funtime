// Interface de eventos. Os registros de consumo continuam em state.events.
const occasionDialog = document.getElementById('occasion-dialog');
const occasionForm = document.getElementById('occasion-form');
let editingOccasionId = null;
let occasionOriginal = null;
let occasionSuggestedStart = null;
function occasionDate(timestamp) {
  return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function occasionInput(timestamp) { return toLocalDateInputValue(timestamp) + 'T' + toLocalTimeInputValue(timestamp); }
function occasionError(message) {
  const node = document.getElementById('occasion-form-error'); node.textContent = message; node.hidden = !message;
}
function commitOccasions(occasions, events = state.events) {
  const data = { ...buildCurrentAppData(), occasions, events };
  FunTimeOccasions.normalize(data);
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
  state.occasions = occasions; state.events = events;
  refreshOccasionFilters(); refreshDataViews();
}
function openOccasionView() { setCurrentView('occasion'); renderOccasions(); window.scrollTo(0, 0); }
function closeOccasionEditor() { editingOccasionId = null; occasionOriginal = null; occasionDialog.close(); }
function openOccasionEditor(id = null) {
  const current = id ? state.occasions.find(item => item.id === id) : null;
  if (!id && FunTimeOccasions.active(state.occasions)) { openOccasionView(); return; }
  editingOccasionId = id; occasionOriginal = current ? JSON.stringify(current) : null;
  occasionSuggestedStart = Date.now();
  occasionForm.reset(); occasionError('');
  document.getElementById('occasion-form-title').textContent = current ? 'Editar evento' : 'Iniciar evento';
  document.getElementById('occasion-submit').textContent = current ? 'Salvar alterações' : 'Iniciar evento';
  document.getElementById('occasion-name').value = current?.name || '';
  document.getElementById('occasion-start').value = occasionInput(current?.startedAt ?? occasionSuggestedStart);
  document.getElementById('occasion-end-field').hidden = !current || current.endedAt === null;
  document.getElementById('occasion-end').value = current?.endedAt != null ? occasionInput(current.endedAt) : '';
  for (const id of ['occasion-start', 'occasion-end']) {
    const input = document.getElementById(id); initializeDateTimeEditor(input); input._dateTimeEditor.collapse();
  }
  beginFormDraft(occasionForm); occasionDialog.showModal();
}
occasionForm.addEventListener('submit', event => {
  event.preventDefault();
  if (state.securityLocked || !occasionDialog.open) return;
  const current = state.occasions.find(item => item.id === editingOccasionId);
  if (editingOccasionId && JSON.stringify(current) !== occasionOriginal) { occasionError('O evento mudou. Feche e abra novamente.'); return; }
  const name = document.getElementById('occasion-name').value.trim();
  const startValue = document.getElementById('occasion-start').value;
  const endValue = document.getElementById('occasion-end').value;
  const initialStart = current?.startedAt ?? occasionSuggestedStart;
  const startedAt = startValue === occasionInput(initialStart) ? initialStart : new Date(startValue).getTime();
  const endedAt = current?.endedAt != null ? (endValue === occasionInput(current.endedAt) ? current.endedAt : new Date(endValue).getTime()) : null;
  if (!name || !Number.isFinite(startedAt) || startedAt > Date.now() || (endedAt !== null && (!Number.isFinite(endedAt) || endedAt > Date.now()))) { occasionError('Informe o nome e datas válidas, sem horários futuros.'); return; }
  const item = { id: current?.id || createId(), name, startedAt, endedAt };
  try {
    const periodChanged = current && (current.startedAt !== startedAt || current.endedAt !== endedAt);
    const records = periodChanged ? FunTimeOccasions.includeUnassigned(state.events, item) : state.events;
    const included = records.filter((record, i) => record !== state.events[i]).length;
    commitOccasions(current ? state.occasions.map(old => old.id === item.id ? item : old) : [...state.occasions, item], records);
    closeOccasionEditor();
    if (current) openOccasionView(); else closeHistoryView();
    showToast(current ? 'Evento atualizado.' + (included ? ' ' + included + ' registro(s) incluído(s).' : '') : 'Evento iniciado. Os registros anteriores foram preservados.');
  } catch (error) { occasionError(error.message.includes('incompatíveis') ? 'O período conflita com outro evento ou não contém todos os registros vinculados. Revise as datas.' : 'Não foi possível salvar o evento. Tente novamente.'); }
});
async function changeOccasion(id, action) {
  const item = state.occasions.find(occasion => occasion.id === id); if (!item) return;
  const snapshot = JSON.stringify(item);
  const options = {
    end: ['Encerrar evento', 'Encerrar', 'Encerrar ' + item.name + '? Os registros serão mantidos e contagens em andamento continuam.'],
    reopen: ['Reabrir evento', 'Reabrir', 'Reabrir ' + item.name + '? Ele voltará a receber novas anotações.'],
    delete: ['Excluir evento', 'Excluir evento', 'Excluir ' + item.name + '? As doses serão preservadas no histórico, sem evento.'],
  }[action];
  if (!(await showAppConfirmation(options[2], { title: options[0], confirmLabel: options[1] }))) return;
  if (state.securityLocked || JSON.stringify(state.occasions.find(occasion => occasion.id === id)) !== snapshot) return;
  try {
    let occasions; let records = state.events;
    if (action === 'delete') {
      occasions = state.occasions.filter(occasion => occasion.id !== id);
      records = records.map(record => record.occasionId === id ? { ...record, occasionId: null } : record);
    } else {
      const endedAt = action === 'reopen' ? null : records.filter(record => record.occasionId === id).reduce((latest, record) => Math.max(latest, record.consumedAt), Date.now());
      occasions = state.occasions.map(occasion => occasion.id === id ? { ...occasion, endedAt } : occasion);
    }
    commitOccasions(occasions, records);
    if (action === 'end') closeHistoryView(); else openOccasionView();
    showToast(action === 'end' ? 'Evento encerrado. Histórico e contagens preservados.' : action === 'delete' ? 'Evento excluído. Doses preservadas.' : 'Evento reaberto.');
  } catch { showAppNotification('Não foi possível aplicar. Verifique se há outro evento no período ou tente novamente.', { type: 'error' }); }
}
function occasionButton(label, action, className = 'secondary-button') {
  const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; button.addEventListener('click', action); return button;
}
function openOccasionHistory(id) {
  openHistoryView(); state.historyOccasionId = id; refreshOccasionFilters(); renderHistory();
}
function occasionCard(item, active = false) {
  const card = document.createElement('article'); card.className = 'occasion-card' + (active ? ' is-active' : '');
  const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = active ? 'Em andamento' : 'Encerrado';
  const title = document.createElement('h2'); title.textContent = item.name;
  const period = document.createElement('p'); period.className = 'occasion-period'; period.textContent = occasionDate(item.startedAt) + (item.endedAt !== null ? ' — ' + occasionDate(item.endedAt) : ' · sem encerramento');
  const records = state.events.filter(record => record.occasionId === item.id);
  const count = document.createElement('p'); count.className = 'occasion-count'; count.textContent = records.length + (records.length === 1 ? ' registro' : ' registros') + ' · ' + new Set(records.map(record => record.drinkId)).size + (new Set(records.map(record => record.drinkId)).size === 1 ? ' bebida' : ' bebidas');
  card.append(label, title, period, count);
  if (active && Date.now() - records.reduce((latest, record) => Math.max(latest, record.consumedAt), item.startedAt) >= 12 * 3600000) {
    const reminder = document.createElement('p'); reminder.className = 'active-warning'; reminder.textContent = 'Este evento ainda está em andamento. Você pode continuar ou encerrar. Se esqueceu de encerrar, ajuste o horário em Editar após encerrar.'; card.append(reminder);
  }
  const actions = document.createElement('div'); actions.className = 'occasion-actions';
  actions.append(occasionButton('Ver registros', () => openOccasionHistory(item.id)), occasionButton('Editar', () => openOccasionEditor(item.id)));
  if (active) actions.append(occasionButton('Encerrar evento', () => changeOccasion(item.id, 'end'), 'primary-button'));
  else if (!FunTimeOccasions.active(state.occasions)) actions.append(occasionButton('Reabrir', () => changeOccasion(item.id, 'reopen')));
  actions.append(occasionButton('Excluir evento', () => changeOccasion(item.id, 'delete'), 'delete-event-button'));
  card.append(actions); return card;
}
function renderOccasions() {
  const current = document.getElementById('occasion-current'); const list = document.getElementById('occasion-list');
  current.replaceChildren(); list.replaceChildren();
  const active = FunTimeOccasions.active(state.occasions);
  if (active) current.append(occasionCard(active, true));
  else {
    const card = document.createElement('div'); card.className = 'occasion-card occasion-empty';
    const icon = document.createElement('span'); icon.className = 'occasion-symbol'; icon.textContent = '◇'; icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h2'); title.textContent = 'Uma nova ocasião';
    const copy = document.createElement('p'); copy.textContent = 'Dê um nome ao momento e organize as próximas anotações. Você também pode anotar sem iniciar um evento.';
    card.append(icon, title, copy, occasionButton('Iniciar evento', () => openOccasionEditor(), 'primary-button')); current.append(card);
  }
  for (const item of [...state.occasions].filter(item => item.endedAt !== null).sort((a, b) => b.startedAt - a.startedAt)) list.append(occasionCard(item));
  if (!list.children.length) { const text = document.createElement('p'); text.className = 'settings-description'; text.textContent = 'Os eventos encerrados aparecerão aqui.'; list.append(text); }
}
function refreshOccasionContext() {
  const active = FunTimeOccasions.active(state.occasions);
  const button = document.getElementById('home-occasion');
  const text = active ? active.name + ' · Em andamento ›' : 'Sem evento em andamento · Iniciar ›';
  if (button.textContent !== text) button.textContent = text;
  if (state.currentView === 'occasion') renderOccasions();
}
function refreshOccasionFilters() {
  const select = document.getElementById('history-occasion-filter');
  select.replaceChildren(new Option('Todos os eventos', 'all'), new Option('Sem evento', 'none'));
  for (const item of [...state.occasions].sort((a, b) => b.startedAt - a.startedAt)) select.add(new Option(item.name + ' · ' + toLocalDateInputValue(item.startedAt), item.id));
  if (!['all', 'none', ...state.occasions.map(item => item.id)].includes(state.historyOccasionId)) state.historyOccasionId = 'all';
  select.value = state.historyOccasionId || 'all';
}
function populateRecordOccasions(record) {
  const select = document.getElementById('record-occasion'); select.replaceChildren(new Option('Sem evento', ''));
  for (const item of state.occasions) select.add(new Option(item.name + ' · ' + toLocalDateInputValue(item.startedAt), item.id));
  select.value = record.occasionId || '';
}
document.getElementById('occasion-close').addEventListener('click', closeOccasionEditor);
document.getElementById('occasion-cancel').addEventListener('click', closeOccasionEditor);
document.getElementById('home-occasion').addEventListener('click', openOccasionView);
document.getElementById('nav-occasion').addEventListener('click', openOccasionView);
document.getElementById('nav-home').addEventListener('click', closeHistoryView);
document.getElementById('history-occasion-filter').addEventListener('change', event => { state.historyOccasionId = event.target.value; renderHistory(); });
refreshOccasionContext(); refreshOccasionFilters(); setCurrentView(state.currentView);
