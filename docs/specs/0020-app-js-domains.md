# 0020 — Extrair domínios remanescentes de `app.js` (Fase 9.2)

Status: implementada

## Contexto

`app.js` tem hoje 4366 linhas. As extrações anteriores (specs 0001-0016) tiraram o que
era **puro** — formatters, criptografia, validação de rascunho, `commit()` — ou
autocontido — drag-and-drop, easter eggs. O que sobrou é justamente o que o plano
original adiou "por depender fortemente de `state`": os diálogos de bebida, de dose/log e
de evento, e a segurança de alto nível.

Levantamento completo feito por agente de exploração antes desta spec (função por
função, com `arquivo:linha`, acesso a `state`, acesso a DOM, chamadas cruzadas,
cobertura de teste atual e identificadores já publicados em `globalThis`). Três achados
mudam o desenho em relação à intuição original do plano:

1. **Não são extrações "puras".** Contagem de acessos diretos a `state.*` nas funções
   nomeadas: 47 (bebida), 50 (dose/log), 17 (evento), 70 (segurança). `state` nunca é
   passado por parâmetro hoje — é sempre a `const state` de módulo (`app.js:340-376`).
   **Mas isso não é bloqueio**: o padrão certo já existe no repo desde a spec 0013 —
   `createDrinkReorderController`/`createIconReorderController` recebem `state` e as
   `const` de DOM **por parâmetro de factory** e seguem lendo/escrevendo `state.*`
   normalmente por dentro. A extração troca "fechar sobre a `const state` do módulo" por
   "receber `state` como argumento", que é mecânico. Não é um redesenho para stateless.
2. **A fronteira "bebida" vs "dose/log" não existe na prática.** As duas se chamam o
   tempo todo (`editDrinkFromDrinkMenu`→`openEditDrinkDialog`, `closeDeleteDrinkDialog`→
   `closeDrinkMenuDialog`/`openEditDrinkDialog`, `openIntervalWarningDialog`/
   `continueFromIntervalWarning`→`openLogDialog`, `registerMinutesAgo`→`registerDrinkAt`→
   `openDoseSizeDialog`). Separar em dois módulos criaria import circular ou uma camada
   de callbacks para simular o que hoje é chamada direta. Vão juntas.
3. **Segurança é o domínio de maior risco, não o de maior valor.** Tem a maior contagem
   de `state` (70), **zero cobertura de teste unitário** das funções de alto nível
   (`tests/security-*.test.cjs` só cobrem as primitivas já extraídas em `src/security/`),
   parte da lógica de negócio vive **fora de função nomeada** (3 listeners inline de
   auto-lock, `app.js:4164-4234`, ~58 linhas só no de `visibilitychange`), e `reset.js`
   **duplica** a lógica de bloqueio por tentativas escrevendo direto em
   `state.pinFailedAttempts`/`state.pinLockoutUntil` (`reset.js:184-192`) em vez de
   chamar `handlePinUnlock`. Extrair tudo isso sem rede de teste é o maior risco de
   regressão silenciosa do levantamento inteiro.

**Contrato que qualquer sub-fase precisa preservar:** os nomes já publicados em
`globalThis` por `app.js` (bloco final `app.js:4335-4363` **e** um segundo ponto no meio
do arquivo, `app.js:693-695`, fácil de não notar) são lidos soltos por `navigation.js`
(10 identificadores de uma vez, no mapa `closers`), `reset.js` (8), `occasions-ui.js` (3)
e por vários `tests/*-browser.test.cjs` via `page.evaluate`. Renomear ou deixar de
publicar qualquer um quebra produção ou teste. A publicação continua saindo de `app.js`
(que importa do novo módulo e republica), para não espalhar a ponte por vários arquivos.

## Decisão — 5 sub-fases, do mais barato ao mais arriscado

Cada sub-fase é um commit próprio, com `npm test` completo entre elas (mesmo processo da
Fase 8). **Sub-fases 9.2.3 e 9.2.5 escrevem teste *antes* de extrair**, porque a
cobertura atual delas é zero — extrair primeiro e testar depois seria refatorar sem rede.

### 9.2.1 — Widget de roleta vai inteiro para `src/ui/wheel-picker.js`

Hoje `src/ui/wheel-picker.js` tem só `createDurationPicker`, que **recebe
`createWheelPicker`/`setWheelPickerValue` por parâmetro** — porque o motor real do widget
ficou em `app.js:3332-3460`. É meia extração: o wrapper mora em `src/`, o motor não.

Move `createWheelPicker`, `setWheelPickerValue` e as constantes `WHEEL_*` para
`src/ui/wheel-picker.js`, e `createDurationPicker` deixa de precisar recebê-las por
parâmetro (passa a usá-las do próprio módulo).

**Ponto de atenção — o vazamento de regra de negócio dentro do widget "genérico":**
`createWheelPicker` (`app.js:3383`) e `setWheelPickerValue` (`app.js:3457`) têm
`if (element === intervalHoursWheel) updateMinuteWheelAvailability(value);` — uma
comparação **hardcoded** com o elemento DOM específico do diálogo de bebida, dentro de um
widget usado também pelo diálogo de evento (`app.js:3228-3229,3248-3249`) e pelo de
log. Na extração isso vira um parâmetro opcional de callback
(`createWheelPicker(element, input, maxValue, { onValueChange })`), com `app.js` passando
`updateMinuteWheelAvailability` só para o wheel de horas do intervalo. Sem isso, o módulo
extraído não teria como saber o que é `intervalHoursWheel`.

Risco: baixo. Já coberto por `tests/ui-wheel-picker.test.cjs` (o wrapper) e pelos testes
de navegador que usam roletas (`countdown-menu-browser`, `occasions-browser`).

### 9.2.2 — Catálogo de ícones/emoji vai para `src/ui/icon-catalog.js`

`buildIconPicker`, `renderEmojiMenu`, `scrollToEmojiCategory`, `syncEmojiCategory`,
`addCatalogIcon`, `moveCatalogIcon`, `commitIconMove`, `removeCatalogIcon`,
`toggleIconDeletion`, `setIconCatalogStatus` (`app.js:3500-3709`). Hoje parecem parte do
diálogo de bebida só porque o HTML está aninhado dentro de `#drink-dialog`
(`index.html:353-441`) — não há dependência real de `handleDrinkSubmit`/
`openEditDrinkDialog`.

Complementa `src/ui/icon-reorder.js` (spec 0013), que já cuida só do **gesto** de
arrastar; este cuida do **catálogo** (adicionar/remover/reordenar/emoji picker). Factory
recebendo `state`, os elementos de DOM e `persistIconCatalog` por parâmetro.

**Ponto de atenção:** 22 chamadas ad hoc de `document.querySelector` dentro dessas
funções (`#undo-icon-removal`, `#icon-add-panel`, `#emoji-menu`, `#emoji-category`,
`#icon-catalog-status` nunca viraram `const` de topo). Esses viram parâmetros da factory
na extração — o padrão dos módulos já extraídos é não tocar `document` por dentro.

Risco: médio-baixo. Cobertura indireta: `tests/icon-reorder-browser.test.cjs` (arraste,
teclado, persistência) e `tests/audit.test.cjs` (catálogo/normalização). A lógica de
adicionar/remover ícone em si não tem teste unitário — acrescento um nos moldes de
`tests/audit.test.cjs` junto da extração.

### 9.2.3 — Diálogo de evento: **testes primeiro**, depois `src/history/event-dialog.js`

`updateEventDateLabel`, `openEventDialog`, `closeEventDialog`, `handleEventSubmit`,
`deleteSelectedEvent` (`app.js:3204-3330`). O menor e mais isolado dos três diálogos: 5
funções, 17 acessos a `state`, ~123 linhas.

**Cobertura hoje: zero teste unitário.** Só é exercitado de passagem por
`countdown-menu-browser.test.cjs` (como parte de um fluxo maior) e por
`navigation-browser.test.cjs` (que só checa profundidade de navegação, não a lógica).

Por isso esta sub-fase tem **dois commits**: (a) escrever testes unitários de
`handleEventSubmit`/`deleteSelectedEvent` via `extract()`+`vm.runInContext`, nos moldes
de `tests/drinks-mutations.test.cjs` (que já faz exatamente isso para as mutações de
bebida/dose) — validando que passam contra o código **atual**, sem mover nada; (b) só
então extrair, e reconfirmar que os mesmos testes continuam passando.

Não confundir com "ocasião/evento de agenda", que já é `occasions-ui.js` — aqui é a
edição de um registro individual do histórico.

### 9.2.4 — Bebida + dose/log/menu juntos em `src/drinks/interactions.js`

O maior bloco: 21 + 23 funções (`app.js:2723-3202`, `2886-3031`, `3711-3818`), ~726
linhas somadas, 97 acessos a `state`. Inclui cadastro/edição/exclusão de bebida, menu da
bebida, registro de consumo, dose meia/inteira, aviso de intervalo em andamento e
cancelamento de contagem.

Mecanicamente direto pelo padrão já validado (factory com `state` + DOM + dependências
por parâmetro), mas é o commit de maior volume. Dentro do arquivo, as funções ficam
agrupadas em duas seções comentadas ("editor de bebida" e "registro de consumo") — só
por tamanho, já que a fronteira de dependência entre elas não justifica dois módulos.

Cobertura atual razoável para as mutações perigosas: `tests/drinks-mutations.test.cjs`
já cobre `deleteDrinkKeepingHistory`, `deleteDrinkWithHistory`, `handleDrinkSubmit`,
`choosePendingDoseSize`, `undoLastRegistration` via `extract()`. Esses testes precisam
ser adaptados (deixam de fatiar `app.js`, passam a importar o módulo), o que é parte do
trabalho da sub-fase.

### 9.2.5 — Segurança: **só a fatia de config/verificação**, e testes antes

Move para `src/security/config.js` apenas: `getDefaultSecurityConfig`,
`loadSecurityConfig`, `saveSecurityConfig`, `getConfiguredPinLength`,
`normalizePinInput`, `getPinLockoutRemainingMs`, `verifyPin` — funções pequenas, quase
sem DOM, próximas de puras.

**Fica explicitamente em `app.js` nesta rodada:** `lockApp`, `unlockApp`,
`showLockScreen`, `handlePinUnlock`, `handleDeviceUnlock`, `closeSensitiveDialogs`,
`showPrivacyShield`/`hidePrivacyShield`, `initializeSecurity`, os diálogos de
configuração de método/PIN, e os **3 listeners inline de auto-lock**
(`visibilitychange`/`beforeunload`/`pointerdown`, `app.js:4164-4234`).

Motivo, registrado explicitamente: extrair esses exigiria antes (a) transformar os 3
listeners anônimos em funções nomeadas — reescrita, não extração — e (b) resolver a
duplicação em `reset.js:184-192`, que reimplementa o contador de tentativas em vez de
chamar `handlePinUnlock`, cruzando a fronteira do módulo que se quer isolar. Com zero
teste cobrindo o fluxo real de lock/unlock hoje, fazer os dois de uma vez numa extração
é risco desproporcional. Fica para uma spec futura, **com testes de lock/unlock escritos
antes**.

Antes de mover a fatia acima, escrevo teste unitário de `loadSecurityConfig`/`verifyPin`/
`getPinLockoutRemainingMs` (hoje inexistente), mesma lógica de "testa antes, move
depois" da 9.2.3.

## Casos de borda a preservar (todas as sub-fases)

1. **Nomes em `globalThis` idênticos** — inclusive os 3 publicados fora do bloco
   principal (`app.js:693-695`: `isSecurityEventUnlockActive`, `setSecurityEventUnlock`,
   `syncSecurityEventUnlock`), lidos por `occasions-ui.js`.
2. **`editingIconCatalog` continua sendo getter vivo** (`Object.defineProperty`,
   spec 0017) — `tests/navigation-browser.test.cjs` lê o valor corrente após toggle.
3. **`navigation.js`'s mapa `closers`** depende de 10 funções `closeXDialog` de 4
   domínios diferentes continuarem resolvendo por identificador solto.
4. **A regra "24h zera minutos"** do picker de intervalo (hoje via comparação hardcoded
   com `intervalHoursWheel`) tem que continuar valendo só para aquele picker, e não
   vazar para as roletas de evento/log.

## Plano de teste

- `node --check`/`node --input-type=module --check` em cada arquivo tocado.
- `npm test` completo **depois de cada sub-fase**, não só no fim (lição da Fase 8).
- Testes novos escritos **antes** da extração em 9.2.3 e 9.2.5 (evento e segurança), e
  junto da extração em 9.2.2 (catálogo de ícones).
- Adaptação (não remoção) dos testes de `tests/drinks-mutations.test.cjs` em 9.2.4.
- Teste manual ao fim de 9.2.4 e 9.2.5 (as que mexem em fluxo de dados e segurança):
  cadastrar/editar/excluir bebida, anotar dose (incluindo meia/inteira e "há quanto
  tempo"), cancelar contagem, editar e excluir um registro do histórico, configurar e
  usar PIN, travar/destravar o app.
- Fora desta rodada, registrado de propósito: lock/unlock e os 3 listeners de auto-lock
  (ver 9.2.5), e a duplicação de lockout em `reset.js:184-192`.

## Nota pós-implementação

As 5 sub-fases foram commitadas separadamente (wheel-picker, catálogo de ícones,
diálogo de evento, editor de bebida + registro de consumo, config/verificação de
segurança), cada uma com `npm test` completo antes do commit seguinte, confirmando a
lição da Fase 8. Três achados reais, além do previsto nesta spec:

1. **Bug de regressão real** (9.2.2): `closeDrinkDialog()` chamava `iconReorder.cancel()`
   como identificador solto depois que `iconReorder` virou variável interna do módulo -
   travava `#drink-dialog` aberto. Confirmado como regressão (não pré-existente) via
   worktree comparando com o commit anterior.
2. **Dependência circular** (9.2.5): o literal de `state` calculava seu próprio
   `securityConfig` inicial chamando `loadSecurityConfig()`/`getDefaultSecurityConfig()`
   - mas o factory novo precisa de `state` por referência como parâmetro. Resolvido
   construindo `state` com `securityConfig: null`, criando o factory logo em seguida, e
   só então preenchendo `state.securityConfig`.
3. **Teste quebrado por corte de string** (9.2.4): `tests/ui.test.cjs` fatiava `app.js`
   até `'function openDrinkDialog('` para isolar `showAppNotification`/`showToast`/
   `hideToast` - com `openDrinkDialog` movido para `src/drinks/interactions.js`, o
   `indexOf` passou a devolver -1 e o corte silenciosamente incluiu quase todo o resto
   do arquivo. Exatamente o risco que a seção "Testes: parar de depender de slice de
   string" do plano original já apontava; corrigido apontando o corte para o próximo
   marcador estável (`'const iconCatalog = createIconCatalog('`).

`src/README.md` também ganhou reforço na prática: `localStorage` só era tocado
diretamente por `src/data/store.js` até aqui; `src/security/config.js` precisou dele
também (para `loadSecurityConfig`/`saveSecurityConfig`) e passou a recebê-lo por
parâmetro do factory, em vez de abrir uma segunda exceção não documentada à regra de
"módulos aqui não tocam `localStorage` diretamente".

Teste manual completo (cadastrar/editar/excluir bebida, dose meia/inteira, "há quanto
tempo", cancelar contagem, editar/excluir registro do histórico, configurar e usar PIN,
travar/destravar o app) pendente de confirmação do usuário para fechar a spec.
