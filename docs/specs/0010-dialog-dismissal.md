# 0010 — Extrair `wireDialogDismissal` para `src/ui/dialogs.js`

Status: implementada

## Contexto

Início da Fase 3 (helpers de UI genéricos) — primeiro item de baixo risco,
sem mudança de comportamento visível, sem tocar em persistência de dados.

Hoje `app.js` tem, no bloco de listeners de nível de módulo (app.js:4595-4667):
- **11 dialogs** com um listener de `"click"` idêntico em estrutura,
  chamando `closeDialogOnBackdrop(dialog, event, closeFn)` (a função
  auxiliar, já genérica, em app.js:4272-4281) para fechar só quando o
  clique foi fora da área do `<dialog>` (no backdrop nativo).
- **7 desses 11** também têm um listener de `"cancel"` (Esc) idêntico:
  `event.preventDefault(); closeFn();`.

Lista completa (dialog → função de fechar → tem `cancel`?):

| Dialog | Fecha com | `cancel`? |
|---|---|---|
| `drinkDialog` | `closeDrinkDialog` | não |
| `deleteDrinkDialog` | `closeDeleteDrinkDialog` | sim |
| `intervalWarningDialog` | `closeIntervalWarningDialog` | não |
| `drinkMenuDialog` | `closeDrinkMenuDialog` | sim |
| `logDialog` | `closeLogDialog` | não |
| `doseSizeDialog` | `closeDoseSizeDialog` | sim |
| `eventDialog` | `closeEventDialog` | não |
| `drinkImportDialog` | `closeDrinkImportDialog` | sim |
| `backupRestoreDialog` | `closeBackupRestoreDialog` | sim |
| `securityMethodDialog` | `closeSecurityMethodDialog` | sim |
| `pinSetupDialog` | `closePinSetupDialog` | sim |

Os 4 sem `cancel` não têm handler nenhum hoje — Esc fecha o `<dialog>`
nativamente sem rodar a função de fechamento específica (efeito colateral:
estado auxiliar da tela, tipo `state.editingDrinkId`, pode não ser limpo).
Não é bug desta spec corrigir isso — só preservo o comportamento atual
exatamente, dialog por dialog.

## Decisão

`src/ui/dialogs.js`:

```js
export function wireDialogDismissal(dialog, close, { cancel = false } = {}) {
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) close();
  });
  if (cancel) {
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
  }
}
```

Cada um dos 22 listeners atuais (11 click + 7 cancel, alguns dialogs
reaproveitando `() => closeXDialog()` por causa de parâmetros default)
viram uma chamada só:

```js
// antes (app.js:4599-4606)
deleteDrinkDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(deleteDrinkDialog, event, () => closeDeleteDrinkDialog());
});
deleteDrinkDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDeleteDrinkDialog();
});

// depois
wireDialogDismissal(deleteDrinkDialog, () => closeDeleteDrinkDialog(), { cancel: true });
```

`closeDialogOnBackdrop` (app.js:4272-4281) é removida depois — confirmei
que só é usada nesses 11 call sites, nenhum teste a referencia por nome.
`wireDialogDismissal` é publicada em `globalThis` pelo
`legacy-bridge.js`, como as extrações anteriores.

**O que não muda:** os 4 dialogs sem `cancel` continuam sem handler de
`cancel` (não vira `{cancel: true}` para eles); a detecção de "clique fora"
usa exatamente a mesma matemática de `getBoundingClientRect()`.

## Observação à parte (não corrigida nesta spec)

Ao validar manualmente, descobri que `getBoundingClientRect()` de vários
`<dialog>` (incluindo `security-method-dialog`, que não tem nenhuma regra
de largura 100%) reporta o viewport inteiro (390×844) num teste headless a
390px de largura, em vez do box menor que a classe `.dialog` deveria
produzir (`width: min(calc(100% - 24px), 520px)`). Isso faz o clique no
backdrop nunca satisfazer a condição de "fora" — o clique de backdrop não
fecha o diálogo nesse viewport. **Não é uma regressão desta spec**: a
matemática de `wireDialogDismissal` é textualmente idêntica à de
`closeDialogOnBackdrop`, então o comportamento é o mesmo antes e depois —
só nunca tinha sido exercitado por um teste de clique de backdrop
antes. Vale investigar separadamente se isso é esperado (talvez intencional
em telas pequenas) ou um bug de CSS/dialog pré-existente; não é código
tocado por esta spec.

## Plano de teste

- `node --check app.js`, `node --check src/ui/dialogs.js`, `node --check src/bootstrap/legacy-bridge.js`.
- Novo `tests/ui-dialogs.test.cjs`: testa `wireDialogDismissal` isoladamente com um `dialog`/`event` fake — clique dentro não fecha, clique fora fecha, `cancel` só dispara quando `{cancel:true}`, `event.preventDefault()` é chamado no cancel.
- Rodar `npm test` completo; baseline atual (pós Fase 2) é 144/146, com as 2 falhas conhecidas em `receiver-browser.test.cjs`. Atenção a `navigation-browser.test.cjs` e `countdown-menu-browser.test.cjs`, que testam fechamento de diálogos via Escape/backdrop.
- Smoke check de navegador: abrir e fechar 2-3 diálogos diferentes clicando fora e pressionando Esc.
- Fora desta rodada: os outros helpers da Fase 3 (`wheel-picker`, `field-errors`, drag-and-drop).
