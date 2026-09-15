# 0001 — Extrair formatters puros de data/hora para `src/format/datetime.js`

Status: implementada

## Contexto

`app.js` tem quatro funções de formatação que são **puras** (sem acesso a `state`
nem ao DOM, comportamento definido só pelos parâmetros recebidos):

- `formatTime(ms)` — app.js:1967-1976. Converte milissegundos em `HH:MM:SS`.
- `formatClock(timestamp)` — app.js:2013-2018. Formata hora local `HH:MM` via `Intl.DateTimeFormat`.
- `formatHistoryElapsed(timestamp, now = Date.now())` — app.js:2020-2035. Texto relativo ("5 min atrás", "02:30h atrás", "3 dias atrás").
- `formatInterval(totalMinutes)` — app.js:2095-2102. Texto de intervalo configurado ("1 h 30 min").

Confirmei por leitura direta que nenhuma delas toca `state`, `localStorage` ou o
DOM — só recebem valor(es) e devolvem string. É a primeira extração do plano de
refactor (Fase 1.1) por ser a de menor risco possível: zero mudança de
comportamento, zero dependência de outras partes do app.

Hoje só `app.js` usa essas quatro funções (confirmei com busca em todo o
repositório — nenhum outro `.js` as referencia). Cobertura de teste atual:
`formatTime` e `formatHistoryElapsed` são testadas **indiretamente**, via o
mecanismo de `extract()` (slice de string + `vm.runInContext`) em
`tests/audit.test.cjs:250-267`, junto com três outras funções que **não** fazem
parte desta extração (`effectiveCountingMode`, `formatHistoryCounter`,
`formatActivityCounter` — essas continuam em `app.js` porque dependem de
`state`). `formatClock` e `formatInterval` **não têm nenhum teste hoje**.

## Decisão

Cria-se `src/format/datetime.js` (ES Module) com as quatro funções, código
idêntico ao de hoje — só corta-colam, sem alterar lógica. Elas saem de `app.js`.

Como `app.js` continua script clássico nesta fase (a conversão dele para módulo é
a Fase 7, bem mais adiante), ele não pode `import` diretamente. `src/bootstrap/
legacy-bridge.js` (novo, ES Module) importa as quatro funções e faz
`Object.assign(globalThis, { formatTime, formatClock, formatHistoryElapsed,
formatInterval })`. Esse bridge é carregado como `<script type="module">` por
`boot.js`, na lista de `loadApp()` (`boot.js:117`), **antes** de `app.js` na
sequência — assim, quando `app.js` executa e referencia `formatTime(...)` como
identificador solto (do jeito que já faz hoje), a função já está publicada em
`globalThis` e o comportamento observado é idêntico ao atual.

`sw.js` precisa listar os dois arquivos novos (`src/format/datetime.js`,
`src/bootstrap/legacy-bridge.js`) no `APP_SHELL` para entrarem no precache — sem
isso o app quebra offline. `scripts/dev-server.cjs` deriva sua lista de arquivos
permitidos do próprio `APP_SHELL`, então nada mais precisa mudar lá.

**O que não muda:** formato de dados salvo (`localStorage`), qualquer mensagem
de UI, `formatElapsed` (app.js:2104-2108, também pura, mas fora da lista desta
spec — continua em `app.js`, chamando o `formatInterval` publicado no
`globalThis` pelo bridge, exatamente como chamaria uma função local hoje).

## Contrato do módulo

```js
// src/format/datetime.js
export function formatTime(ms) { … }                          // → "HH:MM:SS"
export function formatClock(timestamp) { … }                    // → "HH:MM" (pt-BR)
export function formatHistoryElapsed(timestamp, now = Date.now()) { … } // → texto relativo
export function formatInterval(totalMinutes) { … }               // → "Xh Ymin" / "Xh" / "Ymin"
```

Sem dependências de outros módulos, sem efeitos colaterais (exceto o `Date.now()`
como valor padrão de parâmetro em `formatHistoryElapsed`, que já é o
comportamento atual).

`src/bootstrap/legacy-bridge.js`:
```js
import { formatTime, formatClock, formatHistoryElapsed, formatInterval } from '../format/datetime.js';
Object.assign(globalThis, { formatTime, formatClock, formatHistoryElapsed, formatInterval });
```
(Este arquivo cresce a cada extração futura — é o único lugar que muda quando a
Fase 1.2/1.3/1.4 acontecerem.)

## Casos de borda preservados

- `formatTime`: arredondamento por `Math.ceil` de ms→segundos e clamping em 0 —
  comportamento hoje coberto indiretamente por `tests/audit.test.cjs:254-266`
  (via `formatActivityCounter`); o novo teste direto cobre os mesmos valores
  isoladamente.
- `formatHistoryElapsed`: os três limiares (`< 1 min`, `< 60 min`, `< 24h`,
  `≥ 24h`) e o plural de "dia"/"dias" — hoje coberto indiretamente pelos mesmos
  testes de `formatHistoryCounter`; o novo teste direto cobre os quatro ramos
  explicitamente.
- `formatClock` e `formatInterval`: sem teste hoje — o novo teste é cobertura
  nova, não substituição.

## Impacto em testes existentes

`tests/audit.test.cjs:250-267` precisa mudar: hoje o teste cria um
`vm.createContext({state:{...}})` e injeta `formatTime`/`formatHistoryElapsed`
via `extract()` (slice de `app.js`) junto com as três funções que continuam lá.
Depois da extração, `formatTime`/`formatHistoryElapsed` não existem mais como
texto dentro de `app.js` para o `extract()` fatiar — o teste passa a importar as
duas do módulo novo (`require('../src/format/datetime.js')`, que funciona
diretamente porque o Node ≥ 22.12 permite `require()` síncrono de ES Module —
confirmei empiricamente nesta máquina com Node 24.19.0) e injetá-las no mesmo
`vm.createContext`, mantendo o `extract()` só para as três que ainda vivem em
`app.js` (`effectiveCountingMode`, `formatHistoryCounter`,
`formatActivityCounter`). Nenhuma asserção do teste muda de valor esperado.

## Plano de teste

- `node --check src/format/datetime.js`, `node --check src/bootstrap/legacy-bridge.js`, `node --check app.js`, `node --check boot.js`, `node --check sw.js`.
- Novo `tests/format-datetime.test.cjs`: testes diretos das 4 funções via `require()`, cobrindo os casos de borda listados acima (incluindo os dois ramos hoje sem cobertura, `formatClock`/`formatInterval`).
- Atualizar `tests/audit.test.cjs:250-267` conforme "Impacto em testes existentes" acima — todas as asserções continuam iguais.
- Rodar a suíte completa (`npm test`) para confirmar que nada mais quebrou — baseline atual (após Fase 0) é 108/110, com as 2 falhas conhecidas e não relacionadas em `receiver-browser.test.cjs`.
- Teste manual: abrir a prévia local (`node scripts/dev-server.cjs`) e conferir visualmente Home (contador regressivo), Histórico (horário e "há quanto tempo") e diálogo de evento (texto de intervalo) — sem mudança de comportamento esperada, é só para confirmar que o carregamento via bridge funciona na prática, não só nos testes de Node.
- Fora desta rodada: `effectiveCountingMode`, `formatHistoryCounter`, `formatActivityCounter`, `formatElapsed` continuam em `app.js` (dependem de `state` ou de outra função que fica).
