export function wireDialogDismissal(dialog, close, { cancel = false } = {}) {
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) close();
  });
  if (cancel) {
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
  }
}
