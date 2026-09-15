# 0006 — Migrar para `commit()` os 4 pontos que já têm try/catch correto

Status: implementada

## Correção em relação à spec 0005

A spec 0005 dizia "7 dos 15 pontos mutam `state` antes de gravar" mas a
própria tabela só marca 5 linhas como "(bug real)":
`deleteSelectedEvent`, as duas ramificações de `handleDrinkSubmit`,
`deleteDrinkKeepingHistory`, `deleteDrinkWithHistory`. O número certo é
**5**, não 7 — corrijo aqui porque essa contagem vai orientar as próximas
specs. Esses 5 ficam de fora desta spec (são o lote mais arriscado, tratado
depois). Esta spec cobre só os 4 que **já** gravam e só depois mutam
`state`, dentro de um `try/catch` que já existe:

| Função | Linhas | Mensagem de erro no `catch` |
|---|---|---|
| `changeCountingMode` | app.js:1938-1951 | rollback do `<select>` + `showAppNotification("Não foi possível salvar a preferência. Tente novamente.")` |
| `registerDrinkAt` | app.js:2869-2897 | `showAppNotification('Não foi possível salvar a dose. Tente novamente.')` |
| `confirmStopCountdown` | app.js:3186-3206 | texto no `#stop-countdown-error`: "Não foi possível salvar. A contagem foi mantida. Tente novamente." |
| `handleEventSubmit` | app.js:3381-3427 | `showEventFormError("Não foi possível salvar. A anotação anterior foi mantida.")` |

Nenhuma delas tem o bug de ordenação: todas montam o próximo valor,
tentam gravar, e só mutam `state` **depois** do `try` ter sucesso. A
migração aqui é genuinamente mecânica — trocar a chamada direta de
`localStorage.setItem` pela chamada a `commitAppData` (publicada pelo
bridge a partir de `src/data/store.js`), preservando exatamente a mesma
mensagem de erro e o mesmo fluxo de cada `catch`.

## Decisão

Para cada uma das 4 funções, o padrão de troca é:

```js
// antes (ex.: changeCountingMode, app.js:1941-1943)
try {
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify({ ...buildCurrentAppData(), preferences }));
  state.preferences = preferences;
  ...

// depois
try {
  state.preferences = commitAppData(DATA_STORAGE_KEY, buildCurrentAppData(), { preferences }).preferences;
  ...
```

O mesmo padrão para `registerDrinkAt` (`state.events = commitAppData(...).events`),
`confirmStopCountdown` (idem) e `handleEventSubmit` (idem). Em todos os
casos, o `catch` (mensagem, rollback de UI, `return`) **não muda uma
letra** — só a linha de gravação dentro do `try` é trocada.

`commitAppData` já está publicada em `globalThis` pelo bridge desde a spec
0005 (`Object.assign(globalThis, {..., commitAppData: commit})`) — nenhuma
mudança adicional no bridge é necessária nesta spec.

**O que não muda:** todas as mensagens de erro, a ordem de mutação de
`state` (continua sendo só depois da gravação confirmar, exatamente como
hoje), o formato de dados salvo.

## Casos de borda preservados

- Falha de `commitAppData` (ex.: `QuotaExceededError`) continua caindo no
  mesmo `catch` de cada função, com a mesma mensagem e o mesmo
  comportamento de preservar o estado anterior (`state` só é reatribuído
  depois do `commitAppData` retornar com sucesso — a mesma garantia que já
  existia, só que agora centralizada em uma função em vez de repetida 4x).
- `changeCountingMode`: o rollback de `countingModeInput.value` em caso de
  falha continua idêntico.

## Impacto em testes existentes

`tests/audit.test.cjs`, teste "falha ao salvar contagem preserva a
preferência anterior e dados" (linha 271-279): hoje injeta um
`localStorage` fake diretamente no `vm.createContext` e usa `extract()`
para fatiar `changeCountingMode`. Depois da mudança, o texto fatiado de
`changeCountingMode` referencia `commitAppData` como identificador livre —
preciso injetar no mesmo `vm.createContext` uma implementação de
`commitAppData` que **use o `localStorage` fake do próprio contexto** (não
o `commit()` real importado de `src/data/store.js`, que resolveria
`localStorage` no processo Node externo, não no sandbox do `vm`):

```js
commitAppData: (key, current, patch) => {
  const next = { ...current, ...patch };
  localStorage.setItem(key, JSON.stringify(next)); // localStorage aqui é o do próprio vm context
  return next;
}
```

Isso replica o comportamento real de `commit()` dentro do sandbox, sem
duplicar a lógica de negócio (só a mecânica de merge+grava, que já é trivial
e coberta à parte em `tests/data-store.test.cjs`). O mesmo padrão de
injeção provavelmente é necessário para os testes de `registerDrinkAt`/
`confirmStopCountdown`/`handleEventSubmit` se algum deles usar `extract()` —
vou conferir cada um ao implementar; os que são cobertos só por teste de
navegador (Playwright, app real rodando) não precisam de nenhum ajuste,
porque lá `commitAppData` é a função real publicada pelo bridge.

## Plano de teste

- `node --check app.js` após cada uma das 4 trocas.
- Ajustar a injeção de `commitAppData` nos testes que usam `extract()` para
  essas funções (a confirmar exatamente quais ao implementar).
- Rodar `npm test` completo após as 4 trocas; baseline atual (pós Fase 2.1)
  é 127/129, com as 2 falhas conhecidas em `receiver-browser.test.cjs`.
- Testes de navegador relevantes a observar com atenção: `countdown-menu-browser.test.cjs`
  (`confirmStopCountdown`), `navigation-browser.test.cjs` (fluxo geral),
  `occasions-browser.test.cjs`/`drink-tap-browser.test.cjs` (`registerDrinkAt`).
- Smoke check de navegador (Playwright na prévia local) cobrindo: alternar
  modo de contagem, anotar uma dose, editar um registro do histórico —
  os três fluxos tocados por esta spec.
- Fora desta rodada: os 5 sites com o bug de ordenação (`handleDrinkSubmit`,
  exclusão de bebida com/sem histórico, exclusão de registro) — próxima
  spec, exige reescrever a função, não só trocar uma linha.
