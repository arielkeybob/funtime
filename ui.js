// Estrutura compartilhada: conteúdo rolável e ações fixas em todos os diálogos.
function initializeAppDialogs() {
  document.querySelectorAll('dialog.dialog').forEach(dialog => {
    const form = dialog.querySelector('form');
    if (!form || dialog.classList.contains('app-dialog')) return;
    dialog.classList.add('app-dialog');
    const footer = [...form.children].find(child => child.matches('.dialog-actions, .delete-choice-actions, .warning-actions'));
    let content = [...form.children].find(child => child.matches('.drink-dialog-scroll, .log-dialog-scroll'));
    if (!content) {
      content = document.createElement('div');
      [...form.children].filter(child => child !== footer).forEach(child => content.append(child));
      form.prepend(content);
    }
    content.classList.add('app-dialog-scroll');
    if (footer) footer.classList.add('app-dialog-actions');
    else form.classList.add('app-dialog-no-footer');
  });
}
initializeAppDialogs();

// Teclado do celular: a tecla de ação vira ✓ ("Concluído") e só desce o teclado — nunca
// envia o formulário. Dentro do campo aparece um ✓ enquanto ele foi modificado; tocar nele
// também desce o teclado. Salvar continua sendo só o botão do próprio cadastro.
function initializeKeyboardDismiss() {
  const TYPES = ['text', 'search', 'number', 'tel', 'email', 'url'];
  const isTarget = node => node instanceof HTMLInputElement && TYPES.includes(node.type) && !node.readOnly;
  const wantsCheck = node => node.type !== 'search' && !node.hasAttribute('data-no-check');
  const isTouch = () => matchMedia('(pointer: coarse)').matches;
  let button = null, active = null, startValue = '';

  function ensureButton() {
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'field-check';
    button.hidden = true;
    button.setAttribute('aria-label', 'Concluir campo');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7.5"/></svg>';
    // Manter o foco no campo até o clique: sem isto o toque tira o foco antes e o ✓ some.
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => { const field = active; hide(); field?.blur(); });
    return button;
  }

  function place() {
    if (!active || !button || button.hidden) return;
    if (button.parentElement !== active.parentElement) active.after(button);
    active.parentElement.classList.add('has-field-check');
    const size = button.offsetWidth || 32;
    button.style.top = active.offsetTop + (active.offsetHeight - size) / 2 + 'px';
    button.style.left = active.offsetLeft + active.offsetWidth - size - 8 + 'px';
  }

  function hide() {
    if (button) button.hidden = true;
  }

  function refresh() {
    if (!active || !wantsCheck(active)) return hide();
    const changed = active.value !== startValue;
    ensureButton().hidden = !changed;
    if (changed) place();
  }

  function prepare(node) {
    if (node.dataset.keyboardReady) return;
    node.dataset.keyboardReady = '1';
    node.setAttribute('enterkeyhint', node.type === 'search' ? 'search' : 'done');
    if (wantsCheck(node)) node.setAttribute('data-field-check', '');
  }

  document.querySelectorAll('input').forEach(node => { if (isTarget(node)) prepare(node); });

  document.addEventListener('focusin', event => {
    if (!isTarget(event.target)) return;
    prepare(event.target);
    active = event.target;
    startValue = active.value;
    hide();
  });
  document.addEventListener('focusout', event => {
    if (event.target === active) { hide(); active = null; }
  });
  document.addEventListener('input', event => { if (event.target === active) refresh(); });
  addEventListener('resize', () => { place(); });
  window.visualViewport?.addEventListener('resize', () => { place(); });

  // Enter só desce o teclado. Teclados que mandam Enter como tecla "desconhecida" ainda
  // disparam o envio implícito: o clique sintético no botão de envio (detail 0, com o foco
  // num campo de texto) é barrado. Clique real do usuário no botão não é afetado.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || !isTouch() || !isTarget(event.target)) return;
    event.preventDefault();
    event.target.blur();
  }, true);
  document.addEventListener('click', event => {
    const submit = event.target instanceof Element ? event.target.closest('button[type=submit], input[type=submit]') : null;
    if (!submit || event.detail !== 0 || !isTouch() || !isTarget(document.activeElement)) return;
    event.preventDefault();
    event.stopPropagation();
    document.activeElement.blur();
  }, true);
}
initializeKeyboardDismiss();

// Contrato compartilhado dos formulários com rascunho.
const formDrafts = new WeakMap();
function readFormDraft(form) {
  return JSON.stringify([...form.querySelectorAll('input, textarea, select')]
    .filter(input => (input.name || input.id) && input.id !== 'event-time' && input.id !== 'emoji-category')
    .filter(input => !['radio', 'checkbox'].includes(input.type) || input.checked)
    .map(input => [input.name || input.id, input.value]));
}
export function updateFormDraft(form) {
  if (!formDrafts.has(form)) return;
  const changed = readFormDraft(form) !== formDrafts.get(form);
  form.querySelectorAll('button[type="submit"]').forEach(button => { button.hidden = !changed; });
  form.querySelector('.app-dialog-actions')?.classList.toggle('has-only-cancel', !changed);
  return changed;
}
export function beginFormDraft(form) {
  formDrafts.set(form, readFormDraft(form));
  updateFormDraft(form);
  if (form.dataset.draftTracked) return;
  form.dataset.draftTracked = 'true';
  ['input', 'change'].forEach(type => form.addEventListener(type, () => updateFormDraft(form)));
  form.addEventListener('submit', event => {
    if (!updateFormDraft(form)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}

// Fechar pelo Voltar, Escape ou bloqueio equivale a cancelar.
export function showAppConfirmation(message, { title = 'Confirmar', confirmLabel = 'Confirmar' } = {}) {
  const dialog = document.getElementById('app-confirm-dialog');
  if (dialog.open) return Promise.resolve(false);
  document.getElementById('app-confirm-title').textContent = title;
  document.getElementById('app-confirm-message').textContent = message;
  document.getElementById('app-confirm-accept').textContent = confirmLabel;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}
// Editor compacto de data/horário usando as roletas e classes comuns.
export function initializeDateTimeEditor(input) {
  if (input._dateTimeEditor) { input._dateTimeEditor.refresh(); return; }
  const label = input.parentElement;
  const details = document.createElement('details'); details.className = 'date-time-editor'; details.id = label.id; details.hidden = label.hidden;
  const summary = document.createElement('summary');
  const title = label.querySelector('span').textContent;
  const body = document.createElement('div'); body.className = 'date-time-editor-body';
  const dateLabel = document.createElement('label'); dateLabel.className = 'field';
  const dateTitle = document.createElement('span'); dateTitle.textContent = 'Data';
  const date = document.createElement('input'); date.type = 'date'; date.setAttribute('aria-label', 'Data de ' + title.toLowerCase());
  dateLabel.append(dateTitle, date); body.append(dateLabel);
  const fieldset = document.createElement('fieldset'); fieldset.className = 'field interval-fieldset';
  const legend = document.createElement('legend'); legend.className = 'interval-fieldset-title'; legend.textContent = 'Horário';
  const row = document.createElement('div'); row.className = 'duration-inputs wheel-duration-inputs';
  const pickers = [];
  for (const [text, max] of [['Hora', 23], ['Minuto', 59]]) {
    const field = document.createElement('div'); field.className = 'duration-field';
    const caption = document.createElement('span'); caption.textContent = text;
    const shell = document.createElement('div'); shell.className = 'wheel-picker-shell';
    const wheel = document.createElement('div'); wheel.className = 'wheel-picker'; wheel.tabIndex = 0; wheel.setAttribute('role', 'spinbutton'); wheel.setAttribute('aria-label', text + ' de ' + title.toLowerCase()); wheel.setAttribute('aria-valuemin', '0'); wheel.setAttribute('aria-valuemax', String(max));
    const track = document.createElement('div'); track.className = 'wheel-picker-track'; track.setAttribute('aria-hidden', 'true');
    const selection = document.createElement('div'); selection.className = 'wheel-picker-selection'; selection.setAttribute('aria-hidden', 'true');
    const value = document.createElement('input'); value.type = 'hidden';
    wheel.append(track); shell.append(wheel, selection); field.append(caption, shell, value); row.append(field);
    pickers.push({ wheel, value, max });
  }
  fieldset.append(legend, row); body.append(fieldset); input.type = 'hidden';
  label.replaceWith(details); details.append(summary, input, body);
  const updateSummary = () => {
    const parsed = new Date(input.value);
    summary.textContent = title + ': ' + (Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Selecionar');
  };
  let refreshing = false;
  const refresh = () => {
    refreshing = true;
    const [day, time = '00:00'] = input.value.split('T'); date.value = day || '';
    const values = time.split(':');
    pickers.forEach((picker, i) => { picker.value.value = String(Number(values[i]) || 0); if (details.open) { if (!picker.wheel._wheelState) createWheelPicker(picker.wheel, picker.value, picker.max); setWheelPickerValue(picker.wheel, Number(values[i])); } });
    updateSummary(); refreshing = false;
  };
  const changed = () => {
    if (refreshing) return;
    input.value = date.value ? date.value + 'T' + pickers.map(picker => picker.value.value.padStart(2, '0')).join(':') : '';
    updateSummary(); input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  date.addEventListener('input', changed); pickers.forEach(picker => picker.value.addEventListener('input', changed));
  details.addEventListener('toggle', () => { if (details.open) refresh(); });
  input._dateTimeEditor = { refresh, collapse() { details.open = false; } }; refresh();
}

// occasions-ui.js (script clássico até virar módulo) ainda lê estas 4 soltas. Ver docs/specs/0019.
globalThis.initializeDateTimeEditor = initializeDateTimeEditor;
globalThis.beginFormDraft = beginFormDraft;
globalThis.updateFormDraft = updateFormDraft;
globalThis.showAppConfirmation = showAppConfirmation;
