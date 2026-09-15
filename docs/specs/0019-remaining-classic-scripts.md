# 0019 — Converter os scripts clássicos restantes para módulos ES (Fase 8)

Status: aprovada (implementação em andamento, por sub-fase)

## Nota de escopo: `occasions.js` fica de fora

O plano aprovado (Fase 8) lista 7 arquivos, não 8 — `occasions.js` nunca esteve na lista.
Investiguei mesmo assim por precaução, e o achado confirma que ele deve continuar de
fora: já é uma IIFE isolada que só toca fora de si mesma via
`globalThis.FunTimeOccasions = api` (`occasions.js:100`) e `module.exports = api`
condicionalmente (`occasions.js:101`) — um padrão dual browser/CommonJS que já funciona
hoje. Três testes (`tests/occasions.test.cjs`, `tests/agenda.test.cjs`,
`tests/audit.test.cjs:12`) fazem `require('../occasions.js')`; adicionar `export` de
verdade quebraria os três com `SyntaxError` sem nenhum ganho arquitetural — o arquivo já
não vaza nada indevido, não tem acoplamento a corrigir. Fica como está.

## Contexto

Depois da spec 0017 (`app.js` virou módulo ES) e da 0018 (remoção da V1), restam 7
scripts clássicos: `occasions.js` (fora, ver acima), `policies.js`, `ui.js`,
`emoji-data.js`, `touch-debug.js`, `reset.js`, `occasions-ui.js`, `navigation.js`,
carregados nesta ordem por `boot.js` (`loadApp()`): `occasions.js`, `policies.js`,
`ui.js`, `emoji-data.js`, `touch-debug.js`, **`app.js` (módulo)**, `reset.js`,
`occasions-ui.js`, `navigation.js`.

Investigação completa (agente de exploração, arquivo:linha de cada dependência) mapeou
três coisas que faltavam da spec 0017: o grafo de dependências **entre** os 7 arquivos
(não só com `app.js`), os `let` reatribuídos que precisam de getter/setter (não só
getter), e todo teste que carrega um desses arquivos inteiro via `vm.runInContext`/
`require()` — a categoria que causou a rodada extra de correções na spec 0017.

**Grafo de dependência cruzada confirmado** (além do que cada um lê de `app.js`, já
publicado via `Object.assign(globalThis,{...})` em `app.js:4290-4308`):

```
ui.js  ──(initializeDateTimeEditor, beginFormDraft, updateFormDraft, showAppConfirmation)──▶  occasions-ui.js
reset.js ──(closeDataReset, resetPending, returnToResetPreview)──▶  navigation.js
occasions-ui.js ──(openOccasionView)──▶  navigation.js
```

`policies.js`, `emoji-data.js`, `touch-debug.js` não têm nenhuma dependência cruzada com
os outros 6. Isso confirma que a ordem já sugerida no plano (8.1 → 8.5) respeita o grafo
real — cada arquivo intermediário já está convertido (ou publica em `globalThis`) antes
de quem precisa dele na etapa seguinte.

**Achado que exige correção, não só extração** — `app.js:2723`:
```js
if (globalThis.reconcileOccasions && !reconcileOccasions()) return;
```
Testa a existência com `globalThis.` mas chama a função solta. Funciona hoje só porque
`reconcileOccasions` (função de nível de topo de script clássico) automaticamente também
é propriedade global. Quando `occasions-ui.js` virar módulo, isso pararia de dar
`ReferenceError` (`globalThis.reconcileOccasions` seria `undefined`, então o `if` nunca
entra) e passaria a **pular a reconciliação silenciosamente** — uma regressão funcional
sem erro visível. Corrigido para `globalThis.reconcileOccasions?.()` de forma consistente
nesta spec, não deixado como está.

## Decisão — ordem e o que cada arquivo ganha

Mantida a ordem do plano: 8.1 `emoji-data.js`+`touch-debug.js` → 8.2 `policies.js`+
`ui.js` → 8.3 `reset.js` → 8.4 `occasions-ui.js` → 8.5 `navigation.js`. Cada sub-fase é
um commit próprio, com `npm test` completo entre elas.

Regra geral: cada arquivo que vira módulo e ainda é lido solto por um arquivo
**ainda clássico** na sub-fase seguinte publica esses identificadores em `globalThis`
(mesmo padrão do `Object.assign` de `app.js`, só que por arquivo). `let`s reatribuídos
usam `Object.defineProperty` — **getter só** quando ninguém escreve de fora, **getter e
setter** quando um teste/consumidor externo escreve.

### 8.1 — `emoji-data.js`, `touch-debug.js`

- **`emoji-data.js`**: único consumidor de produção é `app.js` (`app.js:3642,3644,3696`,
  soltos). Ganha `export const EMOJI_GROUPS = [...]`; `app.js` troca as 3 leituras
  soltas por `import { EMOJI_GROUPS } from "./emoji-data.js";` no topo. Sem necessidade
  de publicar em `globalThis` — ninguém mais precisa ler solto.
- **`touch-debug.js`**: já publica `globalThis.FunTimeTouchDebug = Object.freeze({
  record })` (`touch-debug.js:52`), consumido só via `globalThis.` prefixado
  (`src/ui/icon-reorder.js`, 9 ocorrências) — nenhuma mistura de padrão. **Não ganha
  `export`** — não há nada para outro módulo importar por nome; só o `<script>` em
  `boot.js` passa a `type="module"`. Conteúdo do arquivo fica idêntico.

### 8.2 — `policies.js`, `ui.js`

- **`policies.js`**: ganha `export function hasCurrentTermsAcceptance` e
  `export function requireTermsAcceptance`, mais `globalThis.hasCurrentTermsAcceptance
  = hasCurrentTermsAcceptance; globalThis.requireTermsAcceptance =
  requireTermsAcceptance;` (consumidor: `app.js:4252`, ainda lido solto). `TERMS_VERSION`/
  `TERMS_STORAGE_KEY`/`TERMS_DRAFT_KEY` continuam `const` internas, sem publicar (só
  usadas dentro do próprio arquivo).
- **`ui.js`**: ganha `export` para os 4 identificadores que `occasions-ui.js` ainda lê
  solto (`initializeDateTimeEditor`, `beginFormDraft`, `updateFormDraft`,
  `showAppConfirmation`) — mas como `occasions-ui.js` só converte na 8.4, `ui.js`
  **também** publica os 4 em `globalThis` nesta sub-fase (bridge temporária, igual ao
  padrão de app.js). `ui.js` continua lendo `createWheelPicker`/`setWheelPickerValue`
  via `globalThis.` de `app.js` (já publicado, sem mudança).

### 8.3 — `reset.js`

Ganha `export` para as funções que `navigation.js` ainda lê solto
(`closeDataReset`, `returnToResetPreview`) e `export let resetPending` — mas
`navigation.js` só converte na 8.5, então `reset.js` também publica em `globalThis`:
`closeDataReset`, `returnToResetPreview`, e `resetPending` via
`Object.defineProperty(globalThis, "resetPending", { get: () => resetPending,
configurable: true })` (getter só — nenhum consumidor externo **escreve** nela, só lê:
`navigation.js:50`, `tests/navigation-browser.test.cjs:95,96,98`).

`tests/reset.test.cjs` precisa de redesenho, não só ajuste — hoje carrega o arquivo
inteiro via `vm.runInContext(fs.readFileSync('reset.js',...))` e depois **reatribui**
`resetPending` de fora com uma segunda chamada `vm.runInContext('resetPending={...}',
c)` no mesmo contexto (linha 16). Isso deixa de fazer sentido com sintaxe de módulo.
Novo design: o teste importa o módulo real (`await import('../reset.js')`, arquivo tem
extensão `.js` mas fica fora de `src/` — mesma técnica de "stdin"/contexto isolado que
`app.js` usa, avaliada caso a caso) e passa o estado inicial de `resetPending` por
parâmetro às funções expostas (`openDataReset`, `submitDataReset`) em vez de setar a
variável do módulo diretamente. Se não houver um jeito limpo de injetar o estado inicial
sem tocar na variável do módulo, a alternativa é expor um `export function
setResetPendingForTest(value)` compilado só para teste (nome explícito, comentário
dizendo que é exclusivo de teste) — decisão final na implementação, dependendo do que
sair mais simples ao mexer no código de verdade.

### 8.4 — `occasions-ui.js`

Ganha `export` para `openOccasionView` (lido por `navigation.js:60`) e
`reconcileOccasions` (corrigindo o caso misto de `app.js:2723`) — publicados também em
`globalThis` (bridge para `navigation.js`, que só converte na 8.5, e para o próprio
`app.js`, que já lê via `globalThis.` hoje).

`occasionRetryAt` (`let`) precisa de **getter e setter** — diferente de
`editingIconCatalog` (spec 0017, só getter) porque
`tests/occasions-browser.test.cjs:161` **escreve** nela de fora
(`page.evaluate(() => { occasionRetryAt = 0; })`):
```js
Object.defineProperty(globalThis, "occasionRetryAt", {
  get: () => occasionRetryAt,
  set: (value) => { occasionRetryAt = value; },
  configurable: true,
});
```

Nenhum teste carrega `occasions-ui.js` inteiro via `vm`/`require` — só
`tests/occasions-browser.test.cjs`, via `page.evaluate` em navegador real, onde a
sintaxe de módulo do arquivo-fonte é irrelevante (o navegador só olha o
`<script type="module">`). Sem risco de quebra de sintaxe aqui.

### 8.5 — `navigation.js` (por último, mais acoplado)

Lê de `reset.js` (`closeDataReset`, `returnToResetPreview`, `resetPending`) e
`occasions-ui.js` (`openOccasionView`) — ambos já módulos com `export` real a essa
altura. `navigation.js` pode trocar as leituras soltas por `import` de verdade
(`import { closeDataReset, returnToResetPreview, resetPending } from "./reset.js";
import { openOccasionView } from "./occasions-ui.js";`), preferível ao `globalThis.`
porque ganha binding ao vivo nativo do ES module para `resetPending` (sem precisar do
getter) e é o padrão mais idiomático agora que os dois já são módulos — os shims em
`globalThis` continuam existindo de qualquer forma (usados por
`tests/navigation-browser.test.cjs`'s `page.evaluate`, que roda em contexto de página,
nunca por `import`).

`navigation.js` não precisa publicar nada de novo — `globalThis.FunTimeNavigation` já é
consumido corretamente com prefixo por `app.js:1854`.

Nenhum teste carrega `navigation.js` inteiro via `vm`/`require` — só via navegador real
em `tests/navigation-browser.test.cjs`.

## Casos de borda a preservar

1. **Execução de nível de topo que já existe hoje continua idêntica**: `ui.js:19`
   (`initializeAppDialogs()`), `occasions-ui.js:371` (`refreshOccasionContext();
   refreshOccasionFilters(); setCurrentView(state.currentView); reconcileOccasions();`),
   `navigation.js:17,112` (`write('replaceState', depth); ... sync();`) — nenhum desses
   muda de comportamento, só de mecanismo de acesso às dependências externas.
2. **`resetPending`/`occasionRetryAt` como getter/setter**: testável abrindo o diálogo
   de reset e o de evento, navegando pelo botão Voltar do navegador em cada um — já
   coberto por `tests/navigation-browser.test.cjs`/`tests/occasions-browser.test.cjs`.
3. **`app.js:2723`**: reconciliação de ocasiões precisa continuar rodando normalmente ao
   abrir a Home — testável abrindo o app com um evento agendado pendente.

## Plano de teste

- `node --check` de cada arquivo tocado (todos continuam CommonJS-compatíveis pro
  Node, exceto se ganharem `export` — nesse caso, mesma técnica de
  `node --input-type=module --check < arquivo.js` usada para `app.js` desde a spec 0017).
- Testes que precisam de ajuste, por sub-fase: `tests/audit.test.cjs` (2 blocos —
  `policies.js` e `emoji-data.js` deixam de carregar o arquivo inteiro via
  `vm.runInContext`, passam a usar `extract()`/`import()` conforme o caso),
  `tests/reset.test.cjs` (redesenho, ver 8.3), `tests/touch-debug.test.cjs` (sem
  mudança — `touch-debug.js` não ganha `export`).
- `npm test` completo depois de cada sub-fase (não só no final) — o histórico desta
  sessão mostra que problemas aparecem em combinações não óbvias (ex.: o botão "Começar
  sem dados" removido na spec 0018 que travou 11 testes sem timeout).
- Teste manual depois da 8.5 (a mais arriscada, mexe em `navigation.js`): abrir/fechar
  diálogos pelo botão Voltar, incluindo o de reset e o de evento; abrir a agenda de
  eventos; usar "Restaurar ícones padrão"/"Apagar bebidas" nas configurações.
- Fora desta rodada: `occasions.js` (ver nota de escopo no topo); Fase 9 (remover o
  `Object.assign(globalThis,{...})` de `app.js`, que só fica órfão depois desta spec
  terminar) fica para uma spec própria seguinte.
