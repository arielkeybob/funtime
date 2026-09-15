# 0008 — Mais 3 pontos com o mesmo bug de ordenação (achados numa auditoria mais rigorosa)

Status: implementada

## Contexto

Depois de fechar a spec 0007, resolvi conferir **todas** as atribuições
diretas a `state.drinks`/`state.events`/`state.preferences` no arquivo
inteiro (não só os pontos que a análise original já tinha listado), para
garantir que a lista de "15 pontos" estava completa. Não estava: encontrei
mais 3 funções com exatamente o mesmo padrão de bug da spec 0007 (mutam
antes de gravar, sem try/catch), que tinham escapado por serem chamadoras
de `saveData()` que eu não tinha auditado uma a uma:

| Função | Linhas atuais | O que muta antes de `saveData()` |
|---|---|---|
| `choosePendingDoseSize` | app.js:2949-2961 | `event.doseSize = ...` — **mutação em place** de um objeto já dentro de `state.events` (mesma classe de bug do `handleDrinkSubmit` da spec 0007) |
| `undoLastRegistration` | app.js:2974-2982 | `state.events = state.events.filter(...)` reatribuído antes de `saveData()` |
| toggle "interface limpa" (`cleanInterfaceInput` change) | app.js:4461-4466 | `state.preferences.cleanInterface = ...` mutado em place antes de `saveData()` |

O toggle irmão (`prioritizeRecentDrinksInput`, app.js:4468-4479) **não** tem
esse bug — já mutava e só depois tentava salvar, mas com try/catch e
rollback manual corretos. Fica de fora desta spec (vai para 0009, junto com
os pontos só de troca mecânica).

Assumo que esta agora é a lista completa — conferi com um grep de toda
atribuição a `state.drinks`/`state.events`/`state.preferences` no arquivo,
não só os call sites de `saveData()`/`persistDrinkList()` que já conhecia.

## Decisão

Mesmo padrão da spec 0007: montar o próximo valor sem tocar `state`,
chamar `commitAppData`, só atribuir a `state` depois do sucesso, e
adicionar mensagem de erro amigável onde não existia (mesma decisão já
aprovada na 0007, aplicada aqui pela consistência).

### `choosePendingDoseSize` (app.js:2949-2961)

```js
function choosePendingDoseSize(value) {
  const event = state.events.find((item) => item.id === state.pendingDoseEventId);
  if (!event) {
    closeDoseSizeDialog({ showResult: false });
    return;
  }

  const doseSize = value === "half" ? "half" : "full";
  const nextEvents = state.events.map((item) => (item.id === event.id ? { ...item, doseSize } : item));
  try {
    state.events = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { events: nextEvents }).events;
  } catch {
    showAppNotification("Não foi possível salvar. Tente novamente.", { type: "error" });
    return;
  }
  refreshDataViews();
  updateDoseDialogSelection(doseSize);
  closeDoseSizeDialog();
}
```

### `undoLastRegistration` (app.js:2974-2982)

```js
function undoLastRegistration() {
  if (!state.undo || state.undo.type !== "add-event") return;

  const nextEvents = state.events.filter((event) => event.id !== state.undo.eventId);
  try {
    state.events = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { events: nextEvents }).events;
  } catch {
    showAppNotification("Não foi possível desfazer. Tente novamente.", { type: "error" });
    return;
  }
  refreshDataViews();
  state.undo = null;
  hideToast();
}
```

### Toggle "interface limpa" (app.js:4461-4466)

```js
cleanInterfaceInput.addEventListener("change", () => {
  const preferences = { ...state.preferences, cleanInterface: cleanInterfaceInput.checked };
  try {
    state.preferences = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { preferences }).preferences;
  } catch {
    applyInterfacePreferences(); // sem mudar state.preferences, isso resincroniza o checkbox ao valor antigo
    showAppNotification("Não foi possível salvar esta configuração.", { type: "error", persistent: true });
    return;
  }
  applyInterfacePreferences();
  showToast(cleanInterfaceInput.checked ? "Interface limpa ativada." : "Informações auxiliares exibidas.");
});
```

`applyInterfacePreferences()` (app.js:501-505) já lê `state.preferences.cleanInterface`
para sincronizar `document.body.classList` e o próprio checkbox — reaproveito
essa função também no `catch` para desfazer visualmente o toggle, em vez de
escrever lógica de rollback nova (mesma ideia que `prioritizeRecentDrinksInput`
já usa manualmente).

## Casos de borda preservados

- `choosePendingDoseSize`: `updateDoseDialogSelection` passa a receber a
  variável local `doseSize` em vez de `event.doseSize` (que antes só
  refletia o valor novo por causa da mutação em place) — valor idêntico,
  só a fonte muda.
- `undoLastRegistration`: ordem do caminho de sucesso preservada
  (`refreshDataViews()` → `state.undo = null` → `hideToast()`).
- Toggle de interface limpa: o texto do toast e a classe CSS continuam
  exatamente iguais; a diferença é que agora, se a gravação falhar, o
  checkbox e o `body` voltam visualmente ao estado anterior (hoje: exceção
  não tratada, checkbox fica mostrando um valor que não foi salvo).

## Plano de teste

- `node --check app.js`.
- Estender `tests/drinks-mutations.test.cjs` (ou novo arquivo) com sucesso
  + falha para as 3 funções, seguindo o mesmo padrão de
  `vm.createContext` já usado na spec 0007.
- Rodar `npm test` completo; baseline atual (pós Fase 2.3) é 138/140, com
  as 2 falhas conhecidas em `receiver-browser.test.cjs`.
- Smoke test de navegador cobrindo: escolher meia/inteira dose, desfazer um
  registro (undo pelo toast), alternar "interface limpa" nas configurações.
- Teste manual seu antes de fechar a spec, como na 0007 — estes 3 fluxos
  também não tinham nenhum teste de navegador antes.
- Fora desta rodada: `persistIconCatalog`, `saveData` (que ficará sem
  chamadores depois desta spec + da 0009 — candidata a remoção),
  `persistDrinkList`, `confirmBackupRestore`, `prioritizeRecentDrinksInput`
  — todos já corretamente ordenados, ficam para a spec 0009 (troca mecânica).
