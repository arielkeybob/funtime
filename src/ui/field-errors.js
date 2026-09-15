export function createFieldErrorController({ fieldEl, errorEl, inputEl }) {
  function set(hasError) {
    fieldEl.classList.toggle("has-error", hasError);
    errorEl.hidden = !hasError;
    inputEl.setAttribute("aria-invalid", hasError ? "true" : "false");
  }
  return { set, clear: () => set(false) };
}

export function createFormErrorController(el) {
  return (message) => {
    el.textContent = message;
    el.hidden = false;
  };
}
