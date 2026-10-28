# 0030 — "Foi que horas?" e seletor de hora padronizado

## Contexto

No **Anotar dose** (`#log-dialog`) a pessoa informava "há quanto tempo" (roletas 0–48 h e
0–59 min). É mais natural dizer a hora em que bebeu, como no despertador do Android. Os
quatro lugares com roleta (Anotar dose, intervalo da bebida, Editar registro e
início/encerramento de evento) tinham visual pesado (caixa com borda, fundo fixo `#09090b`,
linhas na seleção) e o editor de evento montava o DOM à mão em `ui.js`.

## Decisão

- **Anotar dose**: "Ou informe há quanto tempo" vira **"Ou escolha a hora"**, com roletas
  00–23 : 00–59 abertas na hora atual e uma linha de data acima ("Hoje · qua 28/10",
  "(ontem) ter 27/10", "sáb 12/09").
  - Sem data tocada: a hora vale para hoje; se ainda não chegou, para ontem
    (01:00 agora e 23:00 na roleta = ontem 23:00).
  - Tocar na data abre o calendário nativo (`<input type="date">` invisível por cima,
    `max` = hoje, sem mínimo): qualquer dia passado. Com data escolhida, ela manda; se a
    combinação ainda não aconteceu, aparece "Esse horário ainda não chegou…" e nada é anotado.
  - O botão diz quando: "Anotar às 20:10", "Anotar ontem às 23:00", "Anotar em 12/09 às 14:00".
  - No minuto de agora, vale o instante exato (como o botão Agora).
  - Botões rápidos (Agora, 5/15/30 min, 1 h atrás) não mudam.
- **Visual único** (`styles.css`): sem caixa, borda nem linhas; o número escolhido grande e
  branco, os vizinhos esmaecidos. O esmaecimento usa `mask-image`, que funciona sobre
  qualquer fundo (diálogo, editor de evento lilás). Roleta de hora (`.wheel-clock`) tem ":"
  entre as colunas e não tem legendas; a de duração (intervalo) mantém "Horas"/"Minutos".
- A altura de cada número vem de `--wheel-item-h` no CSS, lida por `wheel-picker.js`
  (antes era a constante 44 repetida em vários overrides por diálogo).

## Contrato

- `src/format/datetime.js`: `resolveLogTimestamp({ hour, minute, date = null, now })` →
  `{ timestamp, daysAgo, isFuture }`; `formatLogDay(timestamp, now)`.
- `src/ui/wheel-picker.js`: `buildWheelPair({ mode, ariaSuffix, labels, maxHours })` →
  `{ row, hours: { wheel, input, max }, minutes }`, usado pelo editor de data/hora de
  eventos (`ui.js`). Os diálogos fixos continuam com a marcação em `index.html` (os
  `querySelector` de `app.js` rodam no carregamento), no mesmo formato.
- Anotar dose: inputs ocultos `#log-hour`/`#log-minute` (antes `#log-hours-ago`/
  `#log-minutes-ago`) e `#log-date`; `setLogClock(h, m)` substitui `setLogDurationPicker`.
- Formato salvo não muda: o registro continua sendo um `consumedAt`. `DATA_VERSION` mantido.

## Plano de teste

- Unitários em `tests/format-datetime.test.cjs` (hoje/ontem, virada de mês/ano, data
  escolhida, horário futuro) e `tests/countdown-menu-browser.test.cjs` (abre na hora atual,
  rascunho marca e desmarca).
- Manual: Anotar dose em 360 px — hora atual ao abrir, hora futura vira "(ontem)", data
  antiga pelo calendário, data de hoje com hora futura mostra erro; intervalo 24 h desabilita
  minutos; Editar registro e Início/Encerramento de evento com o novo visual.
- **Tutoriais afetados**: `registrar-dose` (novo passo 5 mostrando "Ou escolha a hora") e
  `historico` (só regenerado; legendas continuam corretas).
