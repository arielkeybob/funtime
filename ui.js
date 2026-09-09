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

// Contrato compartilhado dos formulários com rascunho.
const formDrafts = new WeakMap();
function readFormDraft(form) {
  return JSON.stringify([...form.querySelectorAll('input, textarea, select')]
    .filter(input => (input.name || input.id) && input.id !== 'event-time' && input.id !== 'emoji-category')
    .filter(input => !['radio', 'checkbox'].includes(input.type) || input.checked)
    .map(input => [input.name || input.id, input.value]));
}
function updateFormDraft(form) {
  if (!formDrafts.has(form)) return;
  const changed = readFormDraft(form) !== formDrafts.get(form);
  form.querySelectorAll('button[type="submit"]').forEach(button => { button.hidden = !changed; });
  form.querySelector('.app-dialog-actions')?.classList.toggle('has-only-cancel', !changed);
  return changed;
}
function beginFormDraft(form) {
  formDrafts.set(form, readFormDraft(form));
  updateFormDraft(form);
  if (form.dataset.draftTracked) return;
  form.dataset.draftTracked = 'true';
  ['input', 'change'].forEach(type => form.addEventListener(type, () => updateFormDraft(form)));
  form.addEventListener('submit', event => {
    if (!updateFormDraft(form)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}
