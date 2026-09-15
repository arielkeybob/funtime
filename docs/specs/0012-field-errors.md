# 0012 — Extrair controladores de erro de campo/formulário para `src/ui/field-errors.js`

Status: implementada

## Contexto

Dois padrões pequenos e repetidos em `app.js`:

**1. `setDrinkFieldError(field, hasError)`** (app.js:4212-4225) — hoje é um
`if (field === "name") {...} if (field === "icon") {...}` hardcoded para
exatamente 2 campos, cada bloco fazendo a mesma coisa (toggle de
`has-error`, `hidden` no elemento de erro, `aria-invalid` no input) em
elementos diferentes. 5 call sites externos usam `setDrinkFieldError`/
`clearDrinkFieldError("name"|"icon")` por nome de campo (app.js:3965, 4079,
4105, 4110, 4521) — preciso manter essa API por string, só trocar o
interior.

**2. `showFormError`/`showLogFormError`/`showEventFormError`**
(app.js:4236-4249) — três funções de uma linha, idênticas em estrutura
(`el.textContent = message; el.hidden = false;`), cada uma fixada num
elemento de erro diferente (`formError`, `logFormError`, `eventFormError`).

## Decisão

```js
// src/ui/field-errors.js
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
```

Em `app.js`:

```js
const drinkNameFieldError = createFieldErrorController({ fieldEl: drinkNameField, errorEl: drinkNameError, inputEl: nameInput });
const drinkIconFieldError = createFieldErrorController({ fieldEl: drinkIconField, errorEl: drinkIconError, inputEl: iconOptions });

function setDrinkFieldError(field, hasError) {
  (field === "name" ? drinkNameFieldError : drinkIconFieldError).set(hasError);
}
function clearDrinkFieldError(field) {
  setDrinkFieldError(field, false);
}

const showFormError = createFormErrorController(formError);
const showLogFormError = createFormErrorController(logFormError);
const showEventFormError = createFormErrorController(eventFormError);
```

`clearDrinkValidation` (app.js:4231-4234) não muda — continua chamando
`clearDrinkFieldError("name")`/`("icon")`.

**O que não muda:** os 5 call sites de `setDrinkFieldError`/
`clearDrinkFieldError` por nome de campo; os call sites de `showFormError`/
`showLogFormError`/`showEventFormError` (viram `const`, mas continuam
utilizáveis como antes — declaração de função vs `const` com função não
muda como o identificador é chamado depois).

## Plano de teste

- `node --check app.js`, `node --check src/ui/field-errors.js`, `node --check src/bootstrap/legacy-bridge.js`.
- Novo `tests/ui-field-errors.test.cjs`: `createFieldErrorController` (set/clear alternando `has-error`/`hidden`/`aria-invalid` num fake), `createFormErrorController` (define `textContent`/`hidden`).
- Rodar `npm test` completo; baseline atual (pós Fase 3.2) é 153/155, com as 2 falhas conhecidas em `receiver-browser.test.cjs`.
- Smoke test: submeter o formulário de bebida sem nome/ícone (deve mostrar os dois erros de campo); submeter com hora inválida (deve mostrar `showFormError`).
- Fora desta rodada: o drag-and-drop (último item da Fase 3, maior risco).
