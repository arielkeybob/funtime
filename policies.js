// Aceite específico deste navegador, separado dos dados transferíveis.
const TERMS_VERSION = "1.0";
const TERMS_STORAGE_KEY = "intervalo-terms-v1";

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
  document.body.classList.add("terms-pending");
  screen.hidden = false;
  document.querySelector("#terms-title").focus();
  return new Promise((resolve) => {
    const update = () => { button.disabled = !checks.every((input) => input.checked); };
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
      screen.hidden = true;
      document.body.classList.remove("terms-pending");
      resolve();
    };
    form.addEventListener("submit", submit);
    update();
  });
}
