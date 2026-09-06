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
