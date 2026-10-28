// Agenda e detalhes de eventos; transições são gravadas sob o lock do boot.
const occasionDialog = document.getElementById('occasion-dialog');
const occasionForm = document.getElementById('occasion-form');
const occasionDetailDialog = document.getElementById('occasion-detail-dialog');
let editingOccasionId = null, occasionOriginal = null, occasionSuggestedStart = null, occasionShareSelected = new Set();
// Convidados escolhidos no formulário (aplicados ao salvar) e os que já constavam, para só
// mexer na nuvem se a lista mudou (spec 0025).
let occasionInviteSelected = new Set(), occasionInviteInitial = new Set();
let agendaTab = null, agendaLimit = 20, detailOccasionId = null;
let reconcilingOccasions = false, occasionRetryAt = 0, agendaStatusKey = "";
const $occasion = id => document.getElementById(id);
function occasionDate(timestamp) { return timestamp == null ? '—' : new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function occasionInput(timestamp) { return toLocalDateInputValue(timestamp) + 'T' + toLocalTimeInputValue(timestamp); }
function occasionError(message) { const node = $occasion('occasion-form-error'); node.textContent = message; node.hidden = !message; }
function commitOccasions(occasions, events = state.events, preferences = state.preferences) {
  const normalized = FunTimeOccasions.normalize({ occasions, events });
  const previous = buildCurrentAppData();
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify({ ...previous, occasions: normalized, events, preferences }));
  state.occasions = normalized; state.events = events; state.preferences = preferences;
  globalThis.syncSecurityEventUnlock?.();
  globalThis.notifyLocalDataChanged?.(previous);
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
// A busca só aparece com muitos eventos; com poucos, a lista inteira já cabe na tela.
const AGENDA_SEARCH_MIN = 8;
function openOccasionView({ keepTab = false } = {}) {
  if (!state.preferences.eventsEnabled) return;
  reconcileOccasions();
  // Cada abertura começa limpa: uma busca esquecida não pode continuar filtrando a lista sem ninguém ver.
  $occasion('agenda-search').value = ''; agendaLimit = 20;
  // Com convite esperando resposta, a tela abre em Próximos, que é onde ele está.
  if (!keepTab && (globalThis.pendingInviteCount?.() || 0) > 0) agendaTab = 'upcoming';
  setCurrentView('occasion'); renderOccasions(); window.scrollTo(0, 0);
}
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
  // Convidados e "compartilhar doses" ficam atrás de uma linha clicável, só para quem tem
  // amigos. Quem foi convidado não convida ninguém. Compartilhar doses de um evento que já
  // começou é ao vivo e mora no detalhe do evento, não no formulário.
  const guest = Boolean(current?.sharedHostUid && current.sharedHostUid !== globalThis.currentSharedEventsUid?.());
  $occasion('occasion-people-field').hidden = !globalThis.hasSharingFriends?.();
  // Evento que já acabou não recebe convidados (a nuvem recusaria); o detalhe também não mostra a linha.
  $occasion('occasion-invite-row').hidden = guest || current?.endedAt != null;
  $occasion('occasion-share-row').hidden = Boolean(current && current.startedAt !== null);
  updatePeopleRows();
  $occasion('occasion-past-notice').hidden = !past;
  $occasion('occasion-unlock-field').hidden = !state.securityConfig.enabled || planned || current?.endedAt != null;
  $occasion('occasion-end-toggle').querySelector('.setting-toggle-copy').textContent = past ? 'Informar data de término' : 'Encerrar automaticamente em uma data';
  $occasion('occasion-auto-field').hidden = !planned || past;
  $occasion('occasion-end-toggle').hidden = current?.endedAt != null;
  $occasion('occasion-end-field').hidden = !(current?.endedAt != null || $occasion('occasion-has-end').checked);
  $occasion('occasion-submit').textContent = current ? 'Salvar alterações' : past ? 'Cadastrar evento' : planned ? 'Agendar evento' : 'Iniciar evento';
}
function openOccasionEditor(id = null, shareWith = []) {
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
  $occasion('occasion-unlock').checked = Boolean(current && globalThis.isSecurityEventUnlockActive?.(current.id));
  $occasion('occasion-start').value = occasionInput(current?.startedAt ?? current?.scheduledStartAt ?? occasionSuggestedStart);
  $occasion('occasion-auto').checked = Boolean(current?.autoStart);
  $occasion('occasion-has-end').checked = current?.scheduledEndAt != null;
  $occasion('occasion-end').value = occasionInput(current?.endedAt ?? current?.scheduledEndAt ?? (occasionSuggestedStart + 4 * 3600000));
  for (const id of ['occasion-start', 'occasion-end']) { const input = $occasion(id); initializeDateTimeEditor(input); input._dateTimeEditor.collapse(); }
  occasionShareSelected = new Set(current ? (current.shareWith || []) : shareWith);
  const known = current ? globalThis.getSharedEventInfo?.(current) : null;
  occasionInviteSelected = new Set(known?.roster && !known.gone ? known.roster.invited : []);
  occasionInviteInitial = new Set(occasionInviteSelected);
  editorVisibility(); beginFormDraft(occasionForm); occasionDialog.showModal();
}
function peopleSummary(count) { return (count ? count + (count === 1 ? ' pessoa' : ' pessoas') : 'Ninguém') + ' ›'; }
function updatePeopleRows() {
  $occasion('occasion-invite-summary').textContent = peopleSummary(occasionInviteSelected.size);
  $occasion('occasion-share-summary').textContent = peopleSummary(occasionShareSelected.size);
  // Os escolhidos também vão para campos ocultos: é o que faz o rascunho do formulário perceber
  // a mudança e mostrar o "Salvar alterações" quando só os convidados ou o compartilhamento mudaram.
  $occasion('occasion-invite-draft').value = [...occasionInviteSelected].sort().join(',');
  $occasion('occasion-share-draft').value = [...occasionShareSelected].sort().join(',');
}
function editorOccasionIsPlanned() {
  const current = state.occasions.find(item => item.id === editingOccasionId);
  return current ? current.startedAt === null : $occasion('occasion-mode').value === 'scheduled';
}
$occasion('occasion-invite-row').addEventListener('click', () => {
  const current = state.occasions.find(item => item.id === editingOccasionId) || null;
  globalThis.openInviteDialog?.({ occasion: current, selected: occasionInviteSelected, onConfirm: chosen => { occasionInviteSelected = chosen; updatePeopleRows(); updateFormDraft(occasionForm); } });
});
$occasion('occasion-share-row').addEventListener('click', () => {
  const current = state.occasions.find(item => item.id === editingOccasionId) || null;
  globalThis.openShareOccasionDialog?.(current, [], { planned: editorOccasionIsPlanned(), stage: { selected: occasionShareSelected, onConfirm: chosen => { occasionShareSelected = chosen; updatePeopleRows(); updateFormDraft(occasionForm); } } });
});
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
  // Evento que ainda não começou: com quem compartilhar as doses vira uma INTENÇÃO guardada
  // na ocasião — nada sai do aparelho até o evento começar (spec 0025).
  if (planned) { if (occasionShareSelected.size) item.shareWith = [...occasionShareSelected]; else delete item.shareWith; }
  if (!planned && !current && item.endedAt === null && FunTimeOccasions.active(state.occasions)) { occasionError('Já existe um evento em andamento. Informe o término do evento passado ou encerre o atual.'); return; }
  try {
    const periodChanged = current && !planned && (current.startedAt !== item.startedAt || current.endedAt !== item.endedAt);
    const records = !planned && (!current || retrospective || periodChanged) ? FunTimeOccasions.includeUnassigned(state.events, item) : state.events;
    const included = records.filter((record, i) => record !== state.events[i]).length;
    commitOccasions(current ? state.occasions.map(old => old.id === item.id ? item : old) : [...state.occasions, item], records);
    if (!current && !planned && occasionShareSelected.size) {
      globalThis.startOccasionShares?.(item, records.filter(record => record.occasionId === item.id), [...occasionShareSelected]);
    }
    const sameInvites = occasionInviteSelected.size === occasionInviteInitial.size && [...occasionInviteSelected].every(uid => occasionInviteInitial.has(uid));
    if (!sameInvites) globalThis.applyOccasionInvites?.(item.id, [...occasionInviteSelected]).catch(error => { console.error('Falha ao atualizar convidados.', error); showToast('Não foi possível atualizar os convidados agora. Abra o evento para tentar de novo.'); });
    const wantsEventUnlock = !planned && item.endedAt === null && $occasion('occasion-unlock').checked;
    const hadEventUnlock = state.securityConfig.eventUnlockOccasionId === item.id;
    const unlockSaved = wantsEventUnlock === hadEventUnlock || globalThis.setSecurityEventUnlock?.(item.id, wantsEventUnlock) === true;
    closeOccasionEditor(); if (occasionDetailDialog.open) closeOccasionDetails();
    if (!planned && !current && !retrospective) closeHistoryView(); else { agendaTab = planned ? 'upcoming' : 'past'; openOccasionView({ keepTab: true }); }
    if (unlockSaved) showToast((current ? 'Evento atualizado.' : retrospective ? 'Evento cadastrado.' : planned ? 'Evento agendado.' : 'Evento iniciado.') + (included ? ' ' + included + ' registro(s) incluído(s).' : ''));
  } catch { occasionError('Não foi possível salvar. Verifique períodos conflitantes, registros fora do período ou tente novamente.'); }
});
async function changeOccasion(id, action) {
  if (!state.preferences.eventsEnabled) return;
  const item = state.occasions.find(occasion => occasion.id === id); if (!item) return;
  const snapshot = JSON.stringify(item);
  const options = {
    end: ['O evento acabou?', 'Sim, acabou', item.name + ' termina agora. Registros e contagens são preservados.'],
    reopen: ['Reabrir evento', 'Reabrir', 'Reabrir ' + item.name + '? O encerramento programado anterior será desativado.'],
    cancel: ['Cancelar agendamento', 'Cancelar agendamento', 'Cancelar o agendamento de ' + item.name + '?'],
    delete: ['Excluir evento', 'Excluir evento', 'Excluir ' + item.name + '? As doses serão preservadas no histórico, sem evento.'],
  }[action];
  if (action !== 'start' && !(await showAppConfirmation(options[2], { title: options[0], confirmLabel: options[1] }))) return;
  if (state.securityLocked || JSON.stringify(state.occasions.find(occasion => occasion.id === id)) !== snapshot) return;
  try {
    // Tirar o evento da agenda também desfaz o vínculo na nuvem: quem organiza cancela o
    // convite de todos (soft, para não derrubar a escuta deles); quem foi convidado retira a
    // própria presença. Sem esperar: offline a escrita só é confirmada depois, e a ação local
    // não pode ficar presa à rede.
    if (action === 'delete' || action === 'cancel') globalThis.releaseSharedEvent?.(item);
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
// Ícones do módulo Eventos (SVG 24px, traço 1.8, como os da barra de baixo). Ficam aqui até o
// rodapé com ícones valer também para o resto do app (spec 0028).
const OCCASION_ICONS = {
  edit: '<path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z"/><path d="m13.5 7.5 3 3"/>',
  delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  people: '<path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 8a2.5 2.5 0 1 0 0-5"/><path d="M15 14.2c2.3.4 4 2.4 4 5.8"/>',
  share: '<path d="M7 17 17 7M9 7h8v8"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
  leave: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4M19 12H9"/>',
  cancel: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M10 14l4 4m0-4-4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  auto: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  start: '<path d="M7 4.5v15l12.5-7.5z"/>',
  end: '<rect x="5" y="5" width="14" height="14" rx="3"/>',
};
// "Deixar de participar" (convidado sai da lista do amigo e mantém o evento na agenda) fica
// desligado por enquanto: o conceito ainda confunde. Quem não vai mais tem Cancelar agendamento
// e Excluir evento, que também retiram a presença. Para liberar, trocar para true (spec 0028).
const OCCASION_LEAVE_ENABLED = false;
function occasionIcon(name, className = 'occasion-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', className);
  svg.innerHTML = OCCASION_ICONS[name]; return svg;
}
function occasionIconButton(icon, label, action, className = '') {
  const button = occasionButton('', action, ('icon-button secondary occasion-icon-action ' + className).trim());
  button.setAttribute('aria-label', label); button.title = label; button.append(occasionIcon(icon)); return button;
}
function occasionPeopleRow(title, summary, action, icon) {
  const row = occasionButton('', action, 'occasion-menu-row occasion-people-row');
  const tile = document.createElement('span'); tile.className = 'occasion-menu-icon'; tile.append(occasionIcon(icon));
  const name = document.createElement('strong'); name.textContent = title;
  const info = document.createElement('small'); info.textContent = (summary ? summary + ' ' : '') + '›';
  row.append(tile, name, info); return row;
}
// Quem aceita um convite ganha uma ocasião normal, só dele, com o vínculo ao evento do organizador.
// Começa como agendamento de início manual — o padrão de qualquer agendamento; o início
// automático e o "manter desbloqueado" se ajustam depois, no próprio evento.
function createOccasionFromInvite(event) {
  let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try { if (event.timeZone) { new Intl.DateTimeFormat('pt-BR', { timeZone: event.timeZone }).format(); timeZone = event.timeZone; } } catch { /* fuso desconhecido: usa o do aparelho */ }
  const item = {
    id: createId(), name: (event.name || 'Evento').trim().slice(0, 80) || 'Evento', startedAt: null, endedAt: null,
    scheduledStartAt: event.startAt, scheduledEndAt: event.endAt != null && event.endAt > event.startAt ? event.endAt : null,
    autoStart: false, timeZone, sharedEventId: event.eventId, sharedHostUid: event.hostUid,
    sharedFichaKey: globalThis.sharedFichaKeyOf?.(event),
  };
  commitOccasions([...state.occasions, item]);
  return state.occasions.find(occasion => occasion.id === item.id);
}
// Chegou dado novo do evento (alguém confirmou, o organizador mudou): redesenha o que está aberto.
function refreshSharedEventViews() {
  if (occasionDetailDialog.open && !occasionDialog.open && state.occasions.some(item => item.id === detailOccasionId)) openOccasionDetails(detailOccasionId);
  if (state.currentView === 'occasion') renderOccasions();
}
function openOccasionHistory(id) { const item = state.occasions.find(occasion => occasion.id === id); closeOccasionDetails(); openHistoryView(); state.historyOccasionId = id; globalThis.setHistoryReturnOccasion(item); refreshOccasionFilters(); renderHistory(); }
function occasionStatus(item) {
  if (item.startedAt === null) {
    if (item.closedAt != null) return item.endReason === 'cancelled' ? 'Agendamento cancelado' : 'Agendamento expirado';
    if (item.scheduledStartAt <= Date.now()) return item.autoStart ? 'Precisa de revisão' : 'Aguardando início';
    return item.autoStart ? 'Inicia sozinho' : 'Agendado';
  }
  return item.endedAt === null ? 'Em andamento' : item.endReason && item.endReason !== 'manual' ? 'Encerrado automaticamente' : 'Encerrado';
}
// O que a linha da agenda diz sobre a situação: só o que agrega. "Agendado" é o que a aba Próximos
// já diz e "Encerrado" é o que a aba Passados já diz, então ficam de fora; o detalhe mantém o selo completo.
// Agendamento que passou do horário continua em Próximos, só com o aviso "Aguardando início".
function occasionRowStatus(item) {
  if (item.startedAt === null) {
    if (item.closedAt != null) return item.endReason === 'cancelled' ? 'Cancelado' : 'Expirado';
    if (item.autoStart) return item.scheduledStartAt <= Date.now() ? 'Precisa de revisão' : 'Inicia sozinho';
    return item.scheduledStartAt <= Date.now() ? 'Aguardando início' : '';
  }
  if (item.endedAt === null) return 'Em andamento';
  return item.endReason && item.endReason !== 'manual' ? 'Automático' : '';
}
// Selo da situação, na lista e no detalhe: a cor acompanha o texto, nunca o substitui.
function occasionTone(item) {
  if (item.startedAt === null) {
    if (item.closedAt != null) return item.endReason === 'cancelled' ? 'cancelled' : 'done';
    return item.scheduledStartAt <= Date.now() ? 'waiting' : 'planned';
  }
  return item.endedAt === null ? 'live' : 'done';
}
function occasionIsAuto(item) {
  return item.startedAt === null ? Boolean(item.autoStart) && item.closedAt == null : item.endedAt !== null && Boolean(item.endReason) && item.endReason !== 'manual';
}
function fillStatusChip(chip, item, text, small = false) {
  const tone = occasionTone(item);
  chip.className = 'status-chip is-' + tone + (small ? ' is-small' : ''); chip.replaceChildren();
  if (tone === 'live') { const pulse = document.createElement('i'); pulse.className = 'status-chip-pulse'; chip.append(pulse); }
  else if (occasionIsAuto(item)) chip.append(occasionIcon('auto'));
  chip.append(text); return chip;
}
const agendaParts = timestamp => globalThis.agendaDateParts(timestamp);
// Um horário de início (▶ verde) ou fim (■ vermelho); vazado quando ainda não aconteceu. A data
// completa vai num texto só para leitores de tela quando a linha mostra apenas a hora.
function occasionTime(kind, planned, visible, spoken) {
  const node = document.createElement('span'); node.className = 'agenda-time is-' + kind + (planned ? ' is-planned' : '');
  const label = document.createElement('span'); label.className = 'visually-hidden';
  label.textContent = (kind === 'start' ? 'Início' : 'Fim') + (planned ? ' programado' : '') + (spoken ? ' ' + spoken + ' ·' : '');
  node.append(occasionIcon(kind, 'occasion-marker'), label, visible); return node;
}
// Início e fim de um evento numa linha. O fim mostra só a hora no mesmo dia, "+1" no dia
// seguinte e a data quando passa disso.
function occasionTimes(item, { withDate = false } = {}) {
  const box = document.createElement('span'); box.className = 'agenda-times';
  const start = item.startedAt ?? item.scheduledStartAt, end = item.endedAt ?? item.scheduledEndAt ?? null;
  const s = agendaParts(start);
  box.append(withDate ? occasionTime('start', item.startedAt === null, s.weekday + ' ' + s.date + ' · ' + s.time) : occasionTime('start', item.startedAt === null, s.time, s.weekday + ' ' + s.date));
  if (end != null) {
    const days = globalThis.calendarDaysBetween(start, end), e = agendaParts(end);
    const node = days > 1 ? occasionTime('end', item.endedAt == null, e.weekday + ' ' + e.date + ' · ' + e.time) : occasionTime('end', item.endedAt == null, e.time, days === 1 ? e.weekday + ' ' + e.date : '');
    if (days === 1) { const next = document.createElement('sup'); next.className = 'agenda-next-day'; next.setAttribute('aria-hidden', 'true'); next.textContent = '+1'; node.append(next); }
    box.append(node);
  }
  return box;
}
// Terceira linha, só quando há o que dizer: de quem é o convite, quantos foram convidados/vão e os registros.
function occasionMeta(item) {
  const parts = []; const shared = globalThis.getSharedEventInfo?.(item);
  if (shared) {
    if (shared.isHost) {
      if (shared.invitedCount) parts.push(shared.invitedCount + (shared.invitedCount === 1 ? ' convidado' : ' convidados') + (shared.goingCount ? ' · ' + shared.goingCount + (shared.goingCount === 1 ? ' vai' : ' vão') : ''));
    } else parts.push(shared.hostAlias ? 'de ' + shared.hostAlias : 'convite aceito');
    if (shared.cancelled) parts.push('cancelado pelo organizador');
  }
  const n = state.events.filter(record => record.occasionId === item.id).length;
  if (n) parts.push(n + (n === 1 ? ' registro' : ' registros'));
  return parts.join(' · ');
}
// Linha da agenda: bloquinho com o dia à esquerda, nome, início/fim e, se houver, selo e meta.
function occasionRow(item) {
  const button = occasionButton('', () => openOccasionDetails(item.id), 'agenda-row agenda-row--dated');
  const start = agendaParts(item.startedAt ?? item.scheduledStartAt);
  const tile = document.createElement('span'); tile.className = 'agenda-date'; tile.setAttribute('aria-hidden', 'true');
  const weekday = document.createElement('small'); weekday.textContent = start.weekday;
  const day = document.createElement('b'); day.textContent = start.day;
  tile.append(weekday, day);
  const body = document.createElement('span'); body.className = 'agenda-row-body';
  const title = document.createElement('strong'); title.textContent = item.name;
  body.append(title, occasionTimes(item));
  const status = occasionRowStatus(item), meta = occasionMeta(item);
  if (status || meta) {
    const line = document.createElement('span'); line.className = 'agenda-row-meta';
    if (status) line.append(fillStatusChip(document.createElement('span'), item, status, true));
    if (meta) { const small = document.createElement('small'); small.textContent = meta; line.append(small); }
    body.append(line);
  }
  const chevron = document.createElement('span'); chevron.className = 'agenda-row-chevron'; chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '›';
  button.append(tile, body, chevron);
  return button;
}
// O evento em andamento vira um cartão em destaque no topo, com o mesmo brilho da Home.
function occasionCurrentCard(item) {
  const button = occasionButton('', () => openOccasionDetails(item.id), 'agenda-row occasion-current-card');
  const label = document.createElement('span'); label.className = 'agenda-row-label';
  const pulse = document.createElement('i'); pulse.className = 'status-chip-pulse'; label.append(pulse, 'Em andamento');
  const title = document.createElement('strong'); title.textContent = item.name;
  button.append(label, title, occasionTimes(item, { withDate: true }));
  const meta = occasionMeta(item);
  if (meta) { const small = document.createElement('small'); small.textContent = meta; button.append(small); }
  return button;
}
// Linha do tempo do detalhe: início em cima, fim embaixo e a duração no meio. Só o período
// efetivo; o que ainda não aconteceu (agendado, fim programado) aparece vazado.
function occasionTimelinePoint(kind, timestamp, planned) {
  const point = document.createElement('div'); point.className = 'occasion-timeline-point is-' + kind + (planned || timestamp == null ? ' is-planned' : '');
  const dot = document.createElement('i'); const time = document.createElement('b'); const date = document.createElement('span'); const label = document.createElement('em');
  if (timestamp == null) { time.textContent = '—'; date.textContent = 'sem fim definido'; }
  else { const parts = agendaParts(timestamp); time.textContent = parts.time; date.textContent = parts.weekday + ' ' + parts.date; }
  label.textContent = (kind === 'start' ? 'Início' : 'Fim') + (planned && timestamp != null ? ' programado' : '');
  point.append(dot, time, date, label); return point;
}
function occasionTimeline(item) {
  const start = item.startedAt ?? item.scheduledStartAt, end = item.endedAt ?? item.scheduledEndAt ?? null;
  const startPlanned = item.startedAt === null, endPlanned = item.endedAt == null;
  const box = document.createElement('div'); box.className = 'occasion-timeline';
  // Agendamento cancelado ou expirado sem fim: só o horário que estava marcado.
  if (end == null && startPlanned && item.closedAt != null) { box.append(occasionTimelinePoint('start', start, true)); return box; }
  const span = document.createElement('div'); span.className = 'occasion-timeline-span' + (endPlanned ? ' is-planned' : '');
  span.append(document.createElement('i'));
  if (end != null) {
    const duration = document.createElement('span');
    duration.append(occasionIcon('clock'), (startPlanned || endPlanned ? 'previsto ' : '') + globalThis.formatEventDuration(end - start));
    span.append(duration);
  }
  box.append(occasionTimelinePoint('start', start, startPlanned), span, occasionTimelinePoint('end', end, endPlanned));
  return box;
}
function occasionWarning(text) { const note = document.createElement('p'); note.className = 'active-warning'; note.textContent = text; return note; }
function openOccasionDetails(id) {
  const item = state.occasions.find(item => item.id === id); if (!item) return;
  detailOccasionId = id; const content = $occasion('occasion-detail-content'); content.replaceChildren();
  const shared = globalThis.getSharedEventInfo?.(item);
  $occasion('occasion-detail-name').textContent = item.name;
  fillStatusChip($occasion('occasion-detail-status'), item, occasionStatus(item));
  const host = $occasion('occasion-detail-host'); host.textContent = shared && !shared.isHost && shared.hostAlias ? 'de ' + shared.hostAlias : ''; host.hidden = !host.textContent;
  // O organizador pode mudar ou cancelar o evento depois de você aceitar: nada é alterado em
  // silêncio, porque o início automático poderia disparar na hora errada.
  if (shared?.cancelled) content.append(occasionWarning('O organizador cancelou este evento. Ele continua na sua agenda; cancele o agendamento se você não vai mais.'));
  else if (shared?.gone) content.append(occasionWarning('Você não está mais na lista de convidados deste evento.'));
  if (shared?.updateAvailable) {
    const box = document.createElement('div'); box.className = 'occasion-update-notice';
    box.append(occasionWarning('O organizador mudou o evento: ' + shared.view.name + ' · ' + occasionDate(shared.view.startAt) + '.'));
    const row = document.createElement('div'); row.className = 'occasion-actions';
    row.append(occasionButton('Atualizar', () => { try { globalThis.applySharedEventUpdate?.(id); } catch { showAppNotification('Não foi possível atualizar. O evento foi mantido como estava.', { type: 'error' }); } }, 'primary-button'), occasionButton('Manter o meu', () => globalThis.applySharedEventUpdate?.(id, { keep: true })));
    box.append(row); content.append(box);
  }
  content.append(occasionTimeline(item));
  if (FunTimeOccasions.pending(item) && state.occasions.some(other => other.id !== item.id && FunTimeOccasions.pending(other) && other.scheduledStartAt < (item.scheduledEndAt ?? Infinity) && item.scheduledStartAt < (other.scheduledEndAt ?? Infinity))) {
    content.append(occasionWarning('Há outro agendamento nesse período. Apenas um evento poderá ficar em andamento; conflitos exigirão revisão.'));
  }
  if (FunTimeOccasions.pending(item) && item.autoStart && item.scheduledStartAt <= Date.now()) content.append(occasionWarning('O início automático encontrou outro evento no período. Revise as datas ou inicie manualmente.'));
  if (item.timeZone && item.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) { const note = document.createElement('p'); note.className = 'settings-description'; note.textContent = 'Agendado no fuso ' + item.timeZone + '. Horários exibidos no fuso atual do aparelho.'; content.append(note); }
  // Como o evento foi encerrado sozinho fica para a interface detalhada; o selo já diz "automaticamente".
  const explanations = { recovery48h: 'Após 48 horas, o evento foi encerrado no término da última contagem. Você pode revisar as datas.', empty48h: 'Encerrado após 48 horas sem registros.', expired: 'O período programado passou sem início. Não foi criado um evento em andamento.', scheduled: 'Encerrado na data programada. Contagens das doses continuam normalmente.' };
  if (explanations[item.endReason]) { const note = document.createElement('p'); note.className = 'settings-description clean-optional'; note.textContent = explanations[item.endReason] + ' Processado em ' + occasionDate(item.closedAt) + '.'; content.append(note); }
  // Registros: um cartão que leva ao Histórico filtrado, com a contagem por bebida.
  const records = state.events.filter(record => record.occasionId === id);
  if (item.startedAt !== null) {
    const { count, totals } = globalThis.summarizeOccasionDoses(records, getEventDrinkIdentity);
    const card = count ? occasionButton('', () => openOccasionHistory(id), 'occasion-records') : document.createElement('div');
    if (!count) card.className = 'occasion-records is-empty';
    const head = document.createElement('span'); head.className = 'occasion-records-head'; head.id = 'occasion-records-summary';
    const number = document.createElement('b'); number.textContent = count;
    const label = document.createElement('span'); label.textContent = count === 1 ? 'registro' : 'registros';
    head.append(number, label); card.append(head);
    if (count) {
      card.setAttribute('aria-label', 'Ver registros'); card.setAttribute('aria-describedby', head.id);
      const chevron = document.createElement('span'); chevron.className = 'agenda-row-chevron'; chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '›'; head.append(chevron);
      const drinks = document.createElement('span'); drinks.className = 'occasion-records-drinks';
      for (const entry of totals) { const pill = document.createElement('span'); const n = document.createElement('b'); n.textContent = entry.count; pill.append((entry.icon ? entry.icon + ' ' : '') + entry.name + ' ', n); drinks.append(pill); }
      card.append(drinks);
    }
    content.append(card);
  }
  // Convidados, compartilhar doses e o desbloqueio: um bloco só, como o menu de Configurações.
  // Pessoas só para quem tem amigos e enquanto o evento não acabou; cada linha abre a própria tela.
  const menu = document.createElement('div'); menu.className = 'occasion-menu';
  const finished = item.endedAt !== null || (item.startedAt === null && item.closedAt != null);
  if (!finished && globalThis.hasSharingFriends?.()) {
    const guest = shared && !shared.isHost;
    const inviteSummary = shared ? (guest ? shared.goingCount + ' vão' : shared.invitedCount + (shared.invitedCount === 1 ? ' convidado' : ' convidados') + (shared.goingCount ? ' · ' + shared.goingCount + ' vão' : '')) : 'Ninguém';
    menu.append(occasionPeopleRow(guest ? 'Quem vai' : 'Convidados', inviteSummary, () => globalThis.openInviteDialog?.({
      occasion: item, selected: new Set(shared?.roster && !shared.gone ? shared.roster.invited : []),
      onConfirm: chosen => globalThis.applyOccasionInvites?.(id, [...chosen]).catch(error => { console.error('Falha ao atualizar convidados.', error); showToast('Não foi possível atualizar os convidados agora. Tente de novo.'); }),
    }), 'people'));
    const shareCount = item.startedAt === null ? (item.shareWith?.length || 0) : null;
    menu.append(occasionPeopleRow('Compartilhar doses', shareCount === null ? '' : shareCount ? shareCount + (shareCount === 1 ? ' pessoa' : ' pessoas') : 'Ninguém', () => globalThis.openShareOccasionDialog?.(item, records), 'share'));
  }
  if (state.securityConfig.enabled && item.startedAt !== null && item.endedAt === null) {
    const unlock = document.createElement('label'); unlock.className = 'occasion-menu-row occasion-unlock-toggle';
    const tile = document.createElement('span'); tile.className = 'occasion-menu-icon'; tile.append(occasionIcon('unlock'));
    const copy = document.createElement('span'); copy.className = 'occasion-unlock-copy';
    const title = document.createElement('strong'); title.textContent = 'Manter app desbloqueado';
    const help = document.createElement('small'); help.className = 'clean-optional'; help.textContent = 'Ao voltar ao app, não será necessário autenticar. A tela recente continua protegida.';
    copy.append(title, help);
    const control = document.createElement('span'); control.className = 'setting-toggle-control';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = globalThis.isSecurityEventUnlockActive?.(item.id) === true; input.setAttribute('aria-label', 'Manter app desbloqueado durante ' + item.name);
    const track = document.createElement('span'); track.className = 'setting-toggle-track'; track.setAttribute('aria-hidden', 'true'); track.append(document.createElement('span'));
    input.addEventListener('change', () => {
      const saved = globalThis.setSecurityEventUnlock?.(item.id, input.checked) === true;
      if (!saved) input.checked = !input.checked;
      else showToast(input.checked ? 'O app ficará desbloqueado durante este evento.' : 'Bloqueio normal restaurado para este evento.');
    });
    control.append(input, track); unlock.append(tile, copy, control); menu.append(unlock);
  }
  if (menu.childElementCount) content.append(menu);
  // Ações que mudam a sua relação com o evento, discretas no fim; editar, excluir e a ação
  // principal ficam no rodapé.
  const link = (icon, label, action) => { const button = occasionButton('', action, 'occasion-link'); button.append(occasionIcon(icon), label); return button; };
  if (FunTimeOccasions.pending(item)) content.append(link('cancel', 'Cancelar agendamento', () => changeOccasion(id, 'cancel')));
  if (OCCASION_LEAVE_ENABLED && shared && !shared.isHost) content.append(link('leave', 'Deixar de participar', async () => {
    if (await showAppConfirmation('Deixar de participar de ' + item.name + '? Sua presença é retirada e as doses que você compartilha neste evento deixam de ser vistas. O evento continua na sua agenda.', { title: 'Deixar de participar', confirmLabel: 'Deixar de participar' })) { await globalThis.leaveSharedEvent?.(id); if (occasionDetailDialog.open) openOccasionDetails(id); }
  }));
  // Rodapé: lápis e lixeira à esquerda, a ação principal da situação ocupando o resto.
  const footer = $occasion('occasion-detail-actions'); footer.replaceChildren();
  const lapsed = item.startedAt === null && item.closedAt != null;
  if (!lapsed) footer.append(occasionIconButton('edit', 'Editar evento', () => openOccasionEditor(id)));
  footer.append(occasionIconButton('delete', 'Excluir evento', () => changeOccasion(id, 'delete'), 'is-danger'));
  let main = null;
  if (item.startedAt !== null && item.endedAt === null) main = occasionButton('O evento acabou', () => changeOccasion(id, 'end'), 'primary-button');
  else if (FunTimeOccasions.pending(item)) main = occasionButton('Iniciar agora', () => changeOccasion(id, 'start'), 'primary-button');
  else if (lapsed) main = occasionButton('Reagendar', () => openOccasionEditor(id));
  else if (item.endedAt !== null && !FunTimeOccasions.active(state.occasions)) main = occasionButton('Reabrir', () => changeOccasion(id, 'reopen'));
  if (main) { main.classList.add('occasion-main-action'); footer.append(main); }
  if (!occasionDetailDialog.open) occasionDetailDialog.showModal();
}
function renderOccasions() {
  const current = $occasion('occasion-current'), list = $occasion('occasion-list'); current.replaceChildren(); list.replaceChildren();
  const active = FunTimeOccasions.active(state.occasions); if (active) current.append(occasionCurrentCard(active));
  agendaTab ||= state.occasions.some(FunTimeOccasions.pending) ? 'upcoming' : 'past';
  $occasion('agenda-upcoming').setAttribute('aria-pressed', String(agendaTab === 'upcoming')); $occasion('agenda-past').setAttribute('aria-pressed', String(agendaTab === 'past'));
  // Convite esperando resposta mora no topo de Próximos; em Passados, um ponto na aba avisa que há um.
  const invites = globalThis.pendingInviteCount?.() || 0;
  $occasion('occasion-invites').hidden = !(invites > 0 && agendaTab === 'upcoming');
  $occasion('agenda-upcoming-dot').hidden = !(invites > 0 && agendaTab !== 'upcoming');
  // Busca visível só com muitos eventos (contando os das duas abas, para não aparecer e sumir ao trocar de aba).
  const searchInput = $occasion('agenda-search');
  const searchable = state.occasions.filter(item => item.id !== active?.id).length >= AGENDA_SEARCH_MIN;
  if (!searchable) searchInput.value = '';
  $occasion('agenda-search-field').hidden = !searchable;
  $occasion('agenda-search-clear').hidden = !searchInput.value;
  const search = searchInput.value.trim().toLocaleLowerCase('pt-BR');
  const items = state.occasions.filter(item => item.id !== active?.id && (agendaTab === 'upcoming' ? FunTimeOccasions.pending(item) : !FunTimeOccasions.pending(item)))
    .filter(item => item.name.toLocaleLowerCase('pt-BR').includes(search))
    .sort((a, b) => ((a.startedAt ?? a.scheduledStartAt) - (b.startedAt ?? b.scheduledStartAt)) * (agendaTab === 'upcoming' ? 1 : -1));
  let lastGroup = '';
  for (const item of items.slice(0, agendaLimit)) {
    const date = new Date(item.startedAt ?? item.scheduledStartAt); const group = date.getFullYear() + '-' + date.getMonth();
    if (group !== lastGroup) {
      const heading = document.createElement('h2'); heading.className = 'agenda-month-heading';
      heading.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      list.append(heading); lastGroup = group;
    }
    list.append(occasionRow(item));
  }
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'agenda-empty'; empty.textContent = search ? 'Nenhum evento encontrado.' : agendaTab === 'upcoming' ? 'Nenhum evento agendado. Use + Novo para planejar ou iniciar um.' : 'Seus eventos passados aparecerão aqui.'; list.append(empty); }
  $occasion('agenda-more').hidden = items.length <= agendaLimit;
}
function refreshOccasionContext() {
  const enabled = state.preferences.eventsEnabled === true;
  $occasion('events-enabled').checked = enabled;
  $occasion('nav-occasion').hidden = !enabled;
  document.querySelector('.bottom-nav').style.gridTemplateColumns = `repeat(${enabled ? 4 : 3}, minmax(0, 1fr))`;
  $occasion('home-occasion').hidden = !enabled;
  $occasion('home-occasion').classList.toggle('is-active', enabled && !!FunTimeOccasions.active(state.occasions));
  // Eventos ligado ou desligado muda onde o convite pendente aparece (Eventos ⇄ Amigos).
  globalThis.refreshInviteViews?.();
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
  const field = $occasion('history-occasion-field');
  const trigger = $occasion('history-occasion-filter');
  const label = $occasion('history-occasion-filter-label');
  const options = $occasion('history-occasion-options');
  field.hidden = !state.preferences.eventsEnabled;
  if (!state.preferences.eventsEnabled) state.historyOccasionId = 'all';
  const scopedEvents = state.events.filter(event => !state.historyDrinkId || event.drinkId === state.historyDrinkId);
  const occasionIds = new Set(scopedEvents.map(event => event.occasionId).filter(Boolean));
  const items = [{ id: 'all', label: 'Todos os eventos' }];
  if (scopedEvents.some(event => !event.occasionId)) items.push({ id: 'none', label: 'Sem evento' });
  for (const item of [...state.occasions].filter(item => occasionIds.has(item.id)).sort((a,b) => b.startedAt-a.startedAt)) {
    items.push({ id: item.id, label: item.name + ' · ' + toLocalDateInputValue(item.startedAt) });
  }
  if (!items.some(item => item.id === state.historyOccasionId)) state.historyOccasionId = 'all';
  options.replaceChildren(...items.map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-filter-option';
    button.dataset.value = item.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(item.id === state.historyOccasionId));
    button.textContent = item.label;
    return button;
  }));
  label.textContent = items.find(item => item.id === state.historyOccasionId)?.label || items[0].label;
  trigger.setAttribute('aria-label', 'Filtrar por evento: ' + label.textContent);
  trigger.setAttribute('aria-expanded', 'false');
  options.hidden = true;
}
// Evento de um registro: o horário decide (os eventos nunca se sobrepõem). A opção só
// aparece quando existe um evento cobrindo o horário escolhido e oferece só "Sem evento" e
// esse evento; muda sozinha enquanto a data e a hora são ajustadas.
let recordOccasionRecord = null, recordOccasionChoice = null;
function recordDialogMinute(timestamp) { return toLocalDateInputValue(timestamp) + 'T' + toLocalTimeInputValue(timestamp); }
function refreshRecordOccasion() {
  const record = recordOccasionRecord; if (!record) return;
  const select = $occasion('record-occasion');
  const date = $occasion('event-date').value;
  const time = $occasion('event-hour').value.padStart(2, '0') + ':' + $occasion('event-minute').value.padStart(2, '0');
  const unchanged = date + 'T' + time === recordDialogMinute(record.consumedAt);
  const at = unchanged ? record.consumedAt : new Date(date + 'T' + time + ':00').getTime();
  const candidate = state.preferences.eventsEnabled && Number.isFinite(at) ? state.occasions.find(item => FunTimeOccasions.contains(item, at)) || null : null;
  select.parentElement.hidden = !candidate;
  select.replaceChildren(new Option('Sem evento', ''));
  if (!candidate) { select.value = ''; return; }
  select.add(new Option(candidate.name + ' · ' + toLocalDateInputValue(candidate.startedAt), candidate.id));
  // Escolha manual vale enquanto o evento candidato for o mesmo; sem escolha: horário
  // inalterado mantém como está, horário novo entra no evento que o cobre.
  if (recordOccasionChoice && recordOccasionChoice.candidateId === candidate.id) select.value = recordOccasionChoice.value;
  else select.value = unchanged ? (record.occasionId === candidate.id ? candidate.id : '') : candidate.id;
}
function populateRecordOccasions(record) {
  recordOccasionRecord = record; recordOccasionChoice = null;
  refreshRecordOccasion();
}
$occasion('record-occasion').addEventListener('change', () => {
  const select = $occasion('record-occasion');
  const candidate = [...select.options].find(option => option.value);
  recordOccasionChoice = { candidateId: candidate ? candidate.value : null, value: select.value };
});
// O próprio seletor não redispara: reconstruir as opções no meio da escolha a desfaria.
for (const type of ['input', 'change']) $occasion('event-form').addEventListener(type, event => { if (event.target.id !== 'record-occasion') refreshRecordOccasion(); });
$occasion('occasion-close').addEventListener('click', closeOccasionEditor); $occasion('occasion-cancel').addEventListener('click', closeOccasionEditor);
$occasion('occasion-detail-close').addEventListener('click', closeOccasionDetails);
$occasion('occasion-new').addEventListener('click', () => openOccasionEditor());
$occasion('home-occasion').addEventListener('click', openHomeOccasion); $occasion('nav-occasion').addEventListener('click', openOccasionView); $occasion('nav-home').addEventListener('click', closeHistoryView);
function closeHistoryOccasionFilter({ restoreFocus = false } = {}) {
  const trigger = $occasion('history-occasion-filter');
  $occasion('history-occasion-options').hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger.focus();
}
$occasion('history-occasion-filter').addEventListener('click', () => {
  const options = $occasion('history-occasion-options');
  const willOpen = options.hidden;
  options.hidden = !willOpen;
  $occasion('history-occasion-filter').setAttribute('aria-expanded', String(willOpen));
  if (willOpen) options.querySelector('[aria-selected="true"]')?.focus();
});
$occasion('history-occasion-options').addEventListener('click', event => {
  const option = event.target.closest('.history-filter-option');
  if (!option) return;
  state.historyOccasionId = option.dataset.value;
  state.historyLimit = 20;
  // Saiu dos registros do evento de onde veio: o cabeçalho volta a ser o do Histórico e o ← vai à Home.
  if (state.historyReturnOccasionId && option.dataset.value !== state.historyReturnOccasionId) globalThis.setHistoryReturnOccasion(null);
  refreshOccasionFilters();
  renderHistory();
  $occasion('history-occasion-filter').focus();
});
$occasion('history-occasion-options').addEventListener('keydown', event => {
  const options = [...event.currentTarget.querySelectorAll('.history-filter-option')];
  const current = options.indexOf(document.activeElement);
  if (event.key === 'Escape') { event.preventDefault(); closeHistoryOccasionFilter({ restoreFocus: true }); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[next]?.focus();
});
document.addEventListener('pointerdown', event => {
  if (!$occasion('history-occasion-field').contains(event.target)) closeHistoryOccasionFilter();
});
for (const [id, tab] of [['agenda-upcoming','upcoming'],['agenda-past','past']]) $occasion(id).addEventListener('click', () => { agendaTab = tab; agendaLimit = 20; renderOccasions(); });
$occasion('agenda-search').addEventListener('input', () => { agendaLimit = 20; renderOccasions(); });
$occasion('agenda-search-clear').addEventListener('click', () => { $occasion('agenda-search').value = ''; agendaLimit = 20; renderOccasions(); $occasion('agenda-search').focus(); });
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

// app.js e navigation.js (script clássico até virar módulo) ainda leem estas soltas;
// alguns testes leem/escrevem via page.evaluate. Ver docs/specs/0019.
globalThis.openOccasionView = openOccasionView;
globalThis.reconcileOccasions = reconcileOccasions;
globalThis.refreshOccasionContext = refreshOccasionContext;
globalThis.refreshOccasionFilters = refreshOccasionFilters;
globalThis.refreshOccasionReminder = refreshOccasionReminder;
globalThis.commitOccasions = commitOccasions;
globalThis.openOccasionEditor = openOccasionEditor;
globalThis.occasionInput = occasionInput;
globalThis.openOccasionDetails = openOccasionDetails;
globalThis.populateRecordOccasions = populateRecordOccasions;
globalThis.createOccasionFromInvite = createOccasionFromInvite;
globalThis.refreshSharedEventViews = refreshSharedEventViews;
Object.defineProperty(globalThis, "occasionRetryAt", {
  get: () => occasionRetryAt,
  set: (value) => { occasionRetryAt = value; },
  configurable: true,
});
