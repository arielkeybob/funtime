# 0007 — Corrigir os 5 pontos que mutam `state` antes de gravar

Status: implementada

## Contexto

Os 5 pontos confirmados na spec 0005/0006 que mutam `state` **antes** de
tentar gravar, sem nenhum try/catch em toda a cadeia de chamada:

| Função | Linhas atuais | O que muta antes de gravar |
|---|---|---|
| `deleteDrinkKeepingHistory` | app.js:3109-3129 | `state.events`, `state.drinks`, `state.editingDrinkId` |
| `deleteDrinkWithHistory` | app.js:3131-3144 | `state.drinks`, `state.events`, `state.editingDrinkId` |
| `deleteSelectedEvent` | app.js:3429-3444 | `state.events` |
| `handleDrinkSubmit`, editar bebida | app.js:4144-4173 | **muta em place** o objeto `drink` que já está dentro de `state.drinks` (`drink.name = name` etc.), e `state.events` |
| `handleDrinkSubmit`, criar bebida | app.js:4175-4185 (aprox.) | `state.drinks.push(...)` |

Se `localStorage.setItem` falhar (ex.: `QuotaExceededError`) em qualquer um
desses pontos, a exceção sobe sem ser capturada — a função para no meio,
`closeDeleteDrinkDialog()`/`refreshDataViews()`/`showToast()` (ou
equivalentes) nunca rodam, e **`state` já foi alterado** (bebida já sumiu
da lista em memória, evento já removido, nome já trocado) enquanto o
`localStorage` continua com os dados antigos. Ou seja: hoje, uma falha de
armazenamento nessas 5 rotas deixa a tela em estado inconsistente/quebrado
**e sem nenhuma mensagem para o usuário**. É o risco mais sério que a
análise inicial encontrou, e ainda pior no caso de `handleDrinkSubmit`
(ramo editar), que muta um objeto **já referenciado** dentro do array
(`drink.name = name`), então mesmo o processo de montar o "próximo valor"
corretamente exige trocar a mutação em place por substituição imutável do
item no array — não é só reordenar duas linhas.

## Decisão

Para as 5 funções, o padrão de correção é sempre: **montar os valores
seguintes em variáveis locais, sem tocar `state`; chamar `commitAppData`;
só atribuir a `state` depois do sucesso.** Além disso, adiciono um
`try/catch` que hoje não existe em nenhuma delas, com uma mensagem amigável
— isso é uma pequena adição de comportamento (não existia nenhum feedback
de erro nesses 5 pontos), sinalizada explicitamente abaixo para sua
aprovação.

**Decisão a confirmar com você:** as 5 funções ficam com uma mensagem de
erro nova (ex.: "Não foi possível excluir a bebida. Tente novamente."),
inspirada no tom já usado nos outros pontos (`registerDrinkAt`,
`confirmStopCountdown`). Sem essa mensagem, uma falha de gravação nesses
fluxos continuaria uma exceção não tratada — silenciosa e sem
recuperação para o usuário, exatamente o comportamento atual. Recomendo
adicionar a mensagem porque o custo é mínimo (só aparece se o
`localStorage` falhar de verdade) e o ganho é real (usuário sabe o que
aconteceu, dado não se perde). Se preferir manter o comportamento atual
byte a byte (sem mensagem nova, exceção continua não tratada), me avisa
antes da implementação.

### `deleteDrinkKeepingHistory` (app.js:3109-3129)

```js
function deleteDrinkKeepingHistory() {
  const drinkId = state.deleteDrinkId;
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  const nextEvents = state.events.map((event) => {
    if (event.drinkId !== drinkId) return event;
    return { ...event, drinkName: drink.name, drinkIcon: drink.icon };
  });
  const nextDrinks = state.drinks.filter((item) => item.id !== drinkId);
  state.editingDrinkId = null; // não é dado persistido; segue igual a hoje

  try {
    const result = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { events: nextEvents, drinks: nextDrinks });
    state.events = result.events;
    state.drinks = result.drinks;
  } catch {
    showAppNotification("Não foi possível excluir a bebida. Tente novamente.", { type: "error" });
    return;
  }
  closeDeleteDrinkDialog();
  refreshDataViews();
  showToast(`${drink.name} foi excluída da lista. O histórico foi mantido.`);
}
```

`state.editingDrinkId = null` continua rodando incondicionalmente (não é
persistido em `buildCurrentAppData()`, então não tem o risco de
divergência — preservo a ordem atual para não mudar esse detalhe também).

### `deleteDrinkWithHistory` (app.js:3131-3144)

Mesmo padrão: `nextDrinks`/`nextEvents` calculados antes, `commitAppData`,
atribuição só no sucesso, mesmo texto de erro.

### `deleteSelectedEvent` (app.js:3429-3444)

```js
// dentro do if de segurança já existente:
const nextEvents = state.events.filter((item) => item.id !== selectedEvent.id);
try {
  state.events = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { events: nextEvents }).events;
} catch {
  showAppNotification("Não foi possível excluir o registro. Tente novamente.", { type: "error" });
  return;
}
closeEventDialog();
refreshDataViews();
showToast("Anotação excluída. Os intervalos foram recalculados.");
```

### `handleDrinkSubmit`, ramo editar (app.js:4144-4173)

Aqui a correção também remove a mutação em place, trocando por
substituição imutável do item no array — consistente com o padrão que já
domina o resto do arquivo (`state.drinks = state.drinks.filter(...)` etc.):

```js
if (state.editingDrinkId) {
  const drink = currentDrink;
  if (!drink) { showFormError("Esta bebida não foi encontrada."); return; }

  const updatedDrink = { ...drink, name, icon, intervalMinutes: totalMinutes, askDoseSize };
  const nextDrinks = state.drinks.map((item) => (item.id === drink.id ? updatedDrink : item));
  // Nome e ícone acompanham correções; o intervalo histórico NÃO muda (snapshot por evento).
  const nextEvents = state.events.map((event) =>
    event.drinkId === drink.id ? { ...event, drinkName: name, drinkIcon: icon } : event
  );

  try {
    const result = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { drinks: nextDrinks, events: nextEvents });
    state.drinks = result.drinks;
    state.events = result.events;
  } catch {
    showFormError("Não foi possível salvar. Tente novamente.");
    return;
  }
  closeDrinkDialog();
  refreshDataViews();
  showToast(`${name} atualizada. Novas anotações usarão o novo intervalo.`);
  return;
}
```

### `handleDrinkSubmit`, ramo criar (app.js:4175-4185 aprox.)

```js
const nextDrinks = [...state.drinks, { id: createId(), name, icon, intervalMinutes: totalMinutes, askDoseSize }];
try {
  state.drinks = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { drinks: nextDrinks }).drinks;
} catch {
  showFormError("Não foi possível salvar. Tente novamente.");
  return;
}
closeDrinkDialog();
refreshDataViews();
```

## Casos de borda preservados

- Caminho de sucesso idêntico em todas: mesmas mensagens de toast, mesmos
  fechamentos de diálogo, mesma chamada a `refreshDataViews()`.
- `handleDrinkSubmit`: o intervalo histórico de eventos já registrados
  continua sem ser alterado ao editar uma bebida (só `drinkName`/`drinkIcon`
  do evento acompanham a correção, como já documentado no comentário
  original) — a troca de mutação em place por `map` imutável não muda esse
  comportamento, só a forma de construir o próximo array.
- `deleteDrinkKeepingHistory`/`deleteDrinkWithHistory`: `state.editingDrinkId`
  continua sendo limpo incondicionalmente (não é dado persistido).

## Risco e cobertura de teste — atenção especial

**Nenhuma das 5 funções tem teste hoje** (nem unitário via `extract()`, nem
de navegador) — confirmei com busca em `tests/`. É o maior "ponto cego" de
cobertura do projeto inteiro, e é justamente onde estou fazendo a mudança
de maior risco. Plano para reduzir esse risco:

1. **Testes novos via `vm.createContext`** (mesmo padrão de
   `tests/audit.test.cjs`), um por função, cobrindo: caminho de sucesso
   (drinks/events corretos depois, toast certo) e caminho de falha
   (`commitAppData` lança → mensagem de erro exibida, `state` **não**
   muda). Ficam num novo `tests/drinks-mutations.test.cjs`.
2. **Teste manual seu, obrigatório antes de considerar esta spec fechada**:
   como não há teste de navegador nenhum cobrindo estes fluxos, preciso que
   você exercite manualmente na prévia local: criar uma bebida, editar uma
   bebida existente (nome/ícone/intervalo), excluir uma bebida mantendo
   histórico, excluir uma bebida com histórico, excluir um registro
   avulso do histórico. Só vou marcar esta spec como "implementada" depois
   da sua confirmação.

## Plano de teste

- `node --check app.js` após cada uma das 5 correções.
- Novo `tests/drinks-mutations.test.cjs`: sucesso + falha para as 5 funções.
- Rodar `npm test` completo; baseline atual (pós Fase 2.2) é 127/129, com
  as 2 falhas conhecidas em `receiver-browser.test.cjs`.
- Smoke check de navegador (Playwright) cobrindo os 5 fluxos como um
  primeiro filtro automatizado, além do teste manual seu descrito acima.
- Fora desta rodada: `commitOccasions` (occasions-ui.js) e
  `executeDataReset` (reset.js) — ainda scripts clássicos, migração fica
  para uma spec própria depois que este lote (o de maior risco) estiver
  validado.
