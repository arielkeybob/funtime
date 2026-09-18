// Aceite específico deste navegador, separado dos dados transferíveis.
const TERMS_VERSION = "1.0.6";
// Aceites destas versões anteriores continuam valendo, sem pedir um novo. Liste aqui
// só a mudança que não altera o que a pessoa consentiu — correção de texto, ajuste de
// forma. Os dois erros não são simétricos: esquecer de listar apenas pede o aceite de
// novo, enquanto listar indevidamente esconde dela uma mudança que deveria ver.
//
// Exceções registradas, ambas mudança material dispensada a pedido explícito do
// usuário (não só de forma), atenuadas por a funcionalidade ser opt-in e sempre
// iniciada por quem compartilha:
// - 1.0.4 → 1.0.5 (spec 0023): capacidade de enviar registros para a conta de
//   outra pessoa.
// - 1.0.5 → 1.0.6 (spec 0023, v2.4.0): o modelo de consentimento do pareamento
//   mudou de duas etapas (digitar código + aceite separado com confirmação de
//   número) para uma (mostrar o código já é o consentimento de quem gera).
const TERMS_VERSIONS_STILL_VALID = new Set(["1.0.3", "1.0.4", "1.0.5"]);
const TERMS_STORAGE_KEY = "funtime-terms-v1";
const TERMS_DRAFT_KEY = "funtime-terms-draft-v1";

function acceptanceStillValid(version) {
  return version === TERMS_VERSION || TERMS_VERSIONS_STILL_VALID.has(version);
}

export function hasCurrentTermsAcceptance() {
  try {
    const value = JSON.parse(localStorage.getItem(TERMS_STORAGE_KEY));
    return value?.termsAccepted === true && acceptanceStillValid(value.termsVersion) &&
      Number.isFinite(value.termsAcceptedAt) && value.termsAcceptedAt > 0;
  } catch { return false; }
}

export function requireTermsAcceptance() {
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

// app.js (script clássico até virar módulo) ainda lê estas funções soltas. Ver docs/specs/0019.
globalThis.hasCurrentTermsAcceptance = hasCurrentTermsAcceptance;
globalThis.requireTermsAcceptance = requireTermsAcceptance;
