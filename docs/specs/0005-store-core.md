# 0005 — Criar `src/data/store.js` (núcleo da persistência, sem migrar call sites ainda)

Status: implementada

## Contexto

Antes de escrever esta spec, mapeei com precisão os 11 pontos onde o app
grava o recorte persistido (`{version, drinks, events, occasions,
preferences}`) em `localStorage[DATA_STORAGE_KEY]`, lendo o código atual
linha a linha (não só reaproveitando a contagem da análise original, que já
estava desatualizada pelas fases 1.1-1.4):

| Local | Tem try/catch próprio? | Mutação de `state` acontece... |
|---|---|---|
| `migrateLegacyData` (app.js:1306-1310) | Sim, `console.error` só | não se aplica (dados novos) |
| `persistIconCatalog` (app.js:1325-1329) | **Não** | depois da gravação |
| `saveData` (app.js:1352-1362) | **Não** | não muda `state` (lê e grava o que já está lá) |
| `persistDrinkList` (app.js:1677-1689) | **Não** (responsabilidade do chamador) | depois da gravação |
| `confirmBackupRestore` (app.js:1818-1834) | Sim, mensagem própria | só depois do `try` bem-sucedido (`window.location.reload()`) |
| `changeCountingMode` (app.js:1938-1951) | Sim, com rollback do `<select>` | depois da gravação, dentro do try |
| `registerDrinkAt` (app.js:2869-2897) | Sim | depois da gravação, dentro do try |
| `confirmStopCountdown` (app.js:3186-3206) | Sim | depois da gravação, dentro do try |
| `handleEventSubmit` (app.js:3381-3427) | Sim | depois da gravação, dentro do try |
| `deleteSelectedEvent` (app.js:3433-3448) | **Não** — muta `state.events` **antes** de chamar `saveData()` | **antes** da gravação (bug real) |
| `handleDrinkSubmit`, ramo editar (app.js:4148-4177) | **Não** — muta `drink.name` etc. **em objeto já presente em `state.drinks`**, e `state.events`, antes de `saveData()` | **antes** da gravação (bug real) |
| `handleDrinkSubmit`, ramo criar (app.js:4179-4190) | **Não** | `state.drinks.push(...)` antes de `saveData()` (bug real) |
| `deleteDrinkKeepingHistory` (app.js:3111-3131) | **Não** | antes da gravação (bug real) |
| `deleteDrinkWithHistory` (app.js:3133-3146) | **Não** | antes da gravação (bug real) |
| `commitOccasions` (occasions-ui.js:12-18) | **Não** (responsabilidade do chamador) | depois da gravação, mas sem proteção nenhuma |
| `executeDataReset` (reset.js:102-124) | **Não** (responsabilidade do chamador, `resetAuthorizationIsCurrent`/callers tratam) | depois da gravação |

Achado confirmado: **7 dos 15 pontos mutam `state` antes de tentar gravar,
sem nenhum try/catch** — se `localStorage.setItem` lançar
`QuotaExceededError` nesses pontos, `state` já está errado (bebida já
removida da lista em memória, evento já filtrado, etc.) e o armazenamento
não reflete isso: é exatamente o risco que o `AUDIT.md` já registrava como
não resolvido, e é maior do que a contagem original de "11 pontos" sugeria
(inclui também `migrateLegacyData`, que é um caso à parte, e `confirmBackupRestore`,
que já está corretamente ordenado).

Dado o tamanho do problema, esta spec cobre **só a criação do módulo**
`src/data/store.js`, sem tocar em nenhum dos 15 call sites acima. Migrá-los
é trabalho da(s) spec(s) seguinte(s) (0006+), em lotes menores — a ordem
importa aqui porque os 7 pontos com bug real de ordenação exigem reescrever
a função (não só trocar uma linha), enquanto os que já têm try/catch são
uma troca quase mecânica.

## Decisão

Criar `src/data/store.js`, ES Module, com uma única função:

```js
export function commit(current, patch) {
  const next = { ...current, ...patch };
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(next));
  return next;
}
```

Recebe o snapshot atual (tipicamente o retorno de `buildCurrentAppData()`,
que continua em `app.js`) e um `patch` parcial, devolve o objeto resultante
**só se a gravação teve sucesso** (deixa a exceção propagar se
`localStorage.setItem` lançar — não swallow). `DATA_STORAGE_KEY` é passado
como constante importada, não redeclarada (ver "Contrato").

Deliberadamente **não** inclui: leitura de `state`, tratamento de erro
(mensagens variam por chamador — ver tabela acima), lógica de `version`
(quem monta o objeto completo com a versão correta é `buildCurrentAppData()`,
que continua em `app.js`; `commit` só funde `current` com `patch` e grava).

Nesta spec, `store.js` é criado e testado **isoladamente**, publicado no
bridge, mas **nenhum call site muda ainda** — `app.js`/`occasions-ui.js`/
`reset.js` continuam gravando exatamente como hoje. Isso mantém esta PR de
risco baixíssimo (puramente aditiva) e separa "criar a peça" de "trocar as
15 chamadas por ela", que é o trabalho de maior risco do plano.

**Import de `DATA_STORAGE_KEY`:** hoje essa constante é declarada em
`app.js:283` e redeclarada independentemente em `migration.js`/`receiver.js`.
`store.js` não pode importar de `app.js` (que ainda é script clássico) nem
redeclarar o literal pela quarta vez. Solução: `store.js` recebe a chave
como **parâmetro**, não como import:

```js
export function commit(storageKey, current, patch) { … }
```

Isso adia a "fonte única de verdade" da chave para uma spec futura dedicada
(fora do escopo desta), sem introduzir uma quinta declaração do mesmo
literal.

## Contrato do módulo

```js
// src/data/store.js
export function commit(storageKey, current, patch) { … } // → objeto gravado, ou lança
```

## Casos de borda preservados

- `commit` propaga qualquer exceção de `localStorage.setItem` sem capturá-la
  (incluindo `QuotaExceededError`) — comportamento idêntico a uma chamada
  direta de `localStorage.setItem`, só que combinando `current`+`patch`
  antes.
- `{ ...current, ...patch }` é um merge raso — chaves de `patch` sobrescrevem
  as de `current`, igual ao padrão `{...buildCurrentAppData(), events}` já
  usado em 6 dos 15 pontos hoje.

## Plano de teste

- `node --check src/data/store.js`, `node --check src/bootstrap/legacy-bridge.js`.
- Novo `tests/data-store.test.cjs`: grava com sucesso (merge correto,
  retorno = objeto gravado), propaga exceção do `localStorage.setItem`
  (usar um `localStorage` fake que lança `QuotaExceededError`), confirma que
  nada é mutado além do que `patch` especifica.
- Nenhum teste existente precisa mudar — nenhum call site foi tocado.
- Rodar `npm test`; baseline atual (pós Fase 1) é 124/126, com as 2 falhas
  conhecidas em `receiver-browser.test.cjs`.
- Sem teste manual necessário — módulo criado mas ainda não usado por
  nenhum fluxo real do app.
- Fora desta rodada: migrar qualquer um dos 15 call sites listados acima —
  fica para 0006+, provavelmente separando "sites que já têm try/catch"
  (troca mecânica) de "sites com o bug de ordenação" (exige reescrever a
  função para construir o próximo valor antes de mutar `state`).
