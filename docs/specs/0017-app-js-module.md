# 0017 — `app.js` vira módulo ES; remove `legacy-bridge.js`

Status: implementada

## Contexto

Fase mais delicada do plano — só chegamos aqui depois de 16 extrações
(specs 0001-0016) validarem o padrão de ponte na prática. Fiz um
levantamento completo (via agente de exploração, com teste empírico real
no Chrome replicando o mecanismo de `loadScript()` do `boot.js`) de toda
dependência de identificador "solto" entre `app.js` e os scripts clássicos
que ainda o cercam. Achado técnico confirmado empiricamente:

- Um `<script type="module">` carregado **depois** de um script clássico
  continua enxergando os `let`/`const`/`function` de nível de topo desse
  script clássico como identificador solto (o ambiente léxico global
  compartilhado continua sendo o escopo externo de qualquer module do
  mesmo realm).
- Um script clássico carregado **depois** de um module **não** enxerga
  nada do module — dá `ReferenceError`.

**Consequência:** quando `app.js` virar module, `occasions-ui.js`,
`reset.js`, `navigation.js` e `ui.js` (que carregam depois dele e hoje leem
identificadores soltos de `app.js`) vão quebrar — são o problema real desta
spec. Já a direção inversa (`app.js` lendo `reconcileOccasions`/
`beginFormDraft`/`showAppConfirmation`/`requireTermsAcceptance`/
`EMOJI_GROUPS`, declarados em `occasions-ui.js`/`ui.js`/`policies.js`/
`emoji-data.js`) **não quebra**, porque esses arquivos continuam scripts
clássicos nesta fase — confirmado empiricamente, não só suposto.

**Achado extra que simplifica o plano original:** nenhum dos quatro
arquivos (`occasions-ui.js`, `reset.js`, `navigation.js`, `ui.js`) lê hoje
nenhuma das 17 funções que `src/bootstrap/legacy-bridge.js` publica em
`globalThis` (`formatTime`, `wireDialogDismissal`, `createDurationPicker`
etc.) — só `app.js` as consumia. Ou seja: assim que `app.js` importar
essas 17 diretamente de `src/`, **`legacy-bridge.js` fica sem nenhum
consumidor** e pode ser removido nesta mesma spec, em vez de esperar a
Fase 9.

## Decisão

### 1. `app.js` ganha os imports que hoje vêm da ponte

No topo de `app.js`:
```js
import { formatTime, formatClock, formatHistoryElapsed, formatInterval } from "./src/format/datetime.js";
import { resolveCountingMode } from "./src/format/counting-mode.js";
import { derEcdsaSignatureToRaw } from "./src/security/webauthn-signature.js";
import { derivePinHash, PIN_PBKDF2_ITERATIONS } from "./src/security/pin-crypto.js";
import { commit as commitAppData } from "./src/data/store.js";
import { wireDialogDismissal } from "./src/ui/dialogs.js";
import { createDurationPicker } from "./src/ui/wheel-picker.js";
import { createFieldErrorController, createFormErrorController } from "./src/ui/field-errors.js";
import { createDrinkReorderController } from "./src/ui/drink-reorder.js";
import { createIconReorderController } from "./src/ui/icon-reorder.js";
import { initEasterEggs } from "./src/easter-eggs/index.js";
import { validateDrinkDraft } from "./src/drinks/validate.js";
```
(Todos os call sites internos continuam iguais — só a origem do símbolo muda de "publicado em `globalThis` por outro script" para "importado diretamente".)

### 2. `app.js` publica em `globalThis` os 48 identificadores que os outros 4 arquivos leem dele

Levantamento completo (repartição: 14 para `occasions-ui.js`, 22 para
`reset.js`, 18 para `navigation.js`, 2 para `ui.js`, com sobreposições já
removidas):

```
state, DATA_STORAGE_KEY, buildCurrentAppData, refreshDataViews, showToast,
showAppNotification, setCurrentView, createId, closeHistoryView,
openHistoryView, renderHistory, getEventDrinkIdentity, toLocalDateInputValue,
toLocalTimeInputValue, PICKER_ICONS, SECURITY_STORAGE_KEY, hideToast,
applyInterfacePreferences, updateDataSettingsUI, LEGACY_DRINKS_STORAGE_KEY,
SHARE_IMPORT_CACHE_NAME, SECURITY_SESSION_KEY, getDefaultSecurityConfig,
getConfiguredPinLength, getPinLockoutRemainingMs, normalizePinInput,
verifyPin, PIN_LOCKOUT_ATTEMPTS, PIN_LOCKOUT_MS, verifyDeviceCredential,
openSecurityMethodDialog, closeDrinkDialog, closeDeleteDrinkDialog,
closeDrinkMenuDialog, closeStopCountdownDialog, closeIntervalWarningDialog,
closeLogDialog, closeDoseSizeDialog, closeEventDialog, closeDrinkImportDialog,
closeBackupRestoreDialog, closeSecurityMethodDialog, closePinSetupDialog,
iconOptions, openSettingsView, createWheelPicker, setWheelPickerValue
```
(47 itens — `editingIconCatalog` tratado à parte abaixo.)

No final de `app.js`:
```js
Object.assign(globalThis, {
  state, DATA_STORAGE_KEY, buildCurrentAppData, refreshDataViews, showToast,
  showAppNotification, setCurrentView, createId, closeHistoryView, openHistoryView,
  renderHistory, getEventDrinkIdentity, toLocalDateInputValue, toLocalTimeInputValue,
  PICKER_ICONS, SECURITY_STORAGE_KEY, hideToast, applyInterfacePreferences,
  updateDataSettingsUI, LEGACY_DRINKS_STORAGE_KEY, SHARE_IMPORT_CACHE_NAME,
  SECURITY_SESSION_KEY, getDefaultSecurityConfig, getConfiguredPinLength,
  getPinLockoutRemainingMs, normalizePinInput, verifyPin, PIN_LOCKOUT_ATTEMPTS,
  PIN_LOCKOUT_MS, verifyDeviceCredential, openSecurityMethodDialog, closeDrinkDialog,
  closeDeleteDrinkDialog, closeDrinkMenuDialog, closeStopCountdownDialog,
  closeIntervalWarningDialog, closeLogDialog, closeDoseSizeDialog, closeEventDialog,
  closeDrinkImportDialog, closeBackupRestoreDialog, closeSecurityMethodDialog,
  closePinSetupDialog, iconOptions, openSettingsView, createWheelPicker, setWheelPickerValue,
  getEditingIconCatalog: () => editingIconCatalog,
});
```

**Caso especial — `editingIconCatalog`:** é o único `let` de nível de topo
**reatribuído em runtime** entre os 48 (os demais são `function`, referência
estável, ou `const`). Publicar por valor (`Object.assign(globalThis,
{editingIconCatalog})`) congelaria o valor no instante da publicação. Uso
o mesmo padrão getter que `app.js` já usa hoje para o próprio
`src/ui/icon-reorder.js` (`getEditingIconCatalog: () => editingIconCatalog`,
já existente em app.js). `navigation.js:47` troca a leitura de
`editingIconCatalog` por `globalThis.getEditingIconCatalog()`.

### 3. `boot.js`: `app.js` vira module, `legacy-bridge.js` sai da lista

```js
for (const src of ["./occasions.js", "./policies.js", "./ui.js", "./emoji-data.js", "./touch-debug.js", "./app.js", "./reset.js", "./occasions-ui.js", "./navigation.js"]) {
  await loadScript(src, { module: src.endsWith("app.js") });
}
```
(Remove `"./src/bootstrap/legacy-bridge.js"` da lista; `app.js` passa a ser
o único `{ module: true }`.)

### 4. Remoção de `src/bootstrap/legacy-bridge.js`

Arquivo apagado (confirmado sem consumidores depois do item 1). `sw.js`
perde a entrada correspondente do `APP_SHELL`.

## O que não muda

Todo o comportamento observável — a ordem de carregamento continua a
mesma (só o mecanismo interno de "como" os símbolos circulam muda), o
formato de dados salvo não muda, nenhuma lógica de negócio é tocada.

## Correção após a implementação: o levantamento original era incompleto

O levantamento inicial (48 identificadores) só cobriu o que `occasions-ui.js`,
`reset.js`, `navigation.js` e `ui.js` leem de `app.js`. Ele **não** cobriu uma
categoria inteira de consumidor: os próprios arquivos `tests/*-browser.test.cjs`,
que chamam dezenas de funções de `app.js` diretamente via
`page.evaluate(() => algumaFuncao(...))`, executando no navegador real — exatamente
a mesma categoria de dependência que já tinha exigido o shim de `saveData()` na
spec 0009, mas que desta vez afetava ~40 identificadores adicionais, não só um.

Descobri isso rodando a suíte completa depois da implementação inicial: 21 testes
falharam com `ReferenceError`. Corrigi de forma iterativa (rodar → ler o erro →
publicar o identificador → rodar de novo) até esgotar os `ReferenceError`, e depois
fechei o levantamento com um agente de exploração dedicado a vasculhar todo
`page.evaluate`/`vm.runInContext` de todo `tests/*.test.cjs` em busca do que
sobrava. **Lista final: 88 identificadores no `Object.assign`, mais dois casos
especiais tratados à parte:**

1. **`editingIconCatalog`** — além do `getEditingIconCatalog` (função, para o uso
   interno de `navigation.js`), `tests/navigation-browser.test.cjs` lê o valor
   **solto** (`page.evaluate(() => editingIconCatalog)`) para conferir o estado
   depois de um toggle. Como é um `let` reatribuído em runtime, uma cópia por
   valor no `Object.assign` ficaria congelada — resolvido com
   `Object.defineProperty(globalThis, "editingIconCatalog", { get: () => editingIconCatalog, configurable: true })`,
   logo depois do `Object.assign`.

2. **`derivePinHash`** — não é declarado em `app.js`, é importado de
   `src/security/pin-crypto.js`. `tests/navigation-browser.test.cjs` sobrescreve
   esse identificador (`derivePinHash = () => new Promise(...)`) para controlar o
   tempo de uma verificação de PIN simuladamente lenta — técnica que já existia
   antes da Fase 7 e dependia de `derivePinHash` ser uma propriedade gravável do
   objeto global (verdade quando `app.js` era script clássico). Um binding de
   `import` é somente-leitura e não pode ser reatribuído, e publicar o valor uma
   vez em `globalThis` não adianta sozinho — os dois call sites internos
   (`configurePinSecurity`, `verifyPin`) continuariam resolvendo para o binding do
   import, nunca para o mock do teste. Isso exigiu uma mudança real de código-fonte
   (não só de exportação): os dois call sites passaram a chamar
   `(globalThis.derivePinHash || derivePinHash)(...)` em vez de `derivePinHash(...)`
   direto — em produção `globalThis.derivePinHash` nunca é definido, então sempre
   cai no import real; só o teste, que define `globalThis.derivePinHash`
   explicitamente, consegue interceptar.

Nenhum dos 25 arquivos `vm.createContext`/`vm.runInContext` (os que usam
`extract()` para fatiar uma função nomeada) precisou de ajuste — eles já injetam
manualmente, no próprio `vm.createContext({...})`, tudo que a função extraída
referencia (incluía isso desde antes desta spec).

## Casos de borda a validar com cuidado

1. **Ordem de execução do módulo**: `app.js`-como-module ainda executa de
   forma síncrona quando `loadScript()` insere o `<script type="module">`
   e aguarda `onload` (confirmado no padrão já usado para
   `legacy-bridge.js` desde a spec 0001) — mas agora é o próprio `app.js`
   que carrega o grafo de 12 imports antes de rodar seu próprio corpo. Se
   qualquer import falhar (404, erro de sintaxe), o boot inteiro falha com
   a mesma mensagem de erro já tratada por `loadScript()`.
2. **`editingIconCatalog`** via getter, não valor — testável abrindo o
   catálogo de ícones, ativando "editar", saindo do diálogo pelo botão
   Voltar (fluxo que `navigation.js:47` cobre).
3. Todos os 12 `closeXDialog` publicados precisam continuar fechando o
   diálogo certo pelo botão Voltar/Esc — já coberto por
   `tests/navigation-browser.test.cjs`.
4. Fluxo de segurança completo (PIN, biometria, bloqueio por tentativas)
   depende de 10 dos 48 identificadores (`verifyPin`,
   `verifyDeviceCredential`, `getConfiguredPinLength`, etc.) — já coberto
   por `tests/reset.test.cjs`/`tests/countdown-menu-browser.test.cjs`.
5. Reset completo de dados depende de 22 identificadores (a maior fatia) —
   já coberto por `tests/reset.test.cjs`.

## Plano de teste

- **`app.js` precisa de um comando de checagem diferente a partir de agora**:
  `node --check app.js` falha, porque o `package.json` da raiz é
  `"type": "commonjs"` (necessário para o `require()` dos outros arquivos nos
  testes) e `app.js` agora tem `import` de nível de topo. `node --check` não
  aceita `--input-type=module` junto de um argumento de arquivo — a forma que
  funciona é alimentar o conteúdo via stdin, sem argumento de arquivo:
  `node --input-type=module --check < app.js`. Confirmei que isso faz só
  checagem de sintaxe (não tenta resolver os imports de verdade), o que já
  era esperado — **por isso a suíte de navegador é a validação real desta
  spec, não o `node --check`**: um `ReferenceError` de identificador
  publicado errado só aparece em runtime real de navegador, nunca em
  checagem de sintaxe. `src/README.md` já documenta esse comando nas
  convenções da pasta.
- `npm test` completo — atenção especial a **todos** os testes
  `*-browser.test.cjs` (não só um subconjunto), já que esta spec toca a
  cadeia de carregamento que todos eles exercitam implicitamente.
  Baseline atual (pós v2.1.37) é 167/169, com as 2 falhas conhecidas em
  `receiver-browser.test.cjs`.
- Os testes que usam `fs.readFileSync('app.js')` + `extract()`/
  `vm.runInContext` (`tests/audit.test.cjs`, `tests/drinks-mutations.test.cjs`,
  `tests/render-tick-browser.test.cjs` via chamada direta) **podem
  quebrar** só por `app.js` ganhar `import`/`export` de nível de topo —
  `vm.runInContext` não entende sintaxe de module. Vou confirmar e, se for
  o caso, ajustar a extração desses testes (o texto fatiado de uma função
  individual não deveria conter a linha de `import`, mas preciso validar).
- Smoke test cobrindo pelo menos um fluxo de cada um dos 4 arquivos
  afetados: abrir/fechar um diálogo (navigation), reset de dados (reset),
  abrir agenda de eventos (occasions-ui), editor de data/hora (ui.js).
- Teste manual seu obrigatório antes de fechar — esta spec tem o maior
  raio de impacto potencial de todo o plano (a cadeia de boot inteira).
  Peço um teste geral: abrir o app do zero (dados novos), cadastrar e
  anotar uma bebida, abrir histórico, configurar PIN, abrir e fechar
  vários diálogos, testar o fluxo de eventos se usar essa função.
- Fora desta rodada: Fase 8 (converter `occasions-ui.js`/`reset.js`/
  `navigation.js`/`ui.js` para módulos também) — deliberadamente adiada;
  eles continuam scripts clássicos, agora lendo `app.js` via `globalThis`
  em vez de identificador solto.
