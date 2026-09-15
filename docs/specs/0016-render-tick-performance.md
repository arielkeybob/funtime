# 0016 — Separar tick (texto) de render estrutural

Status: implementada

## Contexto

`startClock()` (app.js:3916-3928) chama `render()` a cada segundo sempre
que a view é "home". `render()` (app.js:2370-2469) faz
`drinkList.innerHTML = ""` e reconstrói **todos** os cards do zero —
reclona template, refaz `classList`, e readiciona os `addEventListener` de
histórico/menu para cada card — mesmo quando só o texto do contador mudou.

**O que realmente muda a cada segundo**, olhando célula por célula:
- `time.textContent` e o `aria-label` do botão principal, **só** nos
  estados `"waiting"`/`"danger"` (via `formatActivityCounter`/`formatTime`).
- Nada mais tem conteúdo que mude segundo a segundo nos estados
  `"new"`/`"completed"` (o texto é estático até uma transição de estado).

**O que pode mudar só com o tempo passando, sem nenhuma ação do usuário**
(por isso a otimização não pode ser "só trocar texto"):
- `getDrinkActivity(drink).state` muda de `"waiting"`/`"danger"` para
  `"completed"` no instante em que o intervalo termina.
- `isDrinkInRecentGroup` (app.js:2167-2176) mantém uma dose concluída no
  grupo "recentes" só por 24h desde o consumo (`Date.now() -
  activity.latestEvent.consumedAt < 24*60*60*1000`) — depois disso ela cai
  para o grupo "manual", **mudando a ordem dos cards na tela**, sem
  nenhuma ação do usuário.

Por isso a otimização não pode ser "atualizar o texto de todo mundo" — tem
que **detectar com segurança quando algo estrutural mudou** (estado,
agrupamento/ordem, a nota "Registro anterior ao evento", o modo
cabeça-para-baixo) e só nesse caso cair para o `render()` completo.

## Decisão

Uma função `describeDrinkForRender(drink, manualIds, occasion)` extrai a
lógica de `neutral`/nota-de-evento que hoje já existe inline em `render()`
(app.js:2416, 2453), sem duplicá-la — passa a ser chamada tanto por
`render()` quanto pela nova função de tick, garantindo que os dois
caminhos concordam sobre o que é "estrutural":

```js
function describeDrinkForRender(drink, manualIds, occasion) {
  const activity = getDrinkActivity(drink);
  const neutral = activity.state === "completed" && (state.preferences.eventsEnabled
    ? (!occasion || activity.latestEvent.occasionId !== occasion.id)
    : Date.now() - activity.latestEvent.consumedAt >= 86400000);
  const associatedNote = Boolean(occasion && activity.remainingMs > 0 && activity.latestEvent && activity.latestEvent.occasionId !== occasion.id);
  const signaturePart = `${drink.id}:${manualIds.has(drink.id) ? 'm' : 'r'}:${activity.state}:${neutral}:${associatedNote}`;
  return { activity, neutral, associatedNote, signaturePart };
}
```

`render()` passa a usar essa função no lugar do cálculo inline de
`neutral`/nota, e ao final monta e guarda uma assinatura do que acabou de
desenhar:

```js
state.lastRenderSignature = `${signatureParts.join('|')}#upsideDown:${state.upsideDownActive}`;
```

A parte que hoje monta o `aria-label`/texto de `"waiting"`/`"danger"`
(app.js:2424-2431 e 2432-2444) vira uma função pequena
`setTickingCardText(mainButton, time, drink, activity)`, chamada por
`render()` nesses dois ramos — assim o texto que tica fica escrito **uma
vez só**, reaproveitado pela nova função de tick.

```js
function tickDrinkCards() {
  globalThis.refreshOccasionContext?.();
  const displayGroups = getDrinkDisplayGroups();
  const manualIds = new Set(displayGroups.manual.map(drink => drink.id));
  const occasion = state.preferences.eventsEnabled ? FunTimeOccasions.active(state.occasions) : null;
  const signatureParts = [];
  const activitiesById = new Map();

  [...displayGroups.recent, ...displayGroups.manual].forEach(drink => {
    const { activity, signaturePart } = describeDrinkForRender(drink, manualIds, occasion);
    activitiesById.set(drink.id, activity);
    signatureParts.push(signaturePart);
  });

  const signature = `${signatureParts.join('|')}#upsideDown:${state.upsideDownActive}`;
  if (signature !== state.lastRenderSignature) {
    render();
    return;
  }

  drinkList.querySelectorAll(".drink-card[data-drink-id]").forEach(card => {
    const activity = activitiesById.get(card.dataset.drinkId);
    if (!activity || (activity.state !== "waiting" && activity.state !== "danger")) return;
    const drink = state.drinks.find(item => item.id === card.dataset.drinkId);
    if (drink) setTickingCardText(card.querySelector(".drink-main"), card.querySelector(".drink-time"), drink, activity);
  });
}
```

`startClock()` troca a chamada de `render()` por `tickDrinkCards()`
(app.js:3921) — só nesse único call site. **Nenhum outro lugar que chama
`render()`/`refreshDataViews()` diretamente muda** (criar/editar/excluir
bebida, registrar dose, etc. continuam sempre fazendo o render completo,
exatamente como hoje) — a otimização é estritamente do tick do relógio.

`globalThis.refreshOccasionContext?.()` continua rodando a cada segundo
(chamado no início de `tickDrinkCards()`, independente de cair no caminho
barato ou no `render()` completo) — hoje já roda a cada tick via
`render()`, então isso preserva o comportamento do botão/banner de evento
atualizar a cada segundo.

**O que não muda:** todo o conteúdo visual final é idêntico — a otimização
só evita destruir/recriar os nós DOM e reanexar listeners quando nada
estrutural mudou. Se a assinatura calculada diferir por qualquer motivo
(inclusive um caso que eu não tenha previsto), o código cai para o
`render()` completo — o comportamento nunca fica "mais errado" que hoje,
na pior hipótese só perde a otimização naquele tick.

## Casos de borda a validar com cuidado

1. Contador regressivo/progressivo atualiza a cada segundo sem re-render completo (nó DOM do card permanece o mesmo — verificável por um atributo marcador que só sobrevive se o nó não for recriado).
2. Uma dose em `"waiting"` transita para `"completed"` no segundo exato em que o intervalo termina — assinatura muda, `render()` completo roda, o card reflete o novo estado imediatamente (sem atraso).
3. Uma dose concluída cruza a marca de 24h desde o consumo e migra do grupo "recentes" para "manual" — a ordem dos cards muda sem nenhuma ação do usuário; testável simulando o relógio com `page.clock` do Playwright (sem esperar 24h reais).
4. Registrar uma dose, entrar/sair do modo cabeça-para-baixo, ou qualquer CRUD de bebida continuam chamando `render()`/`refreshDataViews()` diretamente, sem passar pelo caminho de tick — comportamento inalterado.

## Plano de teste

- `node --check app.js`.
- Novo teste de navegador `tests/render-tick-browser.test.cjs` usando `page.clock` (mesmo recurso já usado em `tests/upside-down-browser.test.cjs`): (a) marca um atributo no nó do card, avança 1s várias vezes, confirma que o texto do contador mudou **e** o atributo marcador sobreviveu (nó não recriado); (b) avança o relógio exatamente até o fim do intervalo de uma dose e confirma a transição visual para "concluído"; (c) avança 24h simuladas e confirma a migração de grupo (ordem dos cards).
- Rodar `npm test` completo; baseline atual (pós v2.1.36) é 164/166, com as 2 falhas conhecidas em `receiver-browser.test.cjs`.
- Teste manual seu: abrir a Home com pelo menos uma bebida com dose registrada, deixar a tela aberta e observar o contador atualizando normalmente por alguns minutos, sem nenhum lampejo/reflow visível a cada segundo.
- Fora desta rodada: Fases 7-9 (converter `app.js` em módulo ES de verdade).
