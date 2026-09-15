# 0013 — Mover drag-and-drop para `src/ui/drink-reorder.js` e `src/ui/icon-reorder.js` (sem unificar)

Status: implementada

## Contexto

Depois de ler as duas implementações completas (não só os trechos citados
na análise original), a conclusão registrada na conversa foi: a duplicação
é de **forma**, não de **substância** — auto-scroll em eixos/alvos
diferentes (janela vs. contêiner de ícones), fantasma visual diferente
(clone do card vs. div com emoji), cálculo de alvo diferente (irmão mais
próximo por Y vs. distância 2D a slots, com zona de lixeira só no ícone),
gatilhos de cancelamento diferentes (a de ícone cancela em scroll/Esc/
segundo ponteiro; a de bebida não), tolerância de movimento fixa vs.
variável por tipo de ponteiro, e só a de ícone tem instrumentação de debug
e teclado Alt+setas. Uma fábrica genérica exigiria tantos parâmetros de
configuração que provavelmente pioraria a manutenção — decisão tomada:
**mover cada uma para seu próprio arquivo, verbatim, sem fundir lógica.**

## Decisão

### `src/ui/drink-reorder.js`

Move `beginDrinkReorder` (app.js:2242-2374) e `attachDrinkReorderGesture`
(app.js:2376-2448), **corpo idêntico ao de hoje**, envelopados numa fábrica
que recebe por parâmetro tudo que hoje são globais de `app.js`:

```js
export function createDrinkReorderController({
  state, drinkList, pressMs, moveTolerance,
  captureDrinkCardPositions, animateManualDrinkShift, persistManualDrinkOrder,
  showToast, showAppNotification, render,
}) {
  let cancelActive = null;   // hoje: cancelActiveDrinkReorder (app.js:364)
  let cancelPending = null;  // hoje: cancelPendingDrinkReorder (app.js:365)

  function beginDrinkReorder(card, icon, drink, point) { /* corpo idêntico,
    trocando DRINK_REORDER_PRESS_MS→pressMs, DRINK_REORDER_MOVE_TOLERANCE→
    moveTolerance, cancelActiveDrinkReorder→cancelActive (fechamento local) */ }
  function attachDrinkReorderGesture(card, dragSurface, icon, drink) { /* idem,
    cancelPendingDrinkReorder→cancelPending (fechamento local) */ }

  return {
    attachDrinkReorderGesture,
    cancelPending: () => cancelPending?.(),
    cancelActive: () => cancelActive?.(),
  };
}
```

**Único ajuste real** (não é "lógica nova", é a adaptação mecânica exigida
pela mudança de arquivo): `cancelActiveDrinkReorder`/`cancelPendingDrinkReorder`
eram `let` de módulo em `app.js` (linhas 364-365), lidos de dentro de
`render()` (app.js:2577,2580, função que **não** move para este arquivo).
Viram variáveis fechadas dentro da fábrica, expostas como `cancelActive()`/
`cancelPending()`. Em `app.js`:

```js
const drinkReorder = createDrinkReorderController({
  state, drinkList, pressMs: DRINK_REORDER_PRESS_MS, moveTolerance: DRINK_REORDER_MOVE_TOLERANCE,
  captureDrinkCardPositions, animateManualDrinkShift, persistManualDrinkOrder,
  showToast, showAppNotification, render,
});
```

E em `render()` (app.js:2577,2580 e onde `attachDrinkReorderGesture` é
chamada dentro do loop de cards):
```js
if (state.pendingDrinkReorderId) drinkReorder.cancelPending();
if (state.draggingDrinkId) { drinkReorder.cancelActive(); return; }
...
if (manualIds.has(drink.id)) drinkReorder.attachDrinkReorderGesture(card, mainButton, icon, drink);
```

`captureDrinkCardPositions`, `animateManualDrinkShift`, `animateDrinkReorder`,
`persistManualDrinkOrder` **continuam em `app.js`** — `animateDrinkReorder`
também é usada por `registerDrinkAt` (fora do contexto de drag), então não
faz sentido movê-la junto.

### `src/ui/icon-reorder.js`

Move `attachIconGestures` (app.js:3682-3774), `iconTouchPoint`
(app.js:3776-3781) e `beginIconDrag` (app.js:3783-3930), mesmo princípio:

```js
export function createIconReorderController({
  state, iconOptions, drinkDialog, getEditingIconCatalog, commitIconMove, removeCatalogIcon,
}) {
  let cancelIconDrag = null; // hoje: cancelIconDrag (app.js:3628), com 6 pontos de leitura/escrita

  function iconTouchPoint(touch, event) { /* idêntico */ }
  function beginIconDrag(wrapper, handle, icon, event) { /* idêntico,
    cancelIconDrag vira a variável fechada acima */ }
  function attachIconGestures(wrapper, input, icon) { /* idêntico,
    editingIconCatalog → getEditingIconCatalog() nos 2 pontos de leitura */ }

  return { attachIconGestures, cancel: () => cancelIconDrag?.() };
}
```

`cancelIconDrag` hoje é lido em 3 lugares **fora** das funções movidas —
`closeDrinkDialog` (app.js:3157), `toggleIconDeletion` (app.js:3631),
`buildIconPicker` (app.js:3937) — os três viram `iconReorder.cancel()`.
`editingIconCatalog` (app.js:3626, `let` de módulo) continua em `app.js`
porque só `toggleIconDeletion` a escreve; o módulo novo só precisa **ler**,
por isso recebe um getter (`getEditingIconCatalog: () => editingIconCatalog`)
em vez de a variável crua (que não atravessaria o módulo por referência).

`commitIconMove`, `removeCatalogIcon` continuam em `app.js` (fazem parte do
CRUD do catálogo, não do gesto em si).

## O que não muda

O corpo de cada função é copiado sem alterar uma linha de lógica — só os
identificadores que hoje resolvem via escopo de script clássico compartilhado
passam a vir de parâmetros da fábrica. Todo comportamento (auto-scroll,
FLIP, zona de lixeira, atalhos de teclado, instrumentação de debug,
tolerâncias, gatilhos de cancelamento) fica **exatamente** como está hoje
em ambos os gestos — nenhuma das diferenças catalogadas no Contexto é
tocada ou uniformizada.

## Plano de teste — o mais importante desta spec

Não crio testes unitários novos para a lógica do gesto em si (arrastar com
`vm.createContext` teria que fakear ponteiros/toques/animação/scroll a um
nível que não agregaria confiança real). A rede de segurança é:

- `node --check app.js`, `node --check src/ui/drink-reorder.js`, `node --check src/ui/icon-reorder.js`, `node --check src/bootstrap/legacy-bridge.js`.
- `npm test` completo — **em especial** `tests/drink-reorder-browser.test.cjs` e `tests/icon-reorder-browser.test.cjs`, que já existem e exercitam esses gestos de ponta a ponta via Playwright (pointer/touch simulados, teclado, cancelamento). Rodar cada um isoladamente antes e depois da mudança para comparar.
- Baseline atual (pós Fase 3.3) é 155/158 (2 falhas conhecidas + a flakiness já documentada de `upside-down-browser.test.cjs`).
- **Teste manual seu, obrigatório antes de fechar esta spec**: arrastar para reordenar bebidas (toque longo, mover, soltar, cancelar saindo da tela/trocando de app); arrastar um ícone no catálogo (mover para outra posição, soltar na lixeira, cancelar com Esc, mover com Alt+setas). Esta é a spec de maior risco de todo o plano — não marco como implementada sem essa confirmação.
- Fora desta rodada: qualquer unificação futura das duas lógicas — descartada pela análise acima, não fica como pendência.
