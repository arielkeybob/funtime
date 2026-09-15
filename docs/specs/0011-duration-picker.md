# 0011 — Extrair `createDurationPicker` para `src/ui/wheel-picker.js`

Status: implementada

## Contexto

`app.js` tem duas funções quase idênticas para configurar um par de
wheel-pickers (horas/minutos):

- `setLogDurationPicker`/`initializeLogDurationPickers` (app.js:3609-3623) — usado no diálogo "há quanto tempo" (`logHoursWheel`/`logMinutesWheel`), limite de 48h, minutos sempre livres de 0-59.
- `setDurationPicker`/`initializeDurationPickers` (app.js:3625-3644) — usado no intervalo entre doses (`intervalHoursWheel`/`intervalMinutesWheel`), limite de 24h, **com a regra extra**: ao chegar em 24h, os minutos são zerados e o wheel de minutos fica desabilitado (`is-disabled`, `aria-disabled`, `tabIndex=-1`) via `updateMinuteWheelAvailability` (app.js:3591-3607, chamada indiretamente por `setWheelPickerValue` quando o wheel de horas é o `intervalHoursWheel`).

A diferença real entre as duas não é só o limite de horas — é essa regra de
"capar os minutos e desabilitar o wheel no máximo", que só existe no
segundo caso. `createDurationPicker` precisa de um parâmetro para isso, não
dá para tratar como "a mesma função com número de horas diferente".

**Escopo reduzido em relação ao plano original:** o plano prévia mover
também `createWheelPicker`/`setWheelPickerValue` para o módulo novo. Não
faço isso nesta spec porque `setWheelPickerValue` (app.js:3567-3589) tem
uma referência direta a `intervalHoursWheel` no meio da função (linha
3586-3588: `if (element === intervalHoursWheel) updateMinuteWheelAvailability(value)`)
— acopla o mecanismo "genérico" de wheel a uma regra de negócio específica
de um wheel só. Desembaraçar isso é um trabalho à parte, de risco maior, e
não é necessário para eliminar a duplicação real desta spec (os dois
`setXDurationPicker`). `createWheelPicker`/`setWheelPickerValue`/
`updateMinuteWheelAvailability` continuam em `app.js` por enquanto, e o
`createDurationPicker` novo os recebe **por parâmetro**, sem importar nada.

## Decisão

```js
// src/ui/wheel-picker.js
export function createDurationPicker({
  maxHours, hoursWheel, minutesWheel, hoursInput, minutesInput,
  capMinutesAtMaxHours = false, createWheelPicker, setWheelPickerValue,
}) {
  function set(hours, minutes) {
    const safeHours = Math.max(0, Math.min(maxHours, Number(hours) || 0));
    const atMax = capMinutesAtMaxHours && safeHours === maxHours;
    const safeMinutes = atMax ? 0 : Math.max(0, Math.min(59, Number(minutes) || 0));

    if (capMinutesAtMaxHours) {
      delete minutesWheel.dataset.valueBeforeMax;
      minutesWheel.classList.remove("is-disabled");
      minutesWheel.setAttribute("aria-disabled", "false");
      minutesWheel.tabIndex = 0;
    }

    hoursInput.value = String(safeHours);
    minutesInput.value = String(safeMinutes);
    setWheelPickerValue(minutesWheel, safeMinutes);
    setWheelPickerValue(hoursWheel, safeHours);
  }

  function initialize(initialHours, initialMinutes) {
    createWheelPicker(hoursWheel, hoursInput, maxHours);
    createWheelPicker(minutesWheel, minutesInput, 59);
    set(initialHours, initialMinutes);
  }

  return { set, initialize };
}
```

Em `app.js`, os dois pares viram instâncias da fábrica, com as funções
antigas mantidas como wrappers finos (8 call sites externos hoje chamam
`setDurationPicker`/`setLogDurationPicker`/`initializeDurationPickers`/
`initializeLogDurationPickers` por nome — preservo os 4 nomes para não
tocar em nenhum desses call sites):

```js
const logDurationPicker = createDurationPicker({
  maxHours: 48, hoursWheel: logHoursWheel, minutesWheel: logMinutesWheel,
  hoursInput: logHoursAgoInput, minutesInput: logMinutesAgoInput,
  createWheelPicker, setWheelPickerValue,
});
function setLogDurationPicker(hours, minutes) { logDurationPicker.set(hours, minutes); }
function initializeLogDurationPickers() { logDurationPicker.initialize(0, 0); }

const intervalDurationPicker = createDurationPicker({
  maxHours: 24, hoursWheel: intervalHoursWheel, minutesWheel: intervalMinutesWheel,
  hoursInput: intervalHoursInput, minutesInput: intervalMinutesInput,
  capMinutesAtMaxHours: true, createWheelPicker, setWheelPickerValue,
});
function setDurationPicker(hours, minutes) { intervalDurationPicker.set(hours, minutes); }
function initializeDurationPickers() { intervalDurationPicker.initialize(1, 0); }
```

`createDurationPicker` é publicada em `globalThis` pelo bridge, como as
extrações anteriores.

**O que não muda:** as 4 funções continuam existindo em `app.js` com os
mesmos nomes/assinaturas; os 8 call sites externos (linhas 3019, 3035,
3057, 3065, 3299, 4688, 4689) não mudam nada. `updateMinuteWheelAvailability`
continua sendo chamada pelo caminho de interação manual do usuário com o
wheel (`setWheelPickerValue` → `if (element === intervalHoursWheel)`), sem
relação com o `createDurationPicker` novo — os dois caminhos (definir
programaticamente vs. o usuário girar o wheel) continuam distintos, como
já eram.

## Casos de borda preservados

- 24h no intervalo de dose sempre zera minutos e desabilita o wheel — igual a hoje.
- 48h no "há quanto tempo" nunca desabilita nada — os minutos continuam livres de 0-59, igual a hoje.
- Clamping de horas/minutos fora do intervalo (negativo, `NaN`, acima do máximo) — mesma matemática de `Math.max(0, Math.min(...))`.

## Plano de teste

- `node --check app.js`, `node --check src/ui/wheel-picker.js`, `node --check src/bootstrap/legacy-bridge.js`.
- Novo `tests/ui-wheel-picker.test.cjs`: testa `createDurationPicker` isoladamente com `createWheelPicker`/`setWheelPickerValue` fakes (captura os valores passados) — cobre `capMinutesAtMaxHours` true/false, clamping, e que `initialize` chama `createWheelPicker` com os limites certos antes de `set`.
- Rodar `npm test` completo; baseline atual (pós Fase 3.1) é 148/150, com as 2 falhas conhecidas em `receiver-browser.test.cjs`.
- Smoke test de navegador: abrir o diálogo de nova bebida e girar o wheel de horas até 24 (minutos devem desabilitar); abrir "anotar em outro horário" e girar até 48h (minutos continuam livres).
- Fora desta rodada: `createWheelPicker`, `setWheelPickerValue`, `updateMinuteWheelAvailability` continuam em `app.js` (acoplamento a desembaraçar depois, se valer a pena).
