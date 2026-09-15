# 0015 — Extrair `validateDrinkDraft` de `handleDrinkSubmit`

Status: implementada

## Contexto

`handleDrinkSubmit` (app.js:3635-3737 aprox.) faz toda a validação do
formulário de bebida inline, misturada com leitura de `FormData` e efeitos
de DOM (`requestAnimationFrame`, `scrollIntoView`). A lógica de validação
em si é pura — dado `name`/`icon`/`hours`/`minutes`, decide se é válido e
qual mensagem mostrar — mas nunca teve teste direto (só indiretamente, via
`tests/drink-reorder-browser.test.cjs` e afins, que abrem o formulário para
outros fins). Já era um gap conhecido desde a análise original.

Um detalhe de comportamento a preservar com cuidado: se **nome e ícone**
estiverem faltando ao mesmo tempo, o código de hoje marca os **dois**
campos com erro (`setDrinkFieldError("name", true)` e `setDrinkFieldError("icon", true)`),
e só rola a tela até o primeiro (nome). Não é "para no primeiro erro" —
os dois erros de campo aparecem juntos; só as validações de horas/minutos/
intervalo total é que são sequenciais (cada uma retorna imediatamente).

## Decisão

```js
// src/drinks/validate.js
export function validateDrinkDraft({ name, icon, hours, minutes }) {
  const fieldErrors = [];
  if (!name) fieldErrors.push("name");
  if (!icon) fieldErrors.push("icon");
  if (fieldErrors.length) return { ok: false, fieldErrors };

  if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
    return { ok: false, message: "Use um valor de horas entre 0 e 24." };
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return { ok: false, message: "Use um valor de minutos entre 0 e 59." };
  }
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes < 1 || totalMinutes > 1440) {
    return { ok: false, message: "O intervalo deve ficar entre 1 minuto e 24 horas." };
  }
  return { ok: true, totalMinutes };
}
```

Em `handleDrinkSubmit`, o trecho de validação (hoje app.js:3652-3686) vira:

```js
const draft = validateDrinkDraft({ name, icon, hours, minutes });
if (!draft.ok) {
  if (draft.fieldErrors) {
    let firstInvalidField = null;
    for (const field of draft.fieldErrors) {
      setDrinkFieldError(field, true);
      if (!firstInvalidField) firstInvalidField = field === "name" ? drinkNameField : drinkIconField;
    }
    requestAnimationFrame(() => {
      firstInvalidField.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return;
  }
  showFormError(draft.message);
  return;
}
const totalMinutes = draft.totalMinutes;
```

O restante de `handleDrinkSubmit` (ramos editar/criar, persistência) não
muda — só passa a usar `draft.totalMinutes` em vez da variável local
`totalMinutes` calculada inline.

**O que não muda:** as 3 mensagens de erro exatas, a regra de marcar os
dois campos junto quando ambos faltam, o comportamento de scroll até o
primeiro campo inválido, e todo o resto de `handleDrinkSubmit`
(persistência, mensagens de sucesso) — inalterado desde a spec 0007.

## Achado durante a validação manual (não é código desta spec)

Ao montar o smoke test, descobri que `ui.js`'s `beginFormDraft`/
`updateFormDraft` (ui.js:29-44) **bloqueia o próprio evento de submit** via
`event.stopImmediatePropagation()` na fase de captura, e esconde o botão
"Salvar" (`button.hidden = !changed`), sempre que o formulário não mudou
desde que abriu — `handleDrinkSubmit` nunca roda nesse caso. Isso explica
por que simular um "submeter formulário vazio" via `requestSubmit()`
programático não disparava a validação: o formulário recém-aberto está
"sem mudança" por definição. O smoke test corrigido muda outro campo
(`askDoseSize`) antes de submeter para exercitar o caminho real. Também
descobri que `setDurationPicker`/o wheel-picker sempre limitam horas a
0-24 antes de chegar em `handleDrinkSubmit` — a checagem defensiva de
`hours > 24` em `validateDrinkDraft` só é alcançável manipulando o input
escondido diretamente (o que o smoke test também confirmou funcionar).
Nenhum dos dois é um bug; são só características do formulário que valem
registrar para quem for mexer aqui de novo.

## Plano de teste

- `node --check app.js`, `node --check src/drinks/validate.js`, `node --check src/bootstrap/legacy-bridge.js`.
- Novo `tests/drinks-validate.test.cjs`: cobre as 6 combinações — nome
  faltando, ícone faltando, os dois faltando (retorna os dois em
  `fieldErrors`), horas fora do intervalo, minutos fora do intervalo,
  intervalo total fora do intervalo (incluindo o limite exato: 0 min
  inválido, 1440 min válido), e o caminho de sucesso com `totalMinutes`
  calculado corretamente.
- Rodar `npm test` completo; baseline atual (pós Fase 4) é 156/158, com as
  2 falhas conhecidas em `receiver-browser.test.cjs`.
- Smoke test: submeter o formulário vazio (dois erros de campo);
  submeter com nome/ícone mas horas=25 (erro de formulário); submeter
  válido (fecha o diálogo).
- Fora desta rodada: Fases 6-9 do plano (performance do render,
  conversão de `app.js` para módulo).
