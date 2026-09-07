// Aceite específico deste navegador, separado dos dados transferíveis.
const TERMS_VERSION = "1.0.1";
const TERMS_STORAGE_KEY = "funtime-terms-v1";
const TERMS_DRAFT_KEY = "funtime-terms-draft-v1";

function hasCurrentTermsAcceptance() {
  try {
    const value = JSON.parse(localStorage.getItem(TERMS_STORAGE_KEY));
    return value?.termsAccepted === true && value.termsVersion === TERMS_VERSION &&
      Number.isFinite(value.termsAcceptedAt) && value.termsAcceptedAt > 0;
  } catch { return false; }
}

function requireTermsAcceptance() {
  if (hasCurrentTermsAcceptance()) return Promise.resolve();
  const screen = document.querySelector("#terms-screen");
  const form = document.querySelector("#terms-form");
  const button = document.querySelector("#terms-continue");
  const error = document.querySelector("#terms-error");
  const checks = [...form.querySelectorAll('input[type="checkbox"]')];
  // Rascunho da mesma sessão: navegar até as políticas não desfaz escolhas.
  // Uma edição diferente das políticas sempre começa sem marcações.
  try {
    const draft = JSON.parse(sessionStorage.getItem(TERMS_DRAFT_KEY));
    if (draft?.termsVersion === TERMS_VERSION && Array.isArray(draft.checks) &&
        draft.checks.length === checks.length && draft.checks.every((value) => typeof value === "boolean")) {
      checks.forEach((input, index) => { input.checked = draft.checks[index]; });
    } else {
      checks.forEach((input) => { input.checked = false; });
    }
  } catch {
    checks.forEach((input) => { input.checked = false; });
  }
  document.body.classList.add("terms-pending");
  screen.hidden = false;
  document.querySelector("#terms-title").focus();
  return new Promise((resolve) => {
    const update = () => {
      button.disabled = !checks.every((input) => input.checked);
      try {
        sessionStorage.setItem(TERMS_DRAFT_KEY, JSON.stringify({
          termsVersion: TERMS_VERSION,
          checks: checks.map((input) => input.checked),
        }));
      } catch { /* Rascunho opcional; não impede o aceite explícito. */ }
    };
    form.addEventListener("change", update);
    const submit = (event) => {
      event.preventDefault();
      if (!checks.every((input) => input.checked)) return;
      try {
        localStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify({
          termsAccepted: true,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: Date.now(),
        }));
      } catch {
        error.textContent = "Não foi possível salvar o aceite neste navegador. Libere o armazenamento local e tente continuar novamente.";
        error.hidden = false;
        return;
      }
      form.removeEventListener("submit", submit);
      form.removeEventListener("change", update);
      try { sessionStorage.removeItem(TERMS_DRAFT_KEY); } catch { /* noop */ }
      screen.hidden = true;
      document.body.classList.remove("terms-pending");
      resolve();
    };
    form.addEventListener("submit", submit);
    update();
  });
}
