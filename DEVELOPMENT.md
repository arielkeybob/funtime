# FunTime — documentação de desenvolvimento

## V2.1.47 — easter egg de BPM: 4 toques para o palpite, refina com 8 seguidos

`src/easter-eggs/index.js` (handler de `pointerup`): o primeiro palpite de BPM passa a
disparar em 4 toques em vez de 8. O array `taps` deixa de ser limpo nesse ponto (antes o
`reset()` zerava tudo a cada palpite); ele só é zerado ao chegar a 8 toques na mesma
sequência, permitindo um segundo palpite mais refinado, calculado sobre os 8 toques (em
vez dos 4 primeiros) antes de reiniciar a contagem. O cálculo de BPM foi generalizado
para `60000 * (taps.length - 1) / (último - primeiro)`, válido tanto para 4 quanto para
8 toques. As regras de pausa/interrupção (gap 200–2000ms, alvo, distância, duração do
toque) não mudam.

`tests/tap-bpm-browser.test.cjs` foi reescrito: o helper de disparo de toques passa a
receber uma lista de intervalos (`gaps`) em vez de uma contagem com espaçamento fixo,
permitindo testar continuidade entre bursts (ex.: 4 toques a 500ms seguidos de mais 4 a
300ms, sem pausa, para provar que o segundo palpite recalcula sobre os 8 e não repete o
primeiro) e o reinício exato após o oitavo toque. Suíte completa (183/184, única falha
conhecida e pré-existente em `install-browser.test.cjs`). App, boot, rodapés e cache
alinhados a 2.1.47; DATA_VERSION 11 preservado.

## V2.1.46 — trava o zoom por pinça no app, mantém liberado nas políticas

A meta viewport de `index.html` ganha `maximum-scale=1, user-scalable=no`, impedindo o
zoom por pinça no app instalado/standalone (que tirava a sensação de app nativo).
`policies.html` mantém a viewport padrão (sem esses limites), então o zoom continua
liberado só na tela de políticas, onde pode ajudar na leitura de texto longo.

App, boot, rodapés e cache alinhados a 2.1.46; DATA_VERSION 11 preservado.

## V2.1.45 — pede armazenamento persistente (navigator.storage.persist)

Reduz o risco de o próprio navegador apagar os dados do app silenciosamente sob
pressão de espaço em disco (ele prioriza limpar origens que considera "menos usadas").
Não protege contra o usuário limpar dados de propósito - nenhuma API da web permite um
site evitar isso; a proteção real contra isso continua sendo o backup manual que o app
já oferece.

`requestPersistentStorage()` roda uma vez, no fim de `bootstrapApp()` (só para o app
instalado/standalone, não para a prévia no navegador comum), sem bloquear o boot nem
pedir confirmação visível na maioria dos casos (navegadores tendem a conceder
automaticamente para PWAs instalados com uso real). Feature-detection
(`navigator.storage?.persist`) e `try`/`catch` tornam a chamada seguras em navegadores
sem suporte (ex.: Safari não implementa esta API) ou que negarem/falharem o pedido.

Validado: `node --input-type=module --check` em `app.js`; 4 testes novos em
`tests/audit.test.cjs` (concede quando suportado; navegador sem `navigator.storage`;
sem `persist()`; falha ao pedir - nenhum dos três últimos propaga erro); suíte completa
(183/184, única falha conhecida e pré-existente). App, boot, rodapés e cache alinhados
a 2.1.45; DATA_VERSION 11 preservado.

## V2.1.44 — Fase 9.3: bloqueio/desbloqueio vira src/security/lock.js

Fecha a spec 0021 (débito técnico do ROADMAP.md, adiado desde a spec 0020/9.2.5),
implementada em duas sub-fases já commitadas separadamente:

- **9.3.1**: `app.js:handlePinUnlock` e `reset.js:submitDataReset` reimplementavam
  cada um a seu modo a lógica de somar uma tentativa errada de PIN e acionar o
  bloqueio temporário. `registerFailedPinAttempt()` (novo, em
  `src/security/config.js`) é o único ponto que soma `state.pinFailedAttempts` e
  decide `state.pinLockoutUntil`; cada chamador continua livre para reagir à sua
  maneira ao retorno. Não unificado de propósito: a lógica de "limpar contadores
  quando o bloqueio já expirou" continua diferente entre os dois fluxos (um mostra
  contagem regressiva visível, o outro não).
- **9.3.2**: `closeSensitiveDialogs`, `showLockScreen`, `lockApp`, `unlockApp`,
  `showPrivacyShield`, `hidePrivacyShield`, `updatePinLockoutMessage`,
  `handlePinUnlock` e `handleDeviceUnlock` saem de `app.js` para
  `src/security/lock.js`, com testes escritos antes da extração (18 testes ao todo
  entre os dois módulos). `state.securitySetupGeneration` substitui um `let` privado
  de `app.js`, para os diálogos de configurar método/PIN (que ficam de fora, de
  propósito - concern diferente) continuarem compartilhando o mesmo contador.

Achado real durante a 9.3.2: os testes de "PIN/dispositivo correto desbloqueia"
verificavam, antes da extração, uma chamada a `unlockApp()` substituída de fora - só
funcionava porque a versão em `app.js` lia `unlockApp` como identificador solto de um
`vm.Context`. No módulo real, `unlockApp` é uma closure interna do factory, não
interceptável de fora; os testes passaram a verificar os efeitos observáveis reais de
`unlockApp` ter rodado, sem perder cobertura do comportamento.

Nenhuma mudança de comportamento visível. Validado: `node --input-type=module --check`
em `app.js` e nos dois módulos tocados; `node --check` em `reset.js`; suíte completa
(179/180, única falha conhecida e pré-existente) rodada após cada sub-fase;
`navigation-browser`/`occasions-browser` (que exercitam PIN/bloqueio de ponta a ponta)
passaram sem ajuste; teste manual completo confirmado pelo usuário no PWA real
(configurar PIN, bloquear/desbloquear certo e errado até o limite de tentativas,
aguardar o bloqueio passar, trocar de app e voltar, "Apagar tudo" com PIN errado até
bloquear). App, boot, rodapés e cache alinhados a 2.1.44; DATA_VERSION 11 preservado.

## V2.1.43 — expira compartilhamento recebido não retomado em 24h

Item de débito técnico do ROADMAP.md. Quando outro app compartilha um arquivo com o
FunTime (`share_target` no manifest), `sw.js` grava o conteúdo em cache sob uma chave
fixa; a próxima abertura do app lê e apaga. Se o usuário nunca reabrir o app depois de
compartilhar, o arquivo ficava em cache indefinidamente - e meses depois, ao abrir o
app por outro motivo qualquer, uma prévia de importação de um compartilhamento
esquecido surgia do nada.

`sw.js` passa a gravar `X-FunTime-Shared-At` (timestamp) junto com o
`X-FunTime-Filename` que já existia. `app.js` ganha `isSharedFileExpired(response)` e
`SHARE_IMPORT_MAX_AGE_MS` (24h); `readPendingSharedDrinkFile()` descarta (apaga do
cache) uma entrada expirada e retorna `null`, sem lançar. `maybeHandleSharedDrinkImport()`
também checa a expiração antes de decidir se há algo pendente, para não cair no branch
de erro "Não foi possível recuperar o arquivo recebido" quando na verdade o
compartilhamento só ficou velho demais - esse aviso continua reservado para uma falha
de leitura de verdade.

Validado: `node --check` em `sw.js`, `node --input-type=module --check` em `app.js`;
`tests/sw-boot.test.cjs` (novo: `handleShareTargetRequest` grava o timestamp
corretamente, rodando o `sw.js` real num `vm.Context`); `tests/audit.test.cjs` (2
novos: compartilhamento recente é lido e consumido normalmente; compartilhamento com
mais de 24h é descartado sem virar erro - achado durante o teste: a função lê `caches`
como identificador solto, não só `window.caches`, então o contexto de teste precisou
dos dois apontando pro mesmo objeto, como acontece de verdade no navegador); suíte
completa (162/163, única falha conhecida e pré-existente). App, boot, rodapés e cache
alinhados a 2.1.43; DATA_VERSION 11 preservado.

## V2.1.42 — histórico paginado em blocos de 20

Item de débito técnico do ROADMAP.md. `renderHistory()` reconstruía o DOM inteiro para
todos os eventos filtrados de uma vez - com até 200 mil eventos permitidos no schema,
isso travaria aparelhos modestos, e rodava a cada `refreshDataViews()` (depois de quase
toda ação: anotar, editar, excluir, importar).

Decisão de abordagem, discutida com o usuário: paginação incremental em vez de
virtualização de janela de scroll. Virtualização de verdade exigiria reciclar nós de
DOM e arrisca acessibilidade e testes que hoje esperam os registros presentes no DOM;
paginação é bem mais simples e já é um padrão aprovado neste app (`occasions-ui.js`:
`agendaLimit`/"Mostrar mais" na agenda de eventos, mesma técnica espelhada aqui).

`state.historyLimit` (novo campo, começa em 20) limita quantos dos registros já
ordenados/filtrados viram nós de DOM. Um botão novo, **Mostrar mais**
(`#history-show-more`), incrementa o limite em 20 e re-renderiza; some quando não há
mais nada a mostrar. `state.historyLimit` volta a 20 em `openHistoryView()` e ao trocar
o filtro por evento - mas outra ação que só atualiza a mesma visão (editar/excluir um
registro) preserva a página já expandida. `updateHistoryElapsedLabels()` (o "tick" que
atualiza o texto de tempo decorrido) já usa `document.querySelectorAll()` sobre o que
está no DOM - herda o ganho de performance automaticamente.

Nenhuma mudança de comportamento para quem tem poucos registros (a lista continua
idêntica até o vigésimo item). Validado: `node --input-type=module --check` em
`app.js`; `tests/history-pagination-browser.test.cjs` (novo, Playwright real: só a
primeira página vira DOM, contagem mostra o total, "Mostrar mais" revela o resto e
some, editar um registro não recolhe a página expandida, reabrir o histórico volta ao
limite inicial); suíte completa (159/160, única falha conhecida e pré-existente) - os
testes existentes de `occasions-browser`/`upside-down-browser` que tocam histórico usam
poucos eventos e continuam passando sem ajuste. App, boot, rodapés e cache alinhados a
2.1.42; DATA_VERSION 11 preservado.

## V2.1.41 — recuperação de dado corrompido no boot

Item de débito técnico do ROADMAP.md (achado original em `docs/history/AUDIT.md`):
`loadAppData()` já era falha-fechada (lança erro em vez de resetar silenciosamente em
dado corrompido), mas a única saída era "Tentar novamente" - que recarrega a página e
bate no mesmo dado de novo, em loop, sem nenhuma forma de ver ou salvar o conteúdo
bruto.

Como a leitura de dados roda no topo do módulo `app.js`, antes de qualquer UI dele
existir, um erro ali impede o módulo inteiro de carregar - a única tela que sobrevive é
a de `boot.js`. É por isso que a recuperação mora lá, e não em `app.js`, apesar de
`boot.js` normalmente ficar fora de rodadas de refactor (é o único lugar que roda
sempre, mesmo quando o resto do app falha).

Mecanismo: `loadAppData()` marca o erro com `error.name = 'FunTimeDataCorruptedError'`
só quando o problema é forma/conteúdo dos dados (`validateStoredShape`, `JSON.parse` ou
`normalizeData` falhando) - uma falha ao acessar o próprio `localStorage` (ex.:
`SecurityError`) continua com o erro genérico de antes. `boot.js`'s `loadScript()` já
escuta o evento global `error` de scripts com falha; passou a inspecionar
`event.error?.name` e, quando é esse erro específico, `showError()` exibe um botão
extra **Baixar cópia dos dados**, que lê `localStorage.getItem('funtime-v1-data')`
diretamente e baixa como arquivo, sem tentar corrigir ou apagar nada.

Escopo deliberadamente estreito, decidido com o usuário: só `funtime-v1-data`
(bebidas/histórico), não `funtime-security-v1` (PIN); só baixar cópia, sem oferecer
"apagar e recomeçar" nesta rodada.

Nenhuma mudança de comportamento para quem não tem dado corrompido. Validado:
`node --check` em `app.js`/`boot.js`; 4 testes novos de `loadAppData()` em
`tests/audit.test.cjs` (leitura válida, JSON inválido, formato incompatível, falha de
acesso ao `localStorage` não usa o nome novo); `tests/data-recovery-browser.test.cjs`
(2 cenários reais em Playwright: dado corrompido mostra o botão e o download baixa
exatamente o conteúdo bruto sem alterar o `localStorage`; dado válido nunca mostra o
botão); suíte completa (158/159, única falha conhecida e pré-existente). App, boot,
rodapés e cache alinhados a 2.1.41; DATA_VERSION 11 preservado.

## V2.1.40 — Fase 9.2: últimos domínios de `app.js` viram módulos

Implementa a spec 0020 em 5 sub-fases/commits: `src/ui/wheel-picker.js` (unifica o
motor de roleta, antes duplicado entre `createWheelPicker`/`setWheelPickerValue` soltos
e a versão injetada em `createDurationPicker`), `src/ui/icon-catalog.js` (catálogo de
ícones/emoji do diálogo de bebida), `src/history/event-dialog.js` (abrir/editar/excluir
um registro do histórico), `src/drinks/interactions.js` (o maior módulo: CRUD do editor
de bebida e todo o fluxo de registro de consumo — dose meia/inteira, log manual de "há
quanto tempo", menu da bebida, cancelar contagem, aviso de intervalo) e
`src/security/config.js` (só a fatia de configuração/verificação de segurança:
`loadSecurityConfig`/`saveSecurityConfig`/`verifyPin`/etc. — lock/unlock, os diálogos de
configuração de método/PIN e os 3 listeners de auto-lock ficam para uma spec futura, por
dependerem de resolver antes uma duplicação de lockout em `reset.js`). Todos seguem o
padrão de factory já estabelecido pela spec 0013 (`state` e os elementos de DOM
recebidos por parâmetro, não fechados sobre `const` de módulo).

Dois bugs de regressão real encontrados e corrigidos durante a extração (nenhum chegou
a ser publicado): em `src/ui/icon-catalog.js`, `closeDrinkDialog()` chamava
`iconReorder.cancel()` como identificador solto depois que a variável virou interna do
módulo novo — travava o diálogo de bebida aberto, confirmado como regressão via
comparação num worktree temporário com o commit anterior. Em `src/security/config.js`,
o literal de `state` calculava seu próprio `securityConfig` inicial chamando
`loadSecurityConfig()`/`getDefaultSecurityConfig()`, mas o factory novo precisa de
`state` por referência como parâmetro — resolvido construindo `state` com
`securityConfig: null`, criando o factory logo em seguida, e só então preenchendo o
campo com o resultado real.

`tests/drinks-mutations.test.cjs` teve 12 testes adaptados de `extract()`+
`vm.runInContext` direto no texto de `app.js` para `require()` real dos módulos novos
(a técnica antiga para de achar as funções assim que elas mudam de arquivo).
`tests/ui.test.cjs` também quebrou de um jeito instrutivo: fatiava `app.js` até
`'function openDrinkDialog('` para isolar `showAppNotification`/`showToast`/
`hideToast` — com a função movida, o corte de string parou de achar o marcador e
silenciosamente incluiu quase todo o resto do arquivo. `tests/security-config.test.cjs`
é novo, escrito **antes** da extração (mesma lógica "testa antes, move depois" da spec
0019), cobrindo `loadSecurityConfig`/`verifyPin`/`getPinLockoutRemainingMs` — sem
nenhum teste unitário até então.

Nenhuma mudança de comportamento visível, de formato de dados ou `DATA_VERSION`.
Validado: `node --check`/`node --input-type=module --check` em cada arquivo tocado;
suíte completa (152/153, única falha conhecida e pré-existente) rodada após cada uma
das 5 sub-fases; testes de navegador deste domínio (`drink-tap`, `countdown-menu`,
`drink-reorder`, `icon-reorder`, `dev-preview`, `navigation`, `occasions`) sem ajuste;
teste manual completo confirmado pelo usuário no PWA real (cadastro/edição/exclusão de
bebida, dose meia/inteira, "há quanto tempo", cancelar contagem, editar/excluir
registro do histórico, configurar e usar PIN, travar/destravar o app). App, boot,
rodapés e cache alinhados a 2.1.40; DATA_VERSION 11 preservado.

## V2.1.39 — Fase 8: últimos scripts clássicos viram módulos ES

`policies.js`, `ui.js`, `emoji-data.js`, `touch-debug.js`, `reset.js`, `occasions-ui.js`
e `navigation.js` passam a `<script type="module">` (implementa a spec 0019, em 5
sub-fases/commits, do menos ao mais acoplado). `occasions.js` fica de fora de propósito
— já era uma IIFE isolada, publicando só `globalThis.FunTimeOccasions`, e três testes
fazem `require('../occasions.js')`, que quebraria com `export` real sem nenhum ganho.

Descoberta na implementação: nenhum dos 3 arquivos mais entrelaçados (`reset.js`,
`occasions-ui.js`, `navigation.js`) precisou de `export` de verdade — bastou publicar em
`globalThis` os identificadores que outro arquivo ainda lê solto (mesmo mecanismo que já
sustentava `FunTimeOccasions`/`FunTimeTouchDebug`/`FunTimeNavigation`), porque identificador
solto de dentro de um módulo cai de volta em propriedade de `globalThis` quando não há
binding léxico. Isso evitou o redesenho de teste que a spec havia previsto como
necessário para `tests/reset.test.cjs` (a técnica de reatribuir `resetPending` de fora via
`vm.runInContext` no mesmo contexto só funciona com sintaxe de script clássico — como o
arquivo não ganhou nenhum `export`, continua funcionando sem tocar no teste).

Corrigido de passagem: `app.js` (`registerDrinkAt`) testava a existência de
`reconcileOccasions` com `globalThis.` mas chamava a função solta — funcionava por
acidente enquanto `occasions-ui.js` era script clássico; com ele como módulo, isso
pularia a reconciliação de eventos silenciosamente, sem erro. Agora os dois lados usam
`globalThis.`, consistente.

Todo script carregado por `boot.js` agora é módulo ES, exceto `occasions.js`. O
`Object.assign(globalThis, {...})` de `app.js` (Fase 7) continua necessário — os 3
arquivos acima ainda leem os 88 identificadores dele por ali, só que de dentro de
módulos em vez de scripts clássicos. Removê-lo fica para uma Fase 9 própria. Nenhuma
mudança de comportamento visível, de formato de dados ou `DATA_VERSION`. Validado:
`node --check` em cada arquivo tocado; suíte completa (138/139, única falha conhecida e
pré-existente) rodada após cada uma das 5 sub-fases; teste manual completo confirmado
pelo usuário (boot do zero, diálogos incluindo botão Voltar/Esc, PIN, agenda de eventos,
reset de dados, aceite de termos). App, boot, rodapés e cache alinhados a 2.1.39;
DATA_VERSION 11 preservado.

## V2.1.38 — remove suporte à V1 ("Intervalo")

Ninguém mais usa a versão anterior do app ("Intervalo", `/intervalo/`). Removido o protocolo inteiro de coexistência/transferência entre as duas versões: `migration.js`, `transition.js` e `receiver.js` saíram por completo; `boot.js` perdeu a negociação de posse/ponte com a v1 (`chooseSetup()`, verificação do service worker da v1) mas manteve, simplificada, a exclusividade entre janelas/abas do próprio FunTime 2 via um único Web Lock (renomeado para `funtime-writer-lock`, sem sufixo `-v1-`). A tela "Encontramos dados da versão anterior…"/"Começar sem dados" não existe mais — o boot vai direto para o app.

Achado importante tratado com cuidado: `app.js` só lançava erro em dado corrompido *porque* `migration.js` sempre estava presente (`if (globalThis.FunTimeMigration) throw ...`). Isso virou uma nova função própria, `validateStoredShape()`, chamada incondicionalmente em `loadAppData()`/`loadSecurityConfig()` — preserva o comportamento fail-closed (nunca reseta dados/PIN silenciosamente em JSON corrompido) sem depender de `migration.js` existir. `repairDrinkOrderCorruption()` (reparo de um bug de arraste da v2.1.23) foi removido sem perda: `normalizeData()` já filtra entradas `null` do array de bebidas em toda leitura.

**Atenção a um detalhe de nomenclatura:** a chave de armazenamento real e atual do FunTime 2 (bebidas/histórico) se chama, por herança histórica, `funtime-v1-data` — o "-v1-" é a versão do *schema de dados do FunTime*, não tem nenhuma relação com o app antigo "Intervalo", e não mudou nesta rodada.

`sw.js` perdeu 3 entradas do `APP_SHELL` e os campos `migrationProtocol`/`transitionProtocol` das mensagens do service worker (o mecanismo de exclusividade entre janelas em si continua, renomeado `prepareBootClients`/`hasCurrentBoot`). `reset.js` perdeu a limpeza de chaves só-v1 (já eram no-ops garantidos). Testes: `tests/transition*.test.cjs`, `tests/receiver*.test.cjs`, `tests/migration*.test.cjs`, `tests/release.test.cjs` e `tests/bridge-fixture.cjs` saíram; os cenários genuinamente sobre a v2 que estavam misturados neles foram extraídos para `tests/install-browser.test.cjs`, `tests/update-lock-browser.test.cjs` e `tests/sw-boot.test.cjs`. Detalhe completo em `docs/specs/0018-remove-v1-support.md`.

Nenhuma mudança de formato de dados ou `DATA_VERSION`. Validado: `node --check`/`node --input-type=module --check` em todos os arquivos tocados; suíte completa (138/139, única falha conhecida e pré-existente, não relacionada a este código); teste manual completo confirmado pelo usuário (boot do zero, cadastro/anotação, PIN, duas janelas simultâneas, reset de dados, agenda de eventos, atualização de versão). App, boot, rodapés e cache alinhados a 2.1.38; DATA_VERSION 11 preservado.

## V2.1.37 — render() da Home separado em tick (texto) e render estrutural

`startClock()` chamava `render()` a cada segundo enquanto a view era "home", reconstruindo todos os cards do zero (`drinkList.innerHTML = ""`, reclona template, reanexa listeners) mesmo quando só o texto do contador mudava. `describeDrinkForRender()` extrai o cálculo de `neutral`/nota-de-evento que já existia inline em `render()`, reaproveitado também pela nova `tickDrinkCards()`. Essa função calcula uma assinatura (id, grupo recente/manual, estado, `neutral`, nota de evento, modo cabeça-para-baixo) de cada bebida exibida e só cai para o `render()` completo quando ela difere da última desenhada — cobrindo os dois jeitos de algo mudar só com o tempo passando, sem ação do usuário: uma dose que termina o intervalo (muda de estado) e uma dose concluída que sai do grupo "recentes" depois de 24h (`isDrinkInRecentGroup`, reordena os cards). Fora desses casos, só `time.textContent` e o `aria-label` do botão principal são atualizados (`setTickingCardText()`, extraída do texto que já existia nos estados `waiting`/`danger`). Nenhum outro ponto que chama `render()`/`refreshDataViews()` diretamente muda — a otimização é só do tick do relógio. `tests/render-tick-browser.test.cjs` cobre os três cenários manipulando timestamps diretamente, sem depender de tempo real. App, boot, rodapés e cache alinhados a 2.1.37; DATA_VERSION 11 preservado.

## V2.1.36 — refactor de arquitetura: módulos ES nativos, persistência unificada

`app.js` foi dividido em módulos ES nativos sob `src/`, carregados via `<script type="module">` sem bundler — enquanto os arquivos que ainda são scripts clássicos (o próprio `app.js`, `occasions-ui.js`, `reset.js`, `navigation.js`) leem os símbolos publicados por `src/bootstrap/legacy-bridge.js` em `globalThis`. Extraído: formatters de data/hora e modo de contagem (`src/format/`), assinatura ECDSA do WebAuthn e derivação de PIN (`src/security/`), a camada única de persistência `commitAppData()` (`src/data/store.js`), diálogos/wheel-picker/erros de campo (`src/ui/`), drag-and-drop de bebidas e do catálogo de ícones — mantidos em arquivos separados sem unificar a lógica, por divergirem demais em auto-scroll, cálculo de alvo e gatilhos de cancelamento (`src/ui/drink-reorder.js`, `src/ui/icon-reorder.js`), easter eggs (`src/easter-eggs/`) e a validação do formulário de bebida (`src/drinks/validate.js`).

Os 15 pontos onde o app grava dados (bebidas, histórico, preferências, catálogo de ícones, backup) foram auditados e migrados para a camada única de persistência. Oito deles mutavam `state` antes de tentar gravar no `localStorage`, sem tratamento de erro em toda a cadeia de chamada — uma falha de armazenamento (`QuotaExceededError`) deixava a tela e os dados salvos divergentes, silenciosamente. Todos corrigidos: agora montam o próximo valor antes de gravar, só atualizam `state` depois do sucesso, e mostram uma mensagem de erro que não existia antes. Cada extração e cada correção tem spec própria em `docs/specs/0001` a `0015`, com o contrato, os casos de borda preservados e o plano de teste.

Nenhuma mudança de comportamento visível, de formato de dados ou de `DATA_VERSION`. Validação por fase: `node --check` nos arquivos tocados, suíte completa (`npm test`, `node --test --test-concurrency=1`), testes de navegador existentes exercitando os fluxos afetados, smoke test manual do usuário nas fases que tocaram diálogos/drag-and-drop, e teste manual completo antes deste release. App, boot, rodapés e cache alinhados a 2.1.36; DATA_VERSION 11 preservado.

## V2.1.35 — reset completo do Popover das notificações

`#toast.app-notification[popover]` passa a sobrescrever explicitamente o box nativo do Popover: `inset`, largura, altura, mínimos, máximos, margem, box sizing e overflow. O posicionamento usa `safe-area-inset-right/bottom`; a altura máxima é `min(50dvh, 320px)`. O backdrop fica transparente e não captura eventos. O fallback de `showToast()` para navegadores sem `showPopover()` permanece inalterado. Teste integrado em 390×844 verifica largura, altura e distância das bordas. App, boot, rodapés e cache 2.1.35; DATA_VERSION 11 preservado.

## V2.1.34 — mensagem de espera condicionada ao Web Lock

O boot deixa de exibir preventivamente a orientação para fechar janelas. Antes de `navigator.locks.request()`, mostra **Abrindo o FunTime…** e inicia um atraso de 800 ms; o aviso de concorrência só substitui o texto se o callback do lock ainda não tiver iniciado. A aquisição ou rejeição cancela o temporizador. O lock `funtime-app-writer-v1` continua mantido por toda a vida da janela, sem mudança na exclusividade de escrita, migração ou armazenamento. App, boot, rodapés e cache 2.1.34; DATA_VERSION 11 preservado.

## V2.1.33 — ações diretas nos detalhes do evento

`openOccasionDetails()` deixa de criar `details/summary` para `.agenda-options`: Editar, Reabrir, Cancelar agendamento e Excluir evento são renderizados diretamente conforme o estado. O grupo principal recebe `.is-active` durante um evento em andamento, removendo apenas nesse caso a expansão de coluna do botão primário e posicionando **Encerrar evento** ao lado de **Ver registros**. Outros botões primários, como **Iniciar agora**, continuam ocupando a largura disponível. App, boot, rodapés e cache 2.1.33; DATA_VERSION 11 preservado.

## V2.1.32 — exceção de bloqueio no cadastro do evento

O formulário de evento mostra `#occasion-unlock-field` quando a proteção está ativa e o modo efetivo é **Iniciar agora**. A opção fica oculta para agendamentos, eventos encerrados e cadastros retroativos que ainda estão no fluxo de data. Após persistir o evento, a preferência local é associada ao novo ID; falha ao gravar a configuração de segurança mantém o evento criado e preserva o erro visível. O texto dos detalhes também passa a ser **Manter app desbloqueado durante este evento**. App, boot, rodapés e cache 2.1.32; DATA_VERSION 11 e SECURITY_CONFIG_VERSION 3 preservados.

## V2.1.31 — verificação manual de atualizações

Configurações inclui `#check-app-update`, que primeiro recupera `registration.waiting` sem depender de uma nova consulta à rede. Sem worker aguardando, força `registration.update()` e apresenta estados distintos para atualização disponível, instalação em andamento, versão atual, consulta concorrente e falha/offline. A verificação automática continua silenciosa quando não há atualização. App, rodapé e cache 2.1.31; DATA_VERSION 11 preservado.

## V2.1.30 — exceção local de bloqueio durante evento

Nos detalhes de um evento em andamento, a proteção ativa revela o toggle **Manter desbloqueado durante este evento**. A escolha grava apenas `eventUnlockOccasionId` na configuração de segurança local, que já fica fora de backups e transferências. O privacy shield continua cobrindo o app em segundo plano; no retorno, a autenticação é dispensada enquanto o mesmo evento permanecer ativo. Inicialização e retorno também validam o vínculo, inclusive após reconciliação da agenda. Encerrar, excluir ou desativar o evento limpa a exceção; **Bloquear agora** a cancela antes de bloquear. Eventos pendentes ou encerrados não oferecem o controle. `SECURITY_CONFIG_VERSION` 3 continua compatível porque o campo é opcional; DATA_VERSION 11 preservado. App, boot, rodapés e cache 2.1.30.

## V2.1.29 — filtro contextual no histórico da bebida

`refreshOccasionFilters()` passa a derivar as opções dos registros no escopo atual. No histórico de uma bebida, eventos sem consumo correspondente deixam de aparecer e **Sem evento** só é oferecido quando existe dose sem vínculo. O `select` nativo foi substituído por um listbox compacto com fechamento externo, Escape, setas, Home/End e estado acessível. `openHistoryView()` define a bebida antes de atualizar as opções. Regressão integrada cobre evento exclusivo de outra bebida e seleção de registros sem evento. App, boot, rodapés e cache 2.1.29; DATA_VERSION 11 preservado.

## V2.1.28 — ativação em 500 ms e hierarquia do menu

`DRINK_REORDER_PRESS_MS` passa de 750 para 500 ms. O menu contextual remove o atalho `#drink-menu-delete` e seu listener; excluir a bebida continua disponível no editor, com as mesmas confirmações e opções de preservação do histórico. `#drink-menu-stop`, visível somente durante uma contagem ativa, recebe a classe visual `danger`. Nenhum dado ou schema muda.

## V2.1.27 — um único gesto de pressão longa nos cards

O reconhecedor de pressão longa de `attachDrinkInteractions()` foi removido: nenhum ponto do card abre mais `openLogDialog()` ao segurar. `attachDrinkReorderGesture()` passa a observar toda a área `.drink-main` dos cards pertencentes ao grupo manual e conserva o ícone apenas como feedback visual durante a espera e o arraste. Cards recentes/em andamento não recebem esse reconhecedor e continuam impedidos de entrar na lista manual. O menu `⋮` é o caminho explícito para anotação manual; duplo toque e cooldown contra toques excedentes permanecem independentes.

## V2.1.26 — ciclo de vida do gesto de registro

`attachDrinkInteractions()` passa a acompanhar movimento, `pointerup` e `pointercancel` no documento durante uma pressão, além de cancelar em blur e ocultação. O callback de 750 ms exige `mainButton.isConnected`, impedindo que um card substituído pelo `render()` abra o diálogo retroativo. Todo `click` encerra preventivamente a pressão. Depois de reconhecer o segundo toque, `ignoreDrinkGestureUntil` absorve novos `pointerdown` e `click` por 520 ms; isso transforma sequências acidentais de três ou quatro toques em um único registro. O menu `⋮` continua sendo a alternativa explícita para anotação manual.

## V2.1.25 — bloqueio da rolagem durante o arraste

O listener de `touchmove` da espera passa a ser não passivo: oscilações dentro da tolerância de 18px chamam `preventDefault()`, enquanto movimentos maiores cancelam a pressão e permanecem disponíveis para rolagem. Durante o arraste, o bloqueio já existente continua ativo. O autoscroll deixou de usar uma zona fixa de 88px baseada no dedo e agora calcula os limites da cópia do card; só chama `scrollBy()` quando o topo fica negativo ou a base ultrapassa `innerHeight`. A ativação automática excepcional do Service Worker foi removida após a recuperação da v2.1.24.

## V2.1.24 — estabilidade e recuperação do arraste

A pressão de 750 ms agora marca `pendingDrinkReorderId`, impedindo que o relógio reconstrua o DOM antes de o arraste começar. O long press no corpo do card também passa de 600 para 750 ms. Uma reconstrução funcional cancela a espera ou o gesto ativo; a finalização é idempotente e `persistManualDrinkOrder()` rejeita referências ausentes ou repetidas antes de montar o array. Animações FLIP anteriores são canceladas por card e o placeholder arrastado não é animado, eliminando a disputa visual observada no aparelho.

A falha da v2.1.23 foi reproduzida: se o DOM fosse reconstruído durante a espera, o callback conservava a referência do card removido e `insertBefore()` o reinseria como uma segunda representação. Excluir a bebida enquanto esse gesto permanecia ativo permitia que a finalização tardia resolvesse o ID apagado como `undefined`; `JSON.stringify()` o gravava como `null`, corretamente recusado pela barreira de migração na abertura seguinte.

`FunTimeMigration.repairDrinkOrderCorruption()` atua somente em instalações já marcadas como migração concluída e somente quando `drinks` contém `null`. Remove essas posições, valida integralmente o candidato com o contrato atual e verifica a gravação. JSON inválido, IDs duplicados, migração incompleta ou qualquer outro conflito permanecem bloqueados. Eventos órfãos continuam preservados como snapshots históricos. A v2.1.24 usa `skipWaiting()` excepcionalmente na instalação do Service Worker para alcançar usuários presos antes do carregamento do app; a política normal de confirmação deve voltar na versão seguinte.

Validação automatizada inclui reprodução do gesto interrompido pela reconstrução, exclusão do card durante o arraste sem posição nula, toque CDP, persistência, navegação/mundo invertido e reparo positivo/negativo da migração. Celular real ainda precisa confirmar a suavidade do gesto e a recuperação automática da instalação afetada.

## V2.1.23 — ordem manual das bebidas

`state.drinks` passa a representar a ordem manual canônica. `getDrinkDisplayGroups()` projeta essa lista em bebidas recentes, ordenadas pelo último consumo, e bebidas manuais, sem alterar os dados. Com eventos ativos, o primeiro grupo inclui registros do evento atual e qualquer contagem ainda em andamento; sem eventos, usa contagens ativas e registros das últimas 24 horas. A preferência opcional `prioritizeRecentDrinks` assume `true` em dados antigos e pode reunir toda a Home na ordem manual.

Pressionar por 500 ms somente o ícone de um card manual inicia o arraste, troca temporariamente o emoji por `⠿`, cria uma cópia flutuante e desloca os demais cards. O restante do card conserva duplo toque e pressão longa para anotar. A renderização completa de um segundo é suspensa durante o gesto; soltura válida grava a ordem e cancelamento ou falha restaura os dados. Novas bebidas e importações aditivas já entram no final, enquanto exportação e backup conservam a sequência do array. DATA_VERSION 11 preservado por ser uma preferência opcional retrocompatível.

Validação: `node --check app.js`, `node --check sw.js` e `git diff --check`; cinco testes integrados aprovados em viewport 390×844, cobrindo toque CDP, intenção de rolagem, separação, persistência, retorno após 24h, preferência, navegação e mundo invertido. A captura da Home foi conferida. A rodada não-browser teve 83 aprovações e quatro falhas preexistentes/independentes em `migration-sw.test.cjs` (expectativas fixas da v2.0.0) e `v2-preview.test.cjs` (query `?rev=2` tratada como parte do nome físico). Celular real, atualização da PWA e lista longa no aparelho não testados.

## V2.1.22 — cards e navegação invertidos

Quando `state.upsideDownActive` está ativo, `render()` antepõe `.card-actions` a `.drink-main`; o CSS atribui explicitamente as colunas invertidas, espelha a grade interna, alinhamento, padding, gradientes e barras de estado. A renderização normal mantém a ordem original do template. A navegação inferior tem seus filhos revertidos ao iniciar e novamente ao encerrar o efeito, fazendo a ordem de foco acompanhar a apresentação. O encerramento já protegido por `wasActive` impede uma segunda reversão acidental.

O teste integrado cobre ordem DOM e colunas dos cards, posição do ícone, alinhamento dos textos, ordem dos itens da navegação e restauração após 20s. Sintaxe de app.js/sw.js, diff e 25 testes audit/upside-down-browser aprovados; captura 390×844 conferida. `scripts/dev-server.cjs` e a auditoria agora removem query strings antes de comparar itens do APP_SHELL com arquivos físicos, permitindo testar recursos versionados como `icon-maskable-512-v2.png?rev=2`. Celular real e atualização da PWA não testados. Commit e push solicitados. App, boot, rodapés e cache alinhados a 2.1.22; DATA_VERSION 11 e política 1.0.2 preservados.

## V2.1.21 — notificações compactas

Texto à esquerda e ações em coluna à direita, botões de 32px e fechamento por × com rótulo acessível. Temporização reduzida para 2,5s em avisos comuns e 4s com Desfazer ou erro; persistent e callbacks preservados. App, boot, rodapés e cache alinhados a 2.1.21, sem mudança de schema ou política.

Validação: sintaxe de app.js/sw.js, cinco testes de ui/release e git diff --check. Aparência em navegador, celular real e atualização da PWA não testados nesta entrega. Commit e push solicitados.

## V2.1.20 — início direto e ações visíveis

changeOccasion dispensa a confirmação apenas para start; mantém validações de bloqueio, conflito e persistência. O início efetivo usa o horário atual. Nos detalhes de eventos pendentes sem autoStart, as ações secundárias usam um bloco visível em vez de details. As confirmações de encerramento, cancelamento, reabertura e exclusão permanecem.

App, boot, rodapés e cache alinhados a 2.1.20; schema e política preservados. Validação: sintaxe de app.js, sw.js e occasions-ui.js; 12 testes de agenda, occasions, release e ui; git diff --check. Interface no navegador, toque em celular e atualização da PWA não testados nesta entrega. Commit e push solicitados.

## V2.1.19 — rodapé sem seleção de texto

CSS aplica user-select: none, prefixo WebKit e bloqueio de touch-callout aos rodapés e seus descendentes. O link de políticas mantém a interação; gestos do BPM não foram alterados. App, boot, rodapés e cache alinhados a 2.1.19, sem alteração de schema ou política.

Validação: node --check app.js, node --check sw.js, git diff --check e cinco testes de release/ui aprovados. O teste tap-bpm-browser não concluiu com sucesso na validação local e foi interrompido após reportar falha. Toque em celular real e atualização da PWA não testados. Commit e push solicitados.

## V2.1.17 — abertura fixa do ciclo de frases

`UPSIDE_CYCLE_OPENING_PHRASE` identifica a abertura. Ao criar o baralho, o algoritmo separa essa frase, embaralha dinamicamente todas as demais e coloca a abertura na posição consumida primeiro por `pop()`. Se a frase for removida da lista principal futuramente, o baralho continua funcionando apenas com as frases disponíveis. As respostas rápidas não consomem nem recriam o baralho.

Validação: `node --check app.js`, `node --check sw.js`, `git diff --check` e 25 testes em audit/upside-down-browser, incluindo abertura do primeiro ciclo, 11 frases únicas, interrupção especial e abertura do ciclo seguinte. Celular real e atualização da PWA não testados. Commit e push solicitados. App, boot, rodapés e cache alinhados a 2.1.17; DATA_VERSION 11 e política 1.0.2 preservados.

## V2.1.16 — baralho de frases e respostas à insistência

As 11 frases do mundo invertido usam Fisher–Yates para formar um baralho em memória. Cada chamada remove uma frase; somente ao esvaziar o baralho ocorre novo embaralhamento. Se a próxima frase do novo ciclo coincidir com a última exibida, ela troca de posição, eliminando repetição na fronteira. O código depende de `upsidePhrases.length`, permitindo ampliar a lista sem alterar o algoritmo.

Ativações cujos inícios estejam separados por até `UPSIDE_RAPID_GAP_MS = 45000` incrementam uma sequência rápida; acima desse limite, ela volta a 1. As posições 10 a 14 usam, em ordem, as cinco frases de `upsideRapidPhrases`. Essas posições não consomem o baralho padrão. A partir da posição 15, a seleção padrão retoma as frases pendentes. Datas e filas ficam apenas em memória e são descartadas ao fechar/recarregar o app.

Validação: `node --check app.js`, `node --check sw.js`, `git diff --check` e 25 testes em audit/upside-down-browser. O teste integrado fixa a fonte aleatória e o relógio para provar ausência de repetição nas 11 escolhas padrão, ordem das cinco respostas, continuação do baralho e reinício da sequência rápida após 45.001ms. Celular real e atualização da PWA não testados. Commit e push solicitados. App, boot, rodapés e cache alinhados a 2.1.16; DATA_VERSION 11 e política 1.0.2 preservados.

## V2.1.15 — contagens e frases no mundo invertido

Durante os 20s do efeito, a apresentação usa o modo oposto à preferência salva: regressiva vira normal e normal vira regressiva. Home e Histórico compartilham a resolução do modo temporário, inclusive na atualização do relógio e ao navegar. Encerrar o efeito restaura imediatamente a apresentação; nenhum timestamp, snapshot ou preferência é alterado. O seletor nas configurações continua mostrando a preferência salva. Se ela for alterada durante o efeito, a apresentação acompanha o inverso da nova escolha e usa essa escolha ao terminar.

Cada ativação sorteia uma das seis frases solicitadas, em texto de 11px abaixo de Final. A frase entra pela direita e sai à esquerda ao longo de 20s, com bordas esmaecidas; ocupa a margem existente sem deslocar cards. Movimento reduzido exibe a frase estática. O texto é removido junto com o efeito.

Validação: sintaxe app.js/sw.js, diff e 24 testes em audit/upside-down-browser aprovados. Navegador Edge com dados isolados: ambos os modos, Home, Histórico durante e após o efeito, preservação do conteúdo exportável/armazenamento, gesto e movimento reduzido. Captura 390×844 conferida. Celular real e atualização da PWA não testados. Commit e push solicitados. App, boot, rodapés e cache alinhados a 2.1.15; DATA_VERSION 11 e política 1.0.2 preservados.

## V2.1.14 — mundo invertido

Na Home, FunTime substitui Uso pessoal mantendo o tamanho da fonte. Segurar por 1,5s o cabeçalho (textos ou espaço livre até o início do conteúdo) ativa TimeFun / Final por 20s. Fundo CSS local com névoa azul/vermelha, partículas e sombras de raízes; funciona offline, sem mídia adicional. Controles, estados dos intervalos e avisos continuam visíveis. Soltar antes do prazo, mover mais de 12px, rolar ou usar outro dedo cancela a pressão. Os efeitos de vídeo e BPM não se sobrepõem ao mundo invertido. Escape, ocultação da página e bloqueio encerram o efeito; movimento reduzido desativa as animações. Nenhum dado ou preferência é gravado.

Validação: node --check app.js e sw.js; testes upside-down-browser e tap-bpm-browser aprovados no Edge headless, com origem e armazenamento isolados. Cobertura de textos/espaço vazio, prazo de ativação, cancelamento, restauração, controles operáveis, movimento reduzido e preservação do armazenamento. Captura em 390×844 inspecionada. Celular real e atualização da PWA não testados. Commit e push solicitados. App, boot, rodapés e cache alinhados a 2.1.14; DATA_VERSION 11 e política 1.0.2 preservados.

## V2.1.13 — streaming imediato com cache posterior

Quando um MP4 ainda não está em `funtime-bg-v1`, o elemento `video` recebe diretamente a URL hospedada e pode começar por respostas Range, sem aguardar o arquivo completo. Para não concorrer com esse streaming, o fetch integral começa ao terminar o efeito e povoa o cache em segundo plano; o Service Worker evita duplicar a gravação quando já a concluiu. Em cache hit, o app usa uma blob URL local e mantém o funcionamento offline sujeito à política de armazenamento do navegador. A entrada local não tem transição; a saída ainda esmaece por 2s. O gesto do aviso dispara após 1,5s. App, boot, rodapés e cache alinhados a 2.1.13; política 1.0.2 e DATA_VERSION 11 preservados.

## V2.1.12 — fundos locais sob demanda e vibração

BACKGROUND_VIDEO_SOURCE seleciona local por padrão e preserva o ramo youtube para reversão simples. Sete MP4s em bg (58.779.908 bytes) ficam fora de APP_SHELL: a instalação termina sem baixá-los. No primeiro sorteio de cada arquivo, fetch baixa a resposta completa, grava em funtime-bg-v1 e reproduz por blob URL; usos seguintes leem esse cache, inclusive offline enquanto o navegador não o remover. O Service Worker separa os fundos do cache versionado e não guarda respostas Range parciais. Não há pré-download automático nem consumo dos 56 MiB sem o gesto do usuário.

Ao disparar, navigator.vibrate(1200) fornece retorno tátil onde houver suporte; ausência, bloqueio ou truncamento pelo navegador não interrompem o vídeo. O elemento local usa autoplay, muted, loop, playsInline, controls=false, object-fit cover e o mesmo fade/vidro da 2.1.11. App, boot, rodapés e cache alinhados a 2.1.12; política 1.0.2 e DATA_VERSION 11 preservados.

## V2.1.11 — disparo rápido e entrada suave

Pressionar o aviso por 2s ativa o fundo. O iframe permanece invisível durante o carregamento inicial; 1,2s após o evento load, entra com transição de opacidade de 2s e então permanece por 20s antes do fade de saída. Parâmetros loop e playlist removidos para evitar controles anterior/próximo; controls=0, mute=1, playsinline e bloqueio de teclado preservados. Vídeos do YouTube continuam externos ao Service Worker e não têm disponibilidade offline garantida. App, boot, rodapés e cache alinhados a 2.1.11; política 1.0.2 e DATA_VERSION 11 preservados.

## V2.1.10 — pressão longa e nova seleção de fundos

Pressionar continuamente o card de aviso da Home por 6s ativa o fundo; soltar ou mover mais de 12px antes disso cancela. Toques curtos continuam alimentando o BPM, sem espera ou conflito. A lista passa a Q6SzupOIkrs, Kjc3Q3Z1a-M, RtDRL2DMujw, 0Tq9yS-OBSE, O2kjyld_fX8 e DdkAqgDWzvk, todos respondendo ao oEmbed do YouTube em 10/09/2026. Fundo integrado, opacidade, vidro, duração e privacidade da 2.1.9 preservados. App, boot, rodapés e cache alinhados a 2.1.10; política 1.0.2 e DATA_VERSION 11 mantidos.

## V2.1.9 — vídeo integrado ao fundo

Dois toques no aviso da Home seguidos de uma pressão de 900ms no terceiro toque abrem, sem áudio, um entre doze Shorts incorporados do YouTube. O player fica fixo atrás da interface por 20s, preenchendo a viewport com opacidade de 52%; cards e navegação recebem fundo translúcido, desfoque e contraste, permanecendo utilizáveis. A escolha evita repetir imediatamente o último vídeo. Falha de carregamento devolve a interface em até 10s. Oito toques no mesmo aviso também acionam o BPM; seleção de texto e menu de contexto ficam desativados somente nesse card. Rolagem, arraste, outros dedos, diálogos e bloqueio cancelam a sequência.

O carregamento ocorre apenas após o gesto e usa youtube-nocookie.com; policies.html declara a conexão externa e TERMS_VERSION 1.0.2 exige novo aceite. Dados do app não são enviados pelo código ao player. App, boot, rodapés e cache alinhados a 2.1.9; DATA_VERSION 11 preservado. Correção solicitada após o teste da 2.1.8 e autorizada para publicação pelo pedido anterior de commit e push.

Validação: sintaxe de app.js, sw.js e policies.js; 26 testes aprovados em audit, release e tap-bpm-browser antes do primeiro envio. Cobertura de BPM no aviso, texto não selecionável, gesto com pressão, player mudo e sem controles, retorno automático, ausência de repetição imediata, movimento reduzido e armazenamento preservado. O ajuste para background acrescenta verificação de interface visível e operável, player sem captura de ponteiro e superfícies translúcidas. Os doze links responderam ao oEmbed do YouTube em 10/09/2026. Reprodução e autoplay reais no celular, vídeo removido/bloqueado futuramente e atualização da PWA instalada não testados.

## V2.1.8 — primeiro teste do fundo com Shorts

O primeiro envio usava o mesmo gesto e lista, mas colocava o player acima de toda a interface durante 20s. Isso impedia o uso do app e não correspondia ao efeito de background solicitado; corrigido na 2.1.9.

## V2.1.7 — easter egg de BPM

Oito toques no fundo livre do Início exibem o BPM dos sete intervalos em texto verde translúcido que sobe e desaparece em 2,2s. Faixa de 30–300 BPM; pausa acima de 2s reinicia a sequência. Cards, textos e controles não contam. Rolagem, pressão longa, múltiplos dedos, mudança de tela, diálogos, avisos e bloqueio interrompem a captura. Movimento reduzido usa apenas esmaecimento. Sem persistência ou alteração de schema. App, boot, rodapés e cache alinhados a 2.1.7; DATA_VERSION 11 preservado. Commit e push autorizados para teste no celular.

Validação: sintaxe de app.js e sw.js; teste tap-bpm-browser aprovado no Edge com perfil isolado, cobrindo cálculo, pausa, sete toques insuficientes, descarte de gestos, diálogos, limpeza do efeito, movimento reduzido e armazenamento preservado. O teste dev-preview-browser falha na expectativa de card neutro (linha 29), também reproduzida com app.js de HEAD anterior à mudança. Toque físico, aparência no celular e atualização da PWA não testados.

## V2.1.6 — acesso direto ao evento ativo

O card de evento em andamento na Home abre diretamente os detalhes desse evento. Sem evento ativo, o mesmo card continua levando à lista de eventos. Fechar os detalhes retorna à Home. App, boot, rodapés e cache alinhados a 2.1.6; DATA_VERSION 11 preservado. Teste integrado occasions-browser aprovado; celular real e atualização da PWA não testados. Commit e push solicitados.

## V2.1.5 — pulsos festivos no evento ativo

O brilho do card de evento ativo percorre vermelho, azul, roxo e amarelo em um ciclo de 6s, com três pulsos suaves e mais próximos. Tamanho do card e preferência de movimento reduzido preservados. App, boot, rodapés e cache alinhados a 2.1.5; DATA_VERSION 11 mantido. Commit e push solicitados após aprovação da prévia pelo usuário.

## V2.1.4 — brilho suave com amarelo

Card de evento ativo recebe amarelo dourado suave e um pequeno aumento na intensidade das sombras. Tamanho, ciclo de 17s e respeito a movimento reduzido preservados. App, boot, rodapés e cache alinhados a 2.1.4; DATA_VERSION 11 mantido. Teste integrado occasions-browser aprovado no Edge headless; aparência no celular e atualização da PWA não verificadas. Commit e push solicitados.

## V2.1.3 — histórico e destaque de evento

Eventos desativados ocultam filtro, nomes e campo no editor do histórico, preservando vínculos. Registros mostram data após 24h completas, com atualização automática. Card ativo mantém tamanho compacto, ganha 🎉 e brilho colorido suave, estático com movimento reduzido. App, boot, rodapés e cache alinhados a 2.1.3; DATA_VERSION 11 preservado. Sintaxe e 24 testes aprovados antes do release; celular real e aparência da animação no aparelho não testados. Commit e push solicitados.


## Ajustes locais — histórico e destaque de evento

Eventos desativados ocultam filtro, nome nos registros e campo no editor; o histórico permanece completo e os vínculos são preservados. Edição fora do período original continua bloqueada, com mensagem sem referência a eventos quando desativados. Histórico reutiliza a regra do Início: horário antes de 24h completas, data dd/mm/aa a partir daí, inclusive ao atualizar pelo relógio da página.

Card de evento ativo recebe 🎉 e sombras suaves vermelha, azul e roxa em ciclo de 17s, sem alterar padding ou borda; texto longo usa reticências para manter uma linha. Movimento reduzido usa brilho estático. Incluído no release 2.1.3, com commit e push autorizados; schema 11 preservado.

Validação: sintaxe app.js, sw.js e occasions-ui.js; 23 testes de audit e teste integrado occasions-browser aprovados no Edge headless com perfil isolado e dados fictícios. Inclui limite de 24h durante atualização, ocultação/reativação de eventos antigos, altura do card ativo e movimento reduzido. Celular real, avaliação visual da animação e atualização da PWA não testados. Armazenamento real preservado.

## V2.1.2 — eventos opcionais

Usar eventos desmarcado por padrão. Desativação preserva histórico e contagens, encerra o evento atual e suspende agendamentos; reativação não inicia automaticamente os vencidos. Sem eventos, cards concluídos ficam neutros após 24h. App, boot, rodapés e cache alinhados a 2.1.2; DATA_VERSION 11 preservado. Commit e push solicitados. Celular real não testado.


## V2.1.1 — cadastro de eventos passados

Cadastro retroativo com aviso e inclusão de registros sem evento no período. Abas Anteriores / Próximos; Iniciar agora usa o instante da confirmação e oculta a data. App, boot, rodapés e cache alinhados a 2.1.1; DATA_VERSION 11 preservado. Commit e push solicitados. Celular real não testado.


## V2.1.0 — eventos e navegação inferior

O usuário criou e enviou o commit 3bcfff7, com eventos e menu inferior, mas os identificadores internos ainda eram 2.0.12. Correção local: app, boot, rodapés e cache funtime-v2-1-0 alinhados a 2.1.0; A agenda evolui o schema para DATA_VERSION 11; backup formato 2 mantido. Sem reescrever o commit anterior. Agenda compacta, agendamento e automações implementados localmente para avaliação; estado atual em DEVELOPMENT.md.

Incluídos no commit do usuário: concluir Anotar consumo volta à Home após gravação bem-sucedida; editar o período de um evento inclui registros sem evento dentro dele, preservando vínculos existentes e snapshots.

## V2.0.12 — data do consumo anterior

No card do Início, Anterior mantém o horário antes de 24 horas e passa a exibir a data local em dd/mm/aa a partir de 24 horas completas. Preserva o sufixo de tamanho da dose; o relógio existente atualiza a apresentação sem reabrir o app. App/boot/footers 2.0.12, cache funtime-v2-0-12; DATA_VERSION 9 e aceite preservados. Commit e push solicitados. Celular real não testado.

## V2.0.11 — confirmações e exclusão

Alertas de arquivos inválidos usam notificações persistentes do app; exclusão de registro e desativação do bloqueio usam confirmação interna compartilhada, sem o cabeçalho do domínio GitHub. Bebidas sem histórico oferecem apenas Cancelar/Excluir bebida. Confirmar cancelamento da contagem volta ao Início; desistir mantém o menu. App/boot/footers 2.0.11, cache funtime-v2-0-11; DATA_VERSION 9 e aceite preservados.

Commit e push solicitados. Celular real e atualização da PWA no aparelho permanecem pendentes.

## V2.0.10 — padrões dos formulários

Horário do registro alinhado às roletas compartilhadas, data com dia da semana e hierarquia visual consistente. Formulários de bebida, dose, registro e PIN ocultam a conclusão sem alterações; reverter os campos deixa apenas Cancelar. Auditoria de duplicações registrada no ROADMAP.md. App/boot/footers 2.0.10 e cache funtime-v2-0-10; DATA_VERSION 9 e aceite preservados.

Commit e push solicitados. Validação em navegador com origem e perfil isolados; celular real e atualização da PWA no aparelho permanecem pendentes.

**Versão da aplicação:** `v2.1.0`\
**Versão do modelo persistido em desenvolvimento:** `DATA_VERSION = 11` (base publicada do recurso: 10)\
**Autor exibido na interface:** `arielkeybob`  
**Stack:** HTML + CSS + JavaScript puro  
**Persistência:** `localStorage`  
**Backend:** não existe  
**Build step:** não existe

## V2.0.9 — cancelar a dose atual

Cancelar contagem atual substitui Desfazer contagem atual. Após confirmação, remove somente a dose que iniciou a contagem ativa, sem criar registro ou marcador no histórico. Registros anteriores e de outras bebidas são preservados; o estado da bebida volta a ser calculado pelo último registro restante. Falha de gravação mantém a dose e confirmações obsoletas não removem outra dose. A leitura de countingStoppedAt permanece para compatibilidade com dados e backups da v2.0.8, sem apagar retroativamente registros existentes. Exclusão e confirmação de cancelamento exibem ícone e nome da bebida.

Validação local: node --check app.js/sw.js e 23 testes aprovados em audit, countdown-menu-browser e navigation-browser, com dados fictícios e perfil isolado. Celular real não testado.

## V2.0.8 — contagem e formulários

Menu da bebida separado em Dose e Cadastro. Desfazer contagem atual aparece somente com contador ativo, pede confirmação e encerra apenas o contador: dose, horário e intervalo original permanecem no histórico, com a indicação Contagem desfeita. Confirmações antigas são revalidadas e falha de gravação mantém a contagem. O marcador opcional countingStoppedAt é preservado em backup/restauração; dados antigos continuam válidos, sem migração de schema (DATA_VERSION 9). Horário do registro usa seletores de hora e minuto dentro do formulário, evitando o relógio nativo cortado. Contagem do intervalo usa o mesmo componente visual de Bloquear novamente. Exclusão passa a dizer Excluir bebida e histórico.

Teste integrado: `tests/countdown-menu-browser.test.cjs`, com perfil isolado e dados fictícios; verificar também no celular os seletores e o menu.

## V2.0.7 — diagnóstico como conteúdo auxiliar

Seção Diagnóstico de toque marcada com `clean-optional`: fica oculta quando Interface limpa está ativa, inclusive no padrão inicial. Desativar Interface limpa revela a ferramenta. Navegação ignora seções expansíveis sem layout visível, evitando uma etapa invisível no Voltar se o diagnóstico estava aberto. A visibilidade não altera o registro em memória nem sua ativação. Versão/cache 2.0.7; DATA_VERSION 9 e aceite preservados.

Usuário confirmou melhora da v2.0.6; relatório enviado registrou 15 inícios e 15 solturas na grade, sem cancelamento de arraste, nessa sessão. Não equivale a validação universal de aparelhos.

## V2.0.6 — estabilidade do toque e diagnóstico opcional

Relato do usuário: arraste intermitente, mais confiável com ponta do indicador. Não se considera resolvido em aparelho real apenas pelos testes do agente. Toque agora usa Touch Events pelo identifier, separado dos Pointer Events de mouse/caneta. Um pointercancel nativo não encerra um contato de toque que continua vivo; touchcancel real, segunda mão/dedo, fechamento, perda de foco e ocultação continuam cancelando sem gravar. Touchend é a única soltura de toque que aplica o destino. Antes dos 500ms, tolera oscilação até 18px e usa a posição mais recente na ativação. Touchmove não passivo bloqueia oscilação curta e o arraste ativo; movimento maior na espera libera a rolagem. Mouse mantém 10px e captura de ponteiro. Não foi adicionada vibração.

`touch-debug.js` carrega pelo boot antes do app e integra o pré-cache. Configurações → Diagnóstico de toque, seção recolhida, começa desativado; não persiste a ativação. Ativar limpa a sessão anterior; parar conserva o relatório em memória; apagar limpa; recarregar elimina tudo. Limites: 10 minutos/1.500 registros, movimentos amostrados a cada 40ms. Exportação JSON por download, independente de backup/bebidas, sem transmissão automática. Registra etapa, motivo de cancelamento, evento, tipo de ponteiro, dimensões/pressão do contato, distância de oscilação e tempo relativo. Inclui versão, navegador e dimensões da tela; não lê armazenamento, coordenadas absolutas, campos, nomes, emojis, histórico ou segurança. O diagnóstico permanece opcional e pode ser usado para testar com ele desativado/ativado.

Roteiro no aparelho: ativar registro; voltar ao cadastro; repetir toques curtos, pressão com polpa/ponta do dedo, pequenas oscilações e mudança de direção, reordenar e cancelar; retornar às configurações, desativar e Exportar relatório de toque. Exportar antes de fechar/recarregar. O resultado real e o relatório determinarão novos ajustes. App/boot/SW/footers 2.0.6 preparados localmente, cache `funtime-v2-0-6`, dados/aceite inalterados; publicação para validação no aparelho, em continuidade à melhoria autorizada.

## V2.0.5 — pressão longa e lixeira durante o arraste

Toque rápido seleciona; pressão de 500ms sobre o emoji inicia a prévia animada. Movimento acima de 10px antes do prazo, rolagem, soltura, perda de foco ou fechamento cancelam a espera. A captura do ponteiro só começa depois da espera. O listener touchmove não passivo é registrado antes do gesto; a rolagem nativa só é impedida durante o arraste ativo. Context menu/callout e arraste nativo do label são suprimidos. O clique residual da pressão longa não troca a seleção. Alt + setas/Home/End permite reordenar pelo input, sem alterar o uso normal das setas dos radios.

Lixeira vermelha flutua 18px abaixo da grade somente durante o arraste, sem deslocar os cards. Entrar realça o alvo; soltar dentro dele chama a mesma remoção do ×, sem confirmação adicional e com Desfazer. Soltar fora da grade/lixeira, Escape, pointercancel, segundo ponteiro, ocultação, perda de foco, resize e fechamento cancelam sem salvar. Bebidas, ícone selecionado e snapshots são preservados. Falha de persistência mantém o catálogo anterior e mostra erro. A caneta agora ativa somente exclusão, com × em vermelho e arraste desativado; ✓ conclui. Menu e alças retirados; Voltar continua encerrando o modo de exclusão antes do cadastro.

App/boot/SW/footers 2.0.5; cache `funtime-v2-0-5`, sem alteração de DATA_VERSION 9, backup, migração ou aceite. Testes e limitações da entrega em RELEASE-V2.md. Validar toque e leitor de tela no aparelho real; testes do agente usam perfil isolado e dados fictícios.

## V2.0.4 — menu da caneta e arraste animado

A caneta abre um grupo de dois botões: Reordenar ícones / Excluir ícones. O menu e o modo escolhido ocupam a mesma camada da navegação. Voltar fecha o menu ou conclui o modo sem sair do cadastro; ✓ também conclui. Alça e × são mutuamente exclusivos e usam o canto superior direito, mantendo as dimensões normais dos cards. A alça tem badge de 28px e área de toque ampliada para 44px dentro do card; somente ela impede o gesto de rolagem. Ajuda curta por modo; instruções de teclado acessíveis por aria-describedby, fora do layout.

Após deslocamento mínimo de 5px, o arraste exibe uma cópia visual não interativa sobre o diálogo. As posições originais da grade determinam o destino, independentemente dos elementos em animação. Transformações CSS de 160ms deslocam os demais cards e a vaga, sem reconstruir os inputs nem perder captura do ponteiro. A prévia não altera estado/armazenamento; só a soltura válida persiste o catálogo. Cancelamento, Escape, fechamento e falha de gravação descartam a prévia. Desfazer restaura a última ordem; mudanças no catálogo invalidam essa prévia de desfazer. Preferência de movimento reduzido desativa transições e ampliação da cópia. Dados, backups e migrações permanecem compatíveis.

App, boot, SW e footers 2.0.4; cache `funtime-v2-0-4`. DATA_VERSION 9 e aceite preservados. Validação da interface no Edge em origem/perfil isolados: menu/modos exclusivos e altura compacta, deslocamento visual antes de salvar, mouse, toque simulado/CDP, teclado, cancelamento, falha de gravação, Desfazer, excluir/desfazer exclusão, recarga, catálogo vazio, ícone selecionado fora da lista, 100 ícones com rolagem nas bordas e movimento reduzido. Imagens de menu e arraste conferidas em 390×844. Pendentes: toque, leitor de tela e atualização de instalação em celular real. Armazenamento real preservado. Registro de testes de release em RELEASE-V2.md.

## V2.0.3 — reordenar ícones

Implementado em 08/09/2026; commit e push autorizados. No modo da caneta, cada opção do catálogo ganha uma alça de 44px com Pointer Events e captura do ponteiro. Somente a alça usa `touch-action: none`; o emoji mantém seleção e rolagem. O destino recebe contorno, as bordas rolam automaticamente e a gravação acontece ao soltar sobre um ícone do catálogo. Soltar fora, pointercancel, perda da captura ou Escape cancelam sem gravar. Escape durante o arraste é consumido antes da navegação; concluir/fechar/reconstruir o editor encerra o gesto.

Na alça, cima/baixo movem uma posição, esquerda/direita duas (grade em duas linhas), Home/End movem ao início/fim. O foco e a seleção da bebida são preservados. Ícone atual fora do catálogo continua selecionável, sem alça. Catálogo vazio mantém + e caneta. A ordem é uma preferência global salva imediatamente, inclusive ao cancelar o rascunho, usando `preferences.iconCatalog` existente. DATA_VERSION 9, importação, backups e migração cumulativa permanecem compatíveis; falha de armazenamento mantém a ordem anterior e mostra erro.

Validação: `node --check app.js`, `node --check sw.js`; `node --test tests/icon-reorder-browser.test.cjs tests/navigation-browser.test.cjs tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs` — 36 aprovados. Teste integrado no Edge com origem/perfil efêmeros cobre mouse, toque simulado via CDP, cancelamento, setas/Home/End, seleção, falha de gravação e persistência após recarregar. Inspeção visual em 390×844 aprovada. Sem acesso ao armazenamento real. Pendentes: toque em celular real, leitor de tela, rolagem longa nas bordas com 100 ícones e atualização da PWA instalada. App, boot e footers 2.0.3; cache funtime-v2-0-3. DATA_VERSION e aceite preservados.

## V2.0.2 — instalação; navegação da V2.0.1 preservada

Consulte [NAVIGATION.md](NAVIGATION.md) para o mapa completo de telas, regras de cancelamento, integração com History API, testes e limites entre plataformas. Cache atual `funtime-v2-0-2`; dados e aceite preservados. Publicação autorizada em 08/09/2026. A v2.0.1 já estava no remoto; o ajuste de instalação recebe nova versão para distribuição pelo SW.

Página de instalação: o estado confirmado mostra “App já instalado” e orientação para abrir pelo ícone, sem convite para instalar. A detecção confere o manifest da v2 e a identidade quando fornecida, e é atualizada ao retornar à página. Aceitar o prompt continua significando apenas instalação iniciada. Sem API, a página oferece instruções sem afirmar que o app não está instalado. Nenhuma leitura adicional de dados privados.

Investigação da ponte congelada `7c75410`: “Abrir FunTime 2” é um link HTTPS para `/funtime/`, não uma instalação ou abertura garantida da PWA. A identidade nova exige instalação própria. Convite e ajuda da ponte implementados na árvore v1.16.1 descrita abaixo. Permanecem como sugestões para a página v2: ajuda recolhida “Vim da versão anterior”, ajuda “Já instalei” para navegadores sem detecção e instruções específicas para navegadores internos. Abertura por link depende do navegador e das preferências do usuário; não foi adicionado botão com promessa de abertura garantida.

Conclusão de instalação: `appinstalled` confirma o estado na sessão, mesmo sem getInstalledRelatedApps. Aceitar o prompt não basta; enquanto pendente, consulta a detecção a cada dois segundos por até um minuto, além de verificar ao retornar à página. Confirmação cancela o temporizador e invalida respostas anteriores; uma resposta atrasada do prompt ou da detecção não desfaz a conclusão. Um novo beforeinstallprompt permite oferecer instalação novamente. Não recarrega a página nem acessa dados privados para isso.

Validação do ajuste: `node --check app.js`, `node --check sw.js`, `node --test tests/install.test.cjs tests/receiver.test.cjs tests/transition.test.cjs tests/ui.test.cjs` (22 aprovados) e `git diff --check`. Teste integrado da tela no Edge aprovado, com eventos simulados e inspeção visual em 390×844; sem posse criada no navegador. Instalação/abertura real em celular não testada. A consulta ao Pages não pôde ser concluída; diagnóstico baseado no código local e na ponte congelada. Sem commit, push ou alteração de armazenamento real.

A melhoria da ponte foi implementada separadamente em `.worktrees/v1-16`, branch `codex/v1-16-install-ux`, baseada em `7c75410`, como v1.16.1 local com cache próprio atualizado. Inclui convite “Instalar FunTime 2”, ajuda para backup/instalação/transferência e orientação distinta após posse. Essa pasta é ignorada pela árvore v2; suas alterações devem ser revisadas e publicadas separadamente no repositório Intervalo somente quando solicitado. A fixture histórica `7c75410` permanece congelada.

## V2.0.0 — versão estável

Novo conjunto raster em `icons/*-v2.png`, mestre em `icons/funtime-master-v2.png`. `scripts/export-icons.cjs` usa Sharp apenas para exportar os tamanhos durante manutenção; não é dependência do app nem etapa de build para execução. O manifesto tem id `/funtime/`, com ícone maskable separado. Cache `funtime-v2-0-0`; sua limpeza remove shells de desenvolvimento v2, preserva os shells v1 e o fetch não intercepta recursos de `/intervalo/`.

`receiver.js` implementa inspeção, validação da ponte ativa, preparação e registro verificado de posse. Boot só permite `/funtime/` ou seu index, oferece instalação em abas comuns sem acessar dados privados e mantém o Web Lock por toda a vida da janela instalada. Sem posse, valida a ponte antes de esperar o lock e novamente sob o lock; estado existente sem ponte falha fechado. A confirmação antecede migração e posse. Sem dados, requer escolha explícita entre backup e início vazio; a restauração usa o fluxo existente com prévia e confirmação. Posse existente exige a presença dos dados, evitando recriação silenciosa depois de perda de armazenamento.

Primeiro acesso transferido exige novo desbloqueio, sem sessão herdada da v1. Dados, segurança e aceite permanecem na mesma origem, sem transportar segredos via backup. O app busca pendências nos caminhos `/intervalo/` e `/funtime/`, em ambos os caches de compartilhamento. Testes históricos usam `tests/bridge-fixture.cjs`, congelando a v1.16 no commit `7c75410`; testes do receptor usam as duas versões reais. Consulte V2-PREPARATION.md.

## V1.16.0 — diário compacto e contrato de posse

`FunTimeMigration.migrate()` agora é assíncrona e deve ser aguardada sob o lock exclusivo. O diário interno usa SHA-256 das origens/destinos durante prepared/committed; as cópias completas dos diários v1.15 são validadas e substituídas pelo formato compacto antes da retomada. O estado final continua version 1/done. DATA_VERSION permanece 9. Não é criptografia de backup.

`transition.js`, carregado antes do boot e incluído no cache, consulta `/funtime/transition.json` sem dados privados. Somente uma resposta JSON direta, ready, versão 2.x e protocolo compatível oferece abrir a nova instalação; ausência, erro ou resposta inválida mantêm a v1 normal. Também lê `funtime-installation-owner-v1`, que a v1 nunca grava. Se a futura v2 registrar posse válida, o boot interrompe antes de ler dados/segurança ou carregar app.js e mostra um link restrito a `/funtime/` na mesma origem. O lock `funtime-app-writer-v1` deverá ser compartilhado pela v2. O registro e o diário continuam fora do backup.

O handshake de janelas passa a protocol 2, incluindo a atualização de páginas v1.15. `GET_VERSION` e a resposta de `FUNTIME_PREPARE` anunciam capacidade de transição. Limpeza de shells fica restrita à geração v1, preservando v2 e caches de importação. Detalhes e condições de publicação em [TRANSITION-V2.md](docs/history/TRANSITION-V2.md).

## V1.15.0 — migração de identidade e armazenamento

O ponto de entrada agora carrega `migration.js` e `boot.js`. Na PWA, o boot verifica a versão ativa do SW e solicita `FUNTIME_PREPARE`: páginas antigas do app são navegadas para o shell novo e precisam responder ao protocolo antes da migração. Uma janela obtém o Web Lock `funtime-app-writer-v1` por toda sua vida; as demais aguardam, sem carregar estado privado ou escrever. O retorno de BFCache recarrega a página. A tela comum de instalação carrega estado vazio em memória e não ocupa esse lock.

O diário `funtime-migration-v1` tem etapas `prepared`, `committed`, `done`. Guarda temporariamente os valores de origem/destino, inclusive segurança; nunca é incluído nos backups. Cópias são relidas, conflitos bloqueiam e a limpeza só ocorre após a confirmação conjunta. Ao concluir, o diário fica apenas com versão/estado. Não há transação nativa entre várias chaves de localStorage; o protocolo permite retomar após falhas sem iniciar o app durante estado parcial. Não fazer downgrade para código antigo após a migração; ele desconhece os novos nomes.

Os dados usam `funtime-v1-data`, segurança `funtime-security-v1` e aceite `funtime-terms-v1`. Sessão, rascunho e aviso de restauração usam sessionStorage com prefixo `funtime-`; falha da sessão impede reaproveitar desbloqueio. Os adaptadores para `balada-*`, `intervalo-*` e os tipos de arquivos antigos são compatibilidade intencional. O reset considera as duas gerações e mantém estado vazio válido e aceite, sem ressuscitar dados.

O shell passa a `funtime-v1-15-0` e o SW procura recursos apenas no cache ativo, evitando misturar gerações. A limpeza remove caches versionados de shell; caches de recebimento ficam preservados. Na leitura de compartilhamento, pendência antiga tem precedência; se houver também uma nova, ela permanece para a próxima abertura. O arquivo só é retirado depois de seu conteúdo ser lido e construído. Os headers das duas gerações são reconhecidos.

Além dos testes existentes, executar `node --test tests/migration.test.cjs`. O teste `node --test tests/migration-browser.test.cjs` exige Playwright no NODE_PATH e Edge instalado (ou PWA_BROWSER_CHANNEL compatível). Ele serve a v1.14.3 do commit `06feefe693059ce7ff5586e04ce847e704eacdec` e a árvore atual em uma origem HTTP local temporária, com perfis isolados. Não acessa dados reais. O modo instalado é simulado via navigator.standalone; isso testa o código/SW no navegador, não a instalação no launcher nem biometria real. Situação final dos testes em [MIGRATION-FUNTIME.md](docs/history/MIGRATION-FUNTIME.md).

> Este documento descreve a arquitetura e o comportamento técnico da versão `v1.10.2`. Ele foi escrito para facilitar manutenção, depuração e evolução do projeto sem depender do histórico da conversa em que o app foi criado.

## Exportação TXT — V1.10.1

`exportDrinks()` gera `.txt` com MIME `text/plain`, preservando o payload JSON `intervalo-drinks` e sua versão de formato. A importação valida o conteúdo com o mesmo parser, independentemente da extensão; o seletor e o `share_target` aceitam TXT e JSON. Backup continua JSON. `DATA_VERSION` permanece 8 e o cache passa para `intervalo-v1-10-1`.

Validação desta alteração: sintaxe de app.js/sw.js e simulação Node dos caminhos de compartilhamento, download, cancelamento, conteúdo/MIME do arquivo e leitura TXT/JSON. A simulação não verifica integração com WhatsApp ou atualização do manifest no aparelho; esses fluxos precisam de teste na PWA publicada.

> Nota de continuidade: o documento também preserva descrições e exemplos de releases anteriores. Para preferências e arquivos de dados atuais, consulte as seções V1.9.0 e V1.10.0 ao final e confira o código; exemplos antigos com modelo 7 ou caches anteriores não representam a versão vigente. A procedência do contexto recuperado está em [CONTEXT.md](docs/history/CONTEXT.md), e as orientações de trabalho em [AGENTS.md](AGENTS.md).

---

## Alterações da V1.8.6

- O ícone global de Configurações permanece representado por **⚙**, por ser mais reconhecível como ação de configuração.
- O rodapé passa a ter duas linhas: disclaimer e metadados de versão/crédito.
- Disclaimer: `App para estudo · não é controle de segurança`.
- O footer não usa `position: fixed`; a `.app-shell` utiliza `min-height: 100dvh` + flex column e o footer usa `margin-top: auto`.
- Esse padrão mantém o rodapé visualmente no fim da viewport em páginas curtas sem cobrir conteúdo, e depois do conteúdo em páginas longas.
- Cache do Service Worker: `intervalo-v1-8-6`.

## 0. V1.8.0 — privacidade e bloqueio local

### 0.1 Organização do cabeçalho

A tela inicial continua priorizando as duas ações de uso frequente: `Histórico` e `+`. Para não disputar largura horizontal com uma terceira ação, `Configurações` foi posicionada como um botão circular de engrenagem na mesma linha do eyebrow `Uso pessoal`. O cabeçalho passa a ter duas linhas:

```text
Uso pessoal                                      ⚙
Início                              Histórico    +
```

Essa organização mantém `Configurações` descobrível, mas visualmente secundária.

### 0.2 Persistência de segurança

As opções de segurança não são gravadas em `balada-v1-data`. Existe uma chave independente:

```js
const SECURITY_STORAGE_KEY = "intervalo-security-v1";
```

Modelo atual:

```js
{
  version: 1,
  enabled: true,
  method: "device" | "pin",
  relockSeconds: 0 | 60 | 300 | 900,
  pin: { salt, hash, iterations } | null,
  webauthn: { credentialId, publicKey, algorithm } | null
}
```

`DATA_VERSION` permanece em `7` porque o schema de bebidas/eventos não mudou.

### 0.3 Bloqueio de interface

Quando o bloqueio está ativo, a classe `app-locked` torna `#app-shell` invisível e desabilita interação. A tela `#lock-screen` fica acima da aplicação. Ao carregar/recarregar uma PWA protegida, a sessão começa bloqueada.

Antes de bloquear, `closeSensitiveDialogs()` fecha dialogs no top layer. Isso é necessário porque um `<dialog open>` pode permanecer visível mesmo se apenas o container principal for ocultado.

### 0.4 Privacy shield no background

Quando `document.visibilityState` muda para hidden e a segurança está habilitada, `#privacy-shield` cobre a interface. O objetivo é reduzir a chance de o seletor de aplicativos do sistema capturar cards ou histórico.

- timeout `0`: o estado já passa para bloqueado ao esconder;
- timeout `60/300/900`: a sessão permanece autenticada internamente durante esse intervalo, mas a tela continua protegida pelo shield enquanto estiver em background;
- ao voltar antes do timeout, o shield é removido;
- ao voltar depois do timeout, o lock screen é apresentado.

O comportamento do app switcher varia entre Android/iOS e navegador; portanto o shield é uma mitigação, não uma garantia de sistema operacional.

### 0.5 PIN do aplicativo

Novos PINs têm 4 dígitos. PINs legados de 6 dígitos criados na V1.8.0 continuam válidos até serem substituídos. Antes da persistência:

1. gera-se salt aleatório de 16 bytes via `crypto.getRandomValues`;
2. o PIN é importado como material PBKDF2;
3. são usadas 210.000 iterações com SHA-256;
4. são derivados 256 bits;
5. apenas salt, hash e quantidade de iterações são armazenados.

O PIN original nunca é salvo. A comparação usa `equalBytes()` para evitar retorno antecipado por byte.

Depois de 5 falhas consecutivas, `pinLockoutUntil` bloqueia novas tentativas por 30 segundos. Esse contador é de sessão e não pretende substituir mecanismos criptográficos contra um atacante que controla o ambiente JavaScript.

### 0.6 WebAuthn / autenticação do aparelho

O método `device` exige contexto seguro e um user-verifying platform authenticator. A detecção usa:

```js
PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
```

Na criação da credencial:

- `authenticatorAttachment: "platform"`;
- `userVerification: "required"`;
- `residentKey: "discouraged"`;
- algoritmos solicitados: ES256 (`-7`) e RS256 (`-257`);
- `attestation: "none"`.

O app armazena somente o ID da credencial, a chave pública SPKI e o algoritmo. A chave privada permanece no autenticador/sistema.

No desbloqueio, `verifyDeviceCredential()` confere:

1. credential ID;
2. `clientData.type === "webauthn.get"`;
3. `clientData.origin === location.origin`;
4. challenge aleatório da requisição;
5. RP ID hash de `location.hostname`;
6. flags UP e UV do authenticator data;
7. assinatura sobre `authenticatorData || SHA256(clientDataJSON)`.

ES256 converte assinatura DER WebAuthn para o formato raw esperado pelo Web Crypto antes de `crypto.subtle.verify`. RS256 usa `RSASSA-PKCS1-v1_5`.

A interface usa o termo **Biometria / aparelho** de propósito. Uma PWA não escolhe “impressão digital” diretamente; o sistema pode usar face, impressão digital ou a credencial de desbloqueio permitida naquele dispositivo.

### 0.7 Limites de segurança desta versão

A V1.8.0 protege principalmente o cenário de alguém pegar um telefone já desbloqueado e abrir o Intervalo. Ela **não criptografa `balada-v1-data` em repouso**. Um usuário tecnicamente capaz de inspecionar/modificar o armazenamento e o JavaScript da origem ainda está fora do modelo de proteção desta etapa.

Não deve existir nenhuma afirmação de que o PIN/WebAuthn desta versão torna o `localStorage` criptograficamente secreto. Backup/exportação e criptografia de dados devem ser tratados em versões posteriores.

### 0.8 Testes mínimos da V1.8.0

1. Ativar PIN, fechar/reabrir PWA e confirmar que inicia bloqueada.
2. Digitar PIN correto e incorreto; validar lockout após 5 erros.
3. Ativar autenticação do aparelho no GitHub Pages/PWA HTTPS e confirmar criação + unlock.
4. Testar `Bloquear agora`.
5. Testar 0, 1, 5 e 15 minutos indo para outro aplicativo e voltando.
6. Confirmar que bebidas/histórico não aparecem na lock screen.
7. Confirmar que atualização PWA da V1.7 continua aparecendo e funcionando após desbloqueio.
8. Testar offline: PIN e WebAuthn local devem funcionar sem backend.
9. Testar cancelamento do prompt WebAuthn sem perder configurações existentes.
10. Desativar o bloqueio e confirmar que a PWA volta a abrir diretamente.

---

## 0.1 Histórico anterior — V1.6.5

### Histórico: indicador relativo ao intervalo

A lista do histórico deixou de exibir a linha textual `Intervalo da dose`. O valor de `event.intervalMinutes` continua preservado no evento e permanece disponível para cálculos, edição e auditoria, mas não ocupa mais espaço visual em cada item da timeline.

O selo `.history-event-elapsed` agora tem dois estados derivados exclusivamente do tempo atual e do intervalo salvo no próprio evento:

- `.is-within-interval`: `Date.now() - consumedAt < intervalMinutes * 60000`; usa tratamento vermelho suave.
- `.is-after-interval`: o intervalo já foi alcançado ou ultrapassado; usa tratamento verde suave.

O estado é calculado na renderização e atualizado por `updateHistoryElapsedLabels()` enquanto a view de histórico está aberta. Dessa forma, um selo pode mudar automaticamente de vermelho para verde quando o tempo configurado terminar, sem modificar qualquer dado persistido.

O horário absoluto e o tempo relativo continuam semanticamente separados:

```text
às 05:43h
19 min atrás
```

A cor do tempo relativo indica apenas se **o intervalo configurado para aquele registro** já terminou. Ela não representa uma avaliação clínica ou de segurança.

### PWA / ícone instalado

O ícone exibido pelo launcher do Android/iOS pode permanecer em cache mesmo depois que o manifest e os arquivos de ícone foram atualizados e o Service Worker já está na versão mais recente. Esse cache pertence ao sistema/launcher e não ao cache controlado pelo Service Worker. Por isso, a atualização do código do PWA não garante atualização imediata do ícone instalado; em alguns dispositivos, remover e instalar novamente o PWA é o método mais confiável para forçar a nova arte.

O cache do Service Worker desta versão é `intervalo-v1-6-5`.

## 0. Alterações da V1.8.3

- Cabeçalho da tela inicial reorganizado em duas linhas.
- Linha superior: `USO PESSOAL` + atalho de Configurações.
- Linha principal: `Início` + grupo de ações `Histórico` e `+`.
- A mudança é exclusivamente de composição responsiva; os IDs dos botões e seus event listeners foram preservados.
- Cache do Service Worker: `intervalo-v1-8-5`.


## Alterações da v1.8.5

- A identificação visual de `Meia` / `Inteira` no histórico foi movida para a mesma linha do nome da bebida por meio de `.history-event-identity`.
- O badge continua usando `.history-dose-badge`, mas agora participa do cabeçalho do evento em vez de ocupar uma linha própria no corpo do card.
- A mensagem do alerta de intervalo em andamento foi encurtada para evitar excesso de explicação no momento de decisão: `Se você já consumiu novamente, anote o horário.`
- Cache da PWA: `intervalo-v1-8-5`.

## Alterações da v1.8.4

- O header da tela inicial usa duas áreas fixas: identidade da tela à esquerda e ações `Histórico` / `Configurações` à direita.
- `Adicionar bebida` foi removido do header e colocado em uma zona própria, centralizada logo após `#drink-list`.
- A zona `#home-add-zone` fica oculta quando não existem bebidas, pois o estado vazio já possui sua própria ação de cadastro.
- A alteração é puramente de UI; não modifica persistência, histórico ou regras de segurança.


## 1. Alterações da V1.6.4

### Novo ícone da PWA

A identidade visual instalada passa a usar o ícone do abacaxi com relógio e canudo. Para evitar que navegadores e launchers reutilizem URLs antigas de ícone durante testes, a versão `v1.6.4` usa novos nomes de arquivo:

```text
icons/icon-192-v164.png
icons/icon-512-v164.png
icons/apple-touch-icon-v164.png
icons/favicon-32-v164.png
```

O `manifest.webmanifest`, o `<head>` do `index.html` e o `APP_SHELL` do Service Worker apontam para esses novos arquivos.

### Tempo decorrido no histórico

Cada item do histórico agora distingue duas informações temporais:

- horário absoluto: `às 05:43h`;
- tempo desde o consumo: `9 min atrás`, `01:25h atrás` ou `2 dias atrás`.

A função `formatHistoryElapsed(timestamp)` segue as regras:

```text
< 1 minuto        → menos de 1 min atrás
1–59 minutos      → N min atrás
1h–23h59          → HH:MMh atrás
>= 24 horas       → N dia(s) atrás
```

O valor decorrido é apresentação derivada e não é persistido. Cada elemento usa `data-consumed-at`, e `updateHistoryElapsedLabels()` atualiza os textos enquanto a tela de histórico está aberta.

### Cache

O cache da aplicação foi incrementado para:

```js
const CACHE_NAME = "intervalo-v1-6-4";
```

## 0. Alterações da V1.6.3

### Duplo toque para anotação imediata

A ação principal do card não responde mais a um único toque. A anotação imediata exige dois toques rápidos no mesmo card dentro de uma janela de `430 ms`.

A implementação não usa o evento `dblclick`, pois o comportamento de duplo toque varia entre navegadores móveis e pode competir com zoom. Em vez disso, cada `click` consulta `state.pendingDoubleTap`, que guarda `drinkId` e timestamp do primeiro toque. O segundo toque no mesmo card dentro da janela executa `performNormalDrinkTap()`.

O estado do primeiro toque fica fora do elemento DOM porque a lista é renderizada novamente a cada segundo durante countdowns. Dessa forma, um re-render entre o primeiro e o segundo toque não perde a intenção do usuário.

O primeiro toque aplica temporariamente `.is-awaiting-second-tap`, oferecendo feedback visual sem criar dados. O long press continua independente e limpa qualquer duplo toque pendente antes de abrir o formulário retroativo.

No CSS, `.drink-main` usa `touch-action: manipulation`, permitindo rolagem/pinch e evitando que o navegador trate o gesto como zoom por duplo toque.

Constantes relacionadas:

```js
const DOUBLE_TAP_MAX_DELAY_MS = 430;
const DOUBLE_TAP_FEEDBACK_MS = 430;
```

### Compatibilidade esperada

O fluxo se apoia em Pointer Events + `click`, com suporte nos navegadores móveis modernos relevantes ao projeto: Chrome/Chromium Android, Samsung Internet e Safari/WebKit iOS. O mouse no desktop também funciona com dois cliques rápidos.

### Cache

O cache da aplicação passa a usar:

```js
const CACHE_NAME = "intervalo-v1-6-3";
```

## 0.1 Alterações da V1.6.2

- Substituição da linguagem de ação de **registrar** para **anotar** nos fluxos centrais da interface.
- Reorganização visual do card principal em duas linhas, separando **estado + identidade** da **ação principal/countdown**.
- Evolução do diálogo de anotação retroativa para **tela cheia no mobile**, com barra de ações fixa.
- Substituição dos campos numéricos de “há quanto tempo” por **wheel pickers** próprios, reutilizando a mesma linguagem de UI do cadastro/edição da bebida.
- Atualização do cache do Service Worker para `intervalo-v1-6-2`.
- Incremento do `DATA_VERSION` para `7`, mantendo compatibilidade com os dados anteriores via normalização.

## 0. Atualização controlada da PWA — v1.7.0

A `v1.7.0` muda o ciclo de atualização da PWA. Até a `v1.6.x`, o Service Worker chamava `self.skipWaiting()` durante a instalação, permitindo que uma versão nova assumisse o controle sem participação explícita do usuário.

A partir desta versão:

1. `sw.js` instala o novo cache em background;
2. o worker novo permanece em `waiting`;
3. `app.js` detecta `registration.waiting` ou um worker recém-instalado;
4. a interface exibe `#update-toast`;
5. o usuário toca em **Atualizar**;
6. o app envia `{ type: "SKIP_WAITING" }` ao worker aguardando;
7. o worker executa `self.skipWaiting()`;
8. `controllerchange` é disparado;
9. a página recarrega uma única vez e passa a usar os arquivos da nova versão.

### Verificação de atualização

O registro usa:

```js
navigator.serviceWorker.register("./sw.js", {
  updateViaCache: "none"
});
```

`registration.update()` é chamado:

- após o carregamento inicial;
- quando a página volta a ficar visível;
- quando o navegador recebe o evento `online`.

Existe um throttle de 30 segundos para verificações comuns, evitando consultas excessivas quando o usuário alterna rapidamente entre aplicativos. Chamadas com `{ force: true }` ignoram esse throttle.

### Pré-cache e cache HTTP

Durante `install`, os itens do `APP_SHELL` são buscados com `cache: "reload"`. Isso força validação/rede para que uma versão nova não seja preenchida acidentalmente com cópias antigas provenientes do cache HTTP do navegador.

### Preservação de dados

A atualização do Service Worker altera apenas os arquivos da aplicação. Os dados continuam no `localStorage` sob `balada-v1-data`. A `v1.7.0` mantém `DATA_VERSION = 7`.

### Primeiro upgrade vindo da v1.6.x

A própria `v1.6.x` ainda não possui a UI de detecção de worker aguardando. Por isso, a migração inicial para `v1.7.0` pode exigir fechar completamente e reabrir a PWA uma vez depois que o novo worker tiver sido instalado. A partir de `v1.7.0`, atualizações futuras passam a exibir o aviso controlado.

## 1. Objetivo do projeto

O **Intervalo** é uma aplicação web mobile-first para uso pessoal. O usuário cadastra itens chamados de “bebidas”, define um intervalo entre doses e registra consumos ao longo do tempo.

O app oferece atualmente:

- cadastro e edição de bebidas;
- seleção de ícone por emoji;
- intervalo configurável de `0:01` até `24:00`;
- registro imediato de consumo;
- registro retroativo;
- classificação opcional de dose como `Meia` ou `Inteira`;
- countdown baseado no último registro;
- detecção de um novo registro antes do término do intervalo do registro anterior;
- histórico global;
- histórico filtrado por bebida;
- edição e exclusão de registros;
- exclusão de bebida com ou sem preservação do histórico;
- reordenação automática dos cards pela atividade mais recente;
- animação de reordenação;
- undo temporário do último registro;
- modo visual `clean-mode` para esconder explicações não essenciais;
- suporte básico a PWA por `manifest.webmanifest` e Service Worker.

### 1.1 Escopo intencional

O intervalo é configurado manualmente pelo usuário. O aplicativo **não calcula segurança fisiológica**, concentração de álcool, metabolismo, dose padrão ou qualquer recomendação médica.

Por isso, a interface usa o intervalo como uma regra de organização pessoal e evita tratar o término do timer como uma avaliação de segurança.

---

## 2. Estrutura de arquivos

```text
balada-v1/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
├── README.md
├── DEVELOPMENT.md
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

### `index.html`

Contém:

- estrutura da tela principal;
- estrutura do histórico;
- todos os `<dialog>` usados pela aplicação;
- template dos cards de bebida;
- toast global;
- footer com a versão da aplicação.

Não há HTML gerado no servidor.

### `styles.css`

Responsável por:

- tema escuro;
- estados visuais dos cards;
- layout responsivo;
- modais e painel full-height em mobile;
- wheel picker;
- timeline do histórico;
- toast;
- animações auxiliares;
- `clean-mode`.

### `app.js`

Contém toda a lógica da aplicação:

- carregamento e normalização de dados;
- migração de versões antigas;
- renderização;
- timers;
- histórico;
- registro e edição de eventos;
- dose inteira/meia;
- long press;
- animação FLIP de reordenação;
- wheel picker;
- manipulação dos dialogs.

### `sw.js`

Service Worker simples com estratégia cache-first para o app shell.

### `manifest.webmanifest`

Metadados para instalação futura como PWA.

---

## 3. Versionamento

Existem **duas versões diferentes** no código e elas não devem ser confundidas.

### 3.1 Versão da aplicação

Exemplo atual:

```text
v1.6.1
```

Ela aparece no footer:

```text
v1.6.1 · By: arielkeybob
```

Também deve ser refletida em:

- `README.md`;
- `DEVELOPMENT.md`;
- nome do ZIP da release;
- comentário de release quando aplicável.

### 3.2 Versão dos dados

No `app.js`:

```js
const DATA_VERSION = 7;
```

Esse número representa o **schema persistido** e só precisa subir quando uma mudança nos dados exigir normalização/migração conceitual.

Uma alteração apenas de texto, CSS ou UX pode subir a versão da aplicação sem alterar `DATA_VERSION`.

### 3.3 Cache do Service Worker

Cada release deve ter uma chave nova:

```js
const CACHE_NAME = "intervalo-v1-6-4";
```

Se esse valor não mudar, um navegador que já instalou o Service Worker pode continuar servindo arquivos antigos.

---

## 4. Persistência

### 4.1 Chave atual

```js
const DATA_STORAGE_KEY = "balada-v1-data";
```

O conteúdo é um JSON com esta forma geral:

```js
{
  version: 6,
  drinks: [],
  events: []
}
```

### 4.2 Chave legada

```js
const LEGACY_DRINKS_STORAGE_KEY = "balada-v1-drinks";
```

Ela existe somente para migrar versões antigas que armazenavam `lastConsumedAt` diretamente na bebida.

### 4.3 Fonte de verdade

O histórico (`events`) é a fonte de verdade para consumo.

Não existe mais um campo persistido `lastConsumedAt` na bebida.

O último consumo é derivado dos eventos:

```js
getDrinkEvents(drink.id).at(-1)
```

Essa decisão é essencial porque permite:

- múltiplos registros próximos;
- registros retroativos;
- edição de horário;
- recálculo dos alertas;
- histórico consistente;
- exclusão individual de eventos.

---

## 5. Modelo de dados

### 5.1 Bebida

```js
{
  id: "uuid-ou-fallback",
  name: "Vinho",
  icon: "🍷",
  intervalMinutes: 60,
  askDoseSize: true
}
```

#### `id`

Identificador estável da bebida.

#### `name`

Nome exibido no card e usado como identidade atual da bebida.

#### `icon`

String Unicode. Normalmente um emoji.

O app não depende do ícone estar presente no catálogo atual para continuar exibindo um ícone antigo já persistido.

#### `intervalMinutes`

Intervalo atual da bebida em minutos.

Exemplos:

```text
30 min  -> 30
1 h     -> 60
1 h 30  -> 90
24 h    -> 1440
```

#### `askDoseSize`

Booleano.

Quando `true`, após criar um registro o app mostra a escolha `Meia dose` / `Inteira`.

---

### 5.2 Evento de consumo

```js
{
  id: "...",
  drinkId: "...",
  drinkName: "Vinho",
  drinkIcon: "🍷",
  consumedAt: 1788541200000,
  intervalMinutes: 60,
  doseSize: "full"
}
```

#### `drinkId`

Liga o evento à bebida original.

#### `drinkName` e `drinkIcon`

São snapshots para preservar identidade visual quando a bebida for excluída, mas o histórico for mantido.

Enquanto a bebida ainda existe, `getEventDrinkIdentity()` prefere a identidade atual da bebida. Portanto, corrigir nome/ícone da bebida também corrige a apresentação dos eventos ligados a ela.

Se a bebida for excluída e os eventos forem mantidos, o snapshot passa a ser usado.

#### `consumedAt`

Timestamp Unix em milissegundos.

Todos os cálculos de countdown e histórico usam timestamps, nunca um contador decrementado como fonte de verdade.

#### `intervalMinutes`

Snapshot do intervalo configurado **naquele registro**.

Isso evita que alterar uma bebida de 60 para 90 minutos reinterprete retroativamente o histórico antigo.

#### `doseSize`

Valores aceitos:

```js
"half"
"full"
null
```

`null` representa um registro sem classificação conhecida, principalmente dados criados antes da funcionalidade de dose inteira/meia.

---

## 6. Normalização e migração

O carregamento começa em:

```js
loadAppData()
```

Fluxo:

```text
balada-v1-data existe?
        │
        ├─ sim → JSON.parse → normalizeData()
        │
        └─ não → migrateLegacyData()
```

### `normalizeData(data)`

É propositalmente tolerante a versões anteriores.

Ela:

- garante arrays de bebidas/eventos;
- converte IDs para string;
- normaliza ícones;
- limita intervalos;
- converte `askDoseSize` para boolean;
- normaliza `doseSize`;
- reconstrói snapshots ausentes quando possível.

### Regra de manutenção

Ao adicionar um novo campo persistido:

1. escolha um default seguro;
2. faça `normalizeData()` aceitar dados sem o campo;
3. só aumente `DATA_VERSION` quando isso fizer sentido para o schema;
4. nunca dependa de o usuário limpar `localStorage` para atualizar.

---

## 7. Cálculo temporal

### 7.1 Countdown

O countdown não decrementa um valor persistido.

Para o último evento:

```js
availableAt = consumedAt + intervalMinutes * 60 * 1000
remainingMs = availableAt - Date.now()
```

Isso torna o timer robusto a:

- bloqueio de tela;
- suspensão do navegador;
- troca de aplicativo;
- atraso de `setInterval`;
- reabertura da página.

O `setInterval` de 1 segundo apenas atualiza a UI.

### 7.2 Formatação

Countdown:

```text
HH:MM:SS
```

Horário de registro:

```text
18:05h
```

O `h` é uma unidade visual menor; ele não aparece no countdown.

---

## 8. Regra “Tomou dose por cima da outra”

Na `v1.6.1`, a linguagem visual foi simplificada para:

```text
⚠ Tomou dose por cima da outra
```

Essa condição é calculada, não salva.

### 8.1 Algoritmo

Para dois eventos consecutivos da mesma bebida:

```js
previousAvailableAt = previous.consumedAt
  + previous.intervalMinutes * 60 * 1000;

isViolation = current.consumedAt < previousAvailableAt;
```

Se `true`, o novo evento ocorreu antes de terminar o intervalo snapshot do evento anterior.

### 8.2 Contexto do evento

`getEventContext(eventId)` retorna:

```js
{
  event,
  previousEvent,
  isViolation,
  elapsedMs,
  remainingAtConsumptionMs
}
```

Na edição do histórico, a mensagem segue a forma:

```text
Você tomou menos de 1 min após o anterior, quando ainda faltava 3 min.
```

O histórico usa o badge:

```text
⚠ Tomou dose por cima da outra
```

### 8.3 Cluster consecutivo

`getCurrentViolationClusterCount(events)` detecta quantos registros consecutivos no fim da sequência estão sobrepostos.

Exemplo:

```text
13:00
13:30 ⚠
13:50 ⚠
```

O card pode indicar uma sequência de 3 registros.

### 8.4 Estado visual principal

O estado técnico continua chamado internamente de:

```js
"danger"
```

Na interface, o label é:

```text
⚠ TOMOU DOSE POR CIMA DA OUTRA
```

---

## 9. Estados do card

`getDrinkActivity(drink)` deriva um dos quatro estados.

### `new`

Sem nenhum evento.

UI:

```text
SEM REGISTRO
Anotar primeira dose
```

### `waiting`

Há evento recente e seu intervalo ainda não acabou.

UI:

```text
Tomou às 18:05h
⛔ Aguarde: 00:42:10
```

### `danger`

O último intervalo ainda está contando **e** existe sobreposição consecutiva recente.

UI:

```text
⚠ TOMOU DOSE POR CIMA DA OUTRA
Tomou às 18:05h
⛔ Aguarde: 00:42:10
```

### `completed`

O intervalo do evento mais recente terminou.

UI:

```text
✓ INTERVALO CONCLUÍDO
Anterior: 18:05h
Anotar nova dose
```

---

## 10. Ordenação dos cards

`getSortedDrinks()` ordena por timestamp do último evento, mais recente primeiro.

Bebidas nunca registradas ficam abaixo das bebidas com atividade.

Em empate, é usado:

```js
a.name.localeCompare(b.name, "pt-BR")
```

---

## 11. Animação de reordenação

A animação usa a estratégia FLIP.

Constantes atuais:

```js
const REORDER_ANIMATION_MS = 880;
const REORDER_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
```

Fluxo:

1. `captureDrinkCardPositions()` mede posições antigas.
2. O registro é persistido.
3. A lista é renderizada na nova ordem.
4. `animateDrinkReorder()` mede posições novas.
5. Cada card começa visualmente na posição antiga via `transform`.
6. A Web Animations API anima para `translate(0, 0)`.

A animação respeita:

```css
prefers-reduced-motion
```

Quando o usuário solicita menos movimento, a reordenação acontece sem animação.

---

## 12. Registro de consumo

A função central é:

```js
registerDrinkAt(id, timestamp)
```

Ela deve continuar sendo o ponto principal para criação de eventos, independentemente da origem do horário.

Origens atuais:

- tap normal;
- confirmação durante countdown;
- long press;
- menu `Anotar dose`;
- botões rápidos `Agora`, `5 min`, `15 min`, etc.;
- formulário de horas/minutos atrás.

### Regra importante

Um novo registro **sempre é adicionado ao histórico**. Ele nunca sobrescreve o anterior.

---

## 13. Dose inteira/meia

### 13.1 Configuração

Na bebida:

```js
askDoseSize: true
```

### 13.2 Criação

Quando a opção está ligada:

1. o evento é salvo imediatamente;
2. `doseSize` começa como `"full"`;
3. abre o popup de escolha;
4. escolher `Meia dose` altera para `"half"`;
5. fechar sem escolher mantém `"full"`.

Isso garante que a ausência de interação no popup não cause perda do registro.

### 13.3 Efeito no timer

Na versão atual, `doseSize` **não altera**:

- intervalo;
- countdown;
- detecção de sobreposição.

É apenas um atributo do evento.

---

## 14. Registro retroativo

Pode ser acessado por:

- long press no corpo do card;
- `⋮` → `Anotar dose`.

O modal oferece:

```text
Agora
5 min atrás
15 min atrás
30 min atrás
1 h atrás
```

ou entrada manual de horas/minutos atrás.

### Janela atual

O input manual aceita até 48 horas para trás.

### Regra cronológica

Adicionar um registro antigo não torna esse registro automaticamente o “último”.

Todos os eventos são reordenados pelo `consumedAt`, e os estados são recalculados a partir dessa ordem.

---

## 15. Long press

Constantes:

```js
const LONG_PRESS_MS = 600;
const LONG_PRESS_FEEDBACK_MS = 280;
const LONG_PRESS_MOVE_TOLERANCE = 12;
```

A implementação usa **Pointer Events** para unificar mouse, toque e caneta.

### Comportamento

```text
tap curto
→ ação normal do card

pressionar ~600 ms
→ Anotar dose

movimento > 12 px
→ cancela long press e deixa o scroll acontecer
```

Também são usadas regras de CSS para reduzir seleção de texto e callout nativo em touch.

Quando disponível, o app pode usar uma vibração curta como feedback, mas a funcionalidade não depende dela.

---

## 16. Histórico

Existem dois modos.

### 16.1 Global

Botão superior:

```text
Histórico
```

Mostra todos os eventos.

### 16.2 Por bebida

Cada card possui um botão lateral:

```text
Histórico
```

`openHistoryView(drinkId)` define:

```js
state.historyDrinkId = drinkId;
```

A mesma tela é reutilizada, apenas filtrando eventos.

### Agrupamento

Eventos são agrupados por dia:

```text
Hoje
Ontem
4 de setembro
...
```

### Edição

Tocar em um evento abre `event-dialog`.

É possível:

- alterar data;
- alterar horário;
- alterar Meia/Inteira quando o evento possui classificação;
- excluir o registro.

Ao salvar, nenhum “status de perigo” é persistido. O contexto é recalculado a partir da nova ordem temporal.

---

## 17. Exclusão de bebida

A UI oferece três caminhos:

```text
Cancelar
Excluir bebida e manter histórico
Excluir bebida e registros
```

### Manter histórico

Remove somente a bebida de `drinks`.

Os eventos continuam em `events` e usam `drinkName` / `drinkIcon` snapshot.

### Excluir com histórico

Remove:

- a bebida;
- todos os eventos com o mesmo `drinkId`.

---

## 18. Wheel picker

O seletor de intervalo é customizado para evitar diferenças grandes entre controles nativos de Android e iOS.

### Intervalos

Horas:

```text
00 ... 24
```

Minutos:

```text
00 ... 59
```

### Técnica

- `overflow-y`;
- `scroll-snap`;
- várias repetições da sequência;
- reposicionamento silencioso para simular rolagem infinita;
- input hidden como valor canônico do formulário.

Constantes:

```js
const WHEEL_REPEAT_COUNT = 7;
const WHEEL_MIDDLE_REPEAT = Math.floor(WHEEL_REPEAT_COUNT / 2);
const WHEEL_ITEM_HEIGHT = 44;
```

### Regra de 24 horas

Se horas = `24`, minutos são forçados para `00`.

Logo:

```text
23:59 ✅
24:00 ✅
24:01 ❌
```

O valor persistido continua sendo somente `intervalMinutes`.

---

## 19. Ícones

O catálogo atual está em `PICKER_ICONS`.

São strings Unicode, não imagens externas.

Vantagens:

- zero requisições adicionais;
- funciona offline;
- não exige biblioteca;
- é fácil trocar/adicionar opções.

O desenho visual do emoji pode variar entre Samsung, Google, Apple e Windows.

### Compatibilidade com ícones antigos

`normalizeIcon()` aceita um emoji persistido mesmo que ele não esteja mais em `PICKER_ICONS`.

Ao editar uma bebida com um ícone antigo, `buildIconPicker()` preserva a opção atual.

---

## 20. `clean-mode`

O `<body>` atual possui:

```html
<body class="clean-mode">
```

Elementos explicativos não essenciais podem receber:

```html
class="clean-optional"
```

CSS:

```css
.clean-mode .clean-optional {
  display: none !important;
}
```

### Elementos atuais usando essa estratégia

- nota sobre alteração do intervalo afetar somente novos registros;
- dica do long press no menu da bebida;
- texto “Ao salvar, a ordem do histórico e os alertas dos cards serão recalculados automaticamente.” na edição de evento.

### Evolução planejável

Um futuro toggle de configurações pode simplesmente adicionar/remover `clean-mode` no `body`.

Não é necessário reestruturar os componentes.

---

## 21. Toast e desfazer

O toast global usa:

```html
<div id="toast" role="status" aria-live="polite">
```

Ele é centralizado horizontalmente no mobile e aceita quebra de texto.

Após um registro, `showRegistrationToast()` apresenta resumo e opção `Desfazer`.

O undo remove somente o evento recém-criado, dentro da janela configurada pela lógica atual.

Atenção ao alterar esse fluxo: se a dose for modificada pelo popup antes do undo, o undo continua devendo remover o mesmo `eventId`.

---

## 22. Dialogs

A aplicação usa `<dialog>` nativo.

Dialogs atuais incluem:

- cadastro/edição de bebida;
- exclusão de bebida;
- aviso de intervalo em andamento;
- menu de ações da bebida;
- registro retroativo;
- escolha Meia/Inteira;
- edição de evento.

### Fechamento por backdrop

`closeDialogOnBackdrop()` verifica se o clique ocorreu fora do retângulo do dialog.

Em ações que não podem perder contexto, existem handlers específicos de `cancel`.

---

## 23. Layout mobile

O editor de bebida tem comportamento especial em telas pequenas:

- painel ocupa a altura útil da viewport;
- área central possui scroll próprio;
- botões de ação ficam sempre visíveis na parte inferior;
- wheels e seletor de ícones têm compactação responsiva;
- safe areas são consideradas com `env(safe-area-inset-*)` quando aplicável.

O objetivo é evitar que `Salvar` fique totalmente fora da tela em dispositivos de pouca altura.

---

## 24. Acessibilidade

O projeto já possui alguns cuidados básicos:

- `aria-label` em ações que não têm texto suficiente;
- `aria-live` na lista/toast;
- `role="spinbutton"` nos wheel pickers;
- foco visível;
- suporte a `prefers-reduced-motion`;
- estados importantes não dependem somente de cor;
- targets de toque mantidos relativamente grandes.

### Cuidados ao evoluir

Não transformar long press no único caminho para uma funcionalidade importante.

Hoje `Anotar dose` também existe no menu `⋮`, justamente para manter descobribilidade e acessibilidade.

---

## 25. Service Worker

Cache atual:

```js
const CACHE_NAME = "intervalo-v1-6-4";
```

App shell:

```js
[
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
]
```

### Estratégia

Para requests `GET`:

```text
cache existe?
  ├─ sim → devolve cache
  └─ não → fetch → salva cópia no cache → devolve resposta
```

### Limitação

Em acesso local pelo IP em HTTP, vários recursos de PWA/Service Worker podem não estar disponíveis por falta de contexto seguro.

Para uso completo como PWA, hospedar em HTTPS.

---

## 26. Rodar localmente

### XAMPP

Pasta sugerida:

```text
C:\xampp\htdocs\balada-v1\
```

Desktop:

```text
http://localhost/balada-v1/
```

Celular na mesma rede:

```text
http://IP-DO-PC/balada-v1/
```

Exemplo:

```text
http://192.168.1.23/balada-v1/
```

---

## 27. Cache durante desenvolvimento

Se uma alteração não aparecer:

1. confirme que os arquivos foram substituídos;
2. faça hard refresh;
3. confira o `CACHE_NAME` do `sw.js`;
4. se necessário, remova o Service Worker no DevTools;
5. recarregue.

### Chrome / Edge

```text
DevTools
→ Application
→ Service Workers
→ Unregister
```

Depois limpe Cache Storage se necessário.

---

## 28. Testes manuais recomendados

A suíte `node --test tests/audit.test.cjs` cobre os fluxos auditados na V1.11.0. Antes de distribuir uma release, complementar com os testes manuais abaixo.

### 28.1 CRUD de bebida

- criar bebida;
- editar nome;
- editar ícone;
- editar intervalo;
- ativar/desativar pergunta de dose;
- excluir mantendo histórico;
- excluir com histórico.

### 28.2 Countdown

- anotar agora;
- bloquear/reabrir tela;
- aguardar término;
- confirmar transição para concluído.

### 28.3 Sobreposição

Com intervalo curto, por exemplo 3 minutos:

```text
14:30 → primeiro registro
14:31 → segundo registro
```

Verificar:

- card em `danger`;
- texto `Tomou dose por cima da outra`;
- histórico com mesmo label;
- edição mostrando `Você tomou ...`;
- countdown baseado no registro mais recente.

### 28.4 Registro retroativo

- long press;
- menu `⋮`;
- botão rápido;
- horário anterior ao último registro;
- horário que muda a classificação de uma sobreposição.

### 28.5 Meia/Inteira

- bebida sem pergunta;
- pergunta ligada → Meia;
- pergunta ligada → Inteira;
- fechar popup → Inteira;
- editar a classificação pelo histórico.

### 28.6 Histórico

- global;
- filtrado por bebida;
- editar data;
- editar horário;
- excluir evento;
- evento de bebida já excluída.

### 28.7 Gestos

- tap curto;
- long press;
- pressionar e iniciar scroll antes de 600 ms;
- mouse no desktop;
- Safari iOS;
- Chrome/Samsung Internet Android.

### 28.8 Reordenação

Registrar uma bebida que esteja abaixo na lista e verificar:

- animação até o topo;
- outros cards deslocando suavemente;
- popup Meia/Inteira abrindo no momento esperado;
- sem animação quando `prefers-reduced-motion` estiver ativo.

---

## 29. Debug de dados

No console do navegador:

```js
JSON.parse(localStorage.getItem("balada-v1-data"))
```

Para visualizar formatado:

```js
console.log(
  JSON.stringify(
    JSON.parse(localStorage.getItem("balada-v1-data")),
    null,
    2
  )
);
```

### Backup manual

```js
copy(
  localStorage.getItem("balada-v1-data")
)
```

O comando `copy()` existe no console de navegadores Chromium.

### Reset total de desenvolvimento

```js
localStorage.removeItem("balada-v1-data");
localStorage.removeItem("balada-v1-drinks");
location.reload();
```

**Não usar em um dispositivo com dados que precisam ser preservados.**

---

## 30. Funções principais em `app.js`

### Dados

```text
loadAppData
normalizeData
migrateLegacyData
saveData
```

### Formatação

```text
formatTime
formatClock
formatInterval
formatElapsed
formatHistoryDay
```

### Histórico e cálculo

```text
getDrinkEvents
getEventDrinkIdentity
isEventBeforePreviousIntervalEnded
getCurrentViolationClusterCount
getEventContext
getDrinkActivity
getSortedDrinks
```

### Renderização

```text
render
renderHistory
refreshDataViews
```

### Registro

```text
registerDrinkAt
registerMinutesAgo
undoLastRegistration
```

### Dose

```text
openDoseSizeDialog
choosePendingDoseSize
closeDoseSizeDialog
```

### Bebidas

```text
openDrinkDialog
openEditDrinkDialog
handleDrinkSubmit
openDeleteDrinkDialog
deleteDrinkKeepingHistory
deleteDrinkWithHistory
```

### Registro retroativo e avisos

```text
openIntervalWarningDialog
openLogDialog
handleLogSubmit
```

### Edição de evento

```text
openEventDialog
handleEventSubmit
deleteSelectedEvent
```

### Componentes especiais

```text
attachDrinkLongPress
captureDrinkCardPositions
animateDrinkReorder
createWheelPicker
buildIconPicker
```

---

## 31. Convenções de evolução

### Preferir estado derivado

Não salvar algo que pode ser calculado com segurança.

Exemplo correto:

```text
isViolation → calculado pelos timestamps
```

Evitar:

```text
isViolation: true // persistido e sujeito a ficar desatualizado
```

### Preservar snapshots históricos

Configurações que mudam o significado histórico devem ser copiadas para o evento quando ele nasce.

Já fazemos isso com:

```text
intervalMinutes
```

Se no futuro uma nova regra afetar interpretação do evento, considerar snapshot equivalente.

### Uma função central de criação

Novas formas de anotar consumo devem convergir para `registerDrinkAt()` ou para uma abstração central equivalente.

Evitar duplicar a criação do objeto de evento em diferentes handlers.

### Não depender de ordem do array persistido

Sempre ordenar eventos por `consumedAt` para lógica temporal.

### Manter compatibilidade retroativa

Usuário não deve precisar apagar dados para receber atualização.

---

## 32. Pontos de atenção / limitações atuais

### Sem sincronização

Os dados vivem somente no `localStorage` daquele navegador/dispositivo.

Não há:

- conta;
- login;
- backup remoto;
- sincronização entre celulares.

### Sem notificações em background confiáveis

O countdown é visual. Notificações confiáveis com app fechado ainda não foram implementadas.

### `localStorage` não é banco transacional

Para o volume atual é suficiente, mas se o histórico crescer muito ou ganharmos buscas/relatórios mais complexos, `IndexedDB` seria uma evolução natural.

### Emojis variam por sistema

O mesmo Unicode pode ter desenho diferente em Android, iOS, Samsung e Windows.

### `<dialog>`

O suporte é bom nos navegadores modernos, mas alterações futuras devem continuar sendo testadas especificamente no Safari iOS.

### Long press é gesto secundário

Por isso existe um caminho explícito equivalente no menu `⋮`.

---

## 33. Possíveis evoluções técnicas

Sem compromisso de roadmap, a arquitetura atual permite adicionar:

- resumo por dia/noite;
- contagem de registros por bebida;
- filtros de histórico;
- exportação/importação JSON;
- backup manual;
- IndexedDB;
- notificações;
- PWA instalada;
- configurações com toggle real para `clean-mode`;
- customização de ícones por imagem/SVG;
- sessão/evento (“noite atual”);
- métricas que diferenciem meia/inteira, caso uma regra explícita seja definida pelo usuário.

---

## 34. Checklist de release

Ao criar uma nova versão:

1. atualizar footer em `index.html`;
2. atualizar título/versão em `README.md`;
3. atualizar versão no topo de `DEVELOPMENT.md`;
4. atualizar `CACHE_NAME` em `sw.js`;
5. avaliar se `DATA_VERSION` precisa mudar;
6. se o schema mudou, atualizar `normalizeData()`;
7. testar migração com dados anteriores;
8. executar `node --check app.js`;
9. testar em desktop;
10. testar em Android;
11. testar em iOS quando possível;
12. testar histórico global e por bebida;
13. testar countdown e sobreposição;
14. testar edição/exclusão;
15. testar Service Worker/cache;
16. gerar ZIP com nome da nova versão.

---

## 35. Alterações específicas da v1.6.1

Esta release é pequena em código, mas padroniza a linguagem dos alertas e melhora a documentação.

### Linguagem de sobreposição

Antes:

```text
Durante o intervalo configurado
Registro durante o intervalo
```

Agora:

```text
Tomou dose por cima da outra
```

### Detalhe na edição

Antes:

```text
Este registro aconteceu menos de 1 min após o anterior,
quando ainda faltavam 3 min do intervalo configurado.
```

Agora:

```text
Você tomou menos de 1 min após o anterior,
quando ainda faltava 3 min.
```

### Clean mode

O texto:

```text
Ao salvar, a ordem do histórico e os alertas dos cards serão recalculados automaticamente.
```

continua no HTML como documentação contextual, mas recebeu:

```html
class="clean-optional"
```

Como o `<body>` atual usa `clean-mode`, ele fica oculto na interface normal.

---

## 36. Regra de ouro do projeto

A interface pode mudar bastante, mas três princípios devem ser preservados:

1. **O histórico é a fonte de verdade.**
2. **Tempo é calculado por timestamp, não por contador persistido.**
3. **Informação histórica não deve ser reinterpretada retroativamente quando uma configuração futura muda.**

Esses três pontos são os que mantêm o comportamento previsível à medida que novas funcionalidades são adicionadas.


## Entrada instalada — V1.8.7

A UI principal é inicializada somente quando a execução é detectada em `display-mode: standalone`, `fullscreen`, `minimal-ui` ou pelo `navigator.standalone` usado em plataformas Apple.

Quando a mesma URL é aberta em uma aba normal, o app entra em `browser-mode` e mostra apenas a página de instalação. Isso é uma barreira de UX, não um mecanismo de segurança: o código continua sendo um aplicativo web público e pode ser inspecionado por ferramentas de desenvolvimento.

A instalação usa `beforeinstallprompt` quando o navegador disponibiliza o evento. Como essa API não é universal, há fallback de instruções por plataforma/navegador. A página não tenta abrir uma PWA já instalada porque não existe uma API Web interoperável que garanta esse comportamento.

O Service Worker é registrado nos dois modos. Os avisos internos de atualização são mostrados somente quando a execução está em modo instalado.

Cache: `intervalo-v1-8-7`.


## Instalação robusta — V1.8.8

O retorno `accepted` do `BeforeInstallPromptEvent` e o evento `appinstalled` não são mais usados isoladamente para escrever “App instalado” na UI. Em Android, a integração entre navegador, WebAPK/atalho e launcher pode terminar em momentos diferentes.

Estados da landing:
- `ready`: botão Instalar disponível;
- `opening`: prompt sendo aberto;
- `pending`: instalação solicitada/iniciada, sem afirmar conclusão;
- `installed`: PWA detectada por `getInstalledRelatedApps()` em navegador compatível;
- `guidance`: fallback de instrução manual.

O manifesto declara `id: "./"` e `related_applications` com `platform: "webapp"` para permitir a verificação da própria PWA em navegadores que implementam Get Installed Related Apps.

Cache: `intervalo-v1-8-8`.


## UX do cadastro — V1.8.9

O estado vazio mantém duas affordances visuais para a mesma ação: o círculo `+` e o botão **Adicionar bebida**. Ambos chamam `openDrinkDialog()`.

Novos cadastros usam `buildIconPicker(null)`, portanto nenhum radio de ícone começa marcado. Edição de bebida preserva a seleção atual.

Não há autofocus no campo de nome. A abertura de cadastro/edição termina com o input sem foco, evitando teclado virtual automático.

Validação obrigatória de nome e ícone é feita antes das validações de intervalo. Os campos recebem `.has-error`, `aria-invalid="true"` e mensagens específicas. `scrollIntoView()` leva ao primeiro erro sem chamar `.focus()`.

A seção de intervalo usa `.interval-fieldset` e `.interval-fieldset-title` para distinguir título de seção dos labels dos wheels.

Cache: `intervalo-v1-8-9`.


## Preferências de interface — V1.9.0

`balada-v1-data` passa para `DATA_VERSION = 8` e inclui:

```js
preferences: {
  cleanInterface: true
}
```

Dados de versões anteriores são normalizados automaticamente com `cleanInterface: true`, mantendo o comportamento visual atual como padrão.

`applyInterfacePreferences()` sincroniza a preferência com a classe `.clean-mode` no `<body>`. Os elementos opcionais continuam identificados por `.clean-optional`.

A preferência pode ser alterada em **Configurações → Aparência → Interface limpa e compacta** e é persistida imediatamente via `saveData()`.

A opção controla somente conteúdo auxiliar. Alertas funcionais/de segurança, erros de formulário, estados de intervalo e disclaimers não devem receber `.clean-optional`.

### Roadmap

As ideias futuras foram movidas para `ROADMAP.md`.

É importante manter como conceitos separados na UX e na arquitetura:

- **Exportar/importar bebidas**: transporta a lista/configurações de bebidas;
- **Fazer backup/restaurar backup**: preserva/restaura o estado completo compatível do app.

Também estão registrados: mesclagem de bebidas, relações entre bebidas cadastradas pelo próprio usuário e compartilhamento temporário com pessoas autorizadas.

Cache: `intervalo-v1-9-0`.


## Publicação — V1.9.1

O pacote ZIP de entrega passa a conter os arquivos do projeto diretamente em sua raiz, sem a pasta intermediária `balada-v1/`.

Isso reduz erros operacionais durante a substituição dos arquivos em `C:\xampp\htdocs\balada`.

Fluxo recomendado antes de publicar:

```powershell
cd C:\xampp\htdocs\balada
git status
```

Confirme que os arquivos essenciais existem na raiz do projeto e que o status não apresenta somente exclusões.

Depois:

```powershell
git add .
git status
git commit -m "v1.9.1 - restaura publicacao e ajusta pacote"
git push
```

Cache: `intervalo-v1-9-1`.


## Arquivos de dados — V1.10.0

### Formato `intervalo-drinks`

```json
{
  "type": "intervalo-drinks",
  "formatVersion": 1,
  "appVersion": "1.10.0",
  "exportedAt": "ISO-8601",
  "drinks": []
}
```

Contém somente configurações de bebidas.

Importação:

1. lê arquivo com limite de tamanho;
2. valida JSON, `type` e `formatVersion`;
3. valida e normaliza todas as bebidas em memória;
4. apresenta prévia;
5. constrói a nova lista;
6. serializa e grava em `balada-v1-data` em uma única operação;
7. somente após a gravação atualiza `state.drinks`.

No modo **Adicionar**, a assinatura de duplicata exata é formada por nome normalizado, ícone, intervalo e `askDoseSize`. Colisões de ID com conteúdo diferente recebem um novo ID.

No modo **Substituir**, somente `drinks` é substituído. `events` e `preferences` permanecem.

### Formato `intervalo-backup`

```json
{
  "type": "intervalo-backup",
  "formatVersion": 1,
  "appVersion": "1.10.0",
  "createdAt": "ISO-8601",
  "data": {
    "version": 8,
    "drinks": [],
    "events": [],
    "preferences": {}
  }
}
```

Segurança (`intervalo-security-v1`) e sessão (`intervalo-security-session-v1`) ficam deliberadamente fora do backup.

Restauração:

1. valida tipo e versão do arquivo;
2. executa `normalizeData()` sem alterar o estado atual;
3. mostra prévia;
4. grava o estado restaurável em uma única chamada `localStorage.setItem`;
5. recarrega o app;
6. a configuração de bloqueio do aparelho permanece intocada.

### Web Share na exportação de bebidas

`Exportar bebidas` tenta `navigator.canShare({ files })` + `navigator.share({ files })`.

A UI mantém somente o termo **Exportar**. A folha nativa é tratada como mecanismo de entrega/salvamento do arquivo, não como uma função separada do produto.

Fallback: `Blob/File` + object URL + atributo `download`.

### Web Share Target

O manifest declara:

```json
"share_target": {
  "action": "./share-target",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "files": [{
      "name": "drinksFile",
      "accept": ["application/json", ".json"]
    }]
  }
}
```

O Service Worker intercepta o POST dentro do escopo, valida limite de tamanho, armazena temporariamente o JSON no Cache Storage `intervalo-share-target-v1` e redireciona para `?import-shared=1`.

Após desbloqueio, a aplicação recupera o arquivo temporário e abre a mesma prévia usada pela importação manual. O arquivo temporário é removido após a leitura.

Essa integração é melhoria progressiva; a importação manual por `<input type="file">` continua obrigatória e universal.

Cache da aplicação: `intervalo-v1-10-0`.

## V1.10.2 — aviso de atualização e configurações

O aviso consulta a versão do Service Worker em espera via GET_VERSION/MessageChannel e exibe “Atualize quando puder para vX.X.X”. Sem resposta válida em 2 segundos, mantém o texto genérico. A versão exibida é a disponível, não a instalada. O cliente antigo V1.10.1 ainda mostra o aviso antigo ao receber esta atualização; o novo aviso passa a funcionar após instalar V1.10.2, nas próximas atualizações.

Configurações: Aparência, Privacidade, Sobre a proteção, Bebidas e Backup. “Sobre a proteção” fica oculto no modo de interface limpa. Os controles de privacidade e o disclaimer continuam visíveis. Cache: `intervalo-v1-10-2`; modelo de dados permanece 8.

## V1.10.3 — hierarquia de Anotar consumo

O seletor de tempo reutiliza as classes `interval-fieldset` e `interval-fieldset-title` do cadastro de bebida, incluindo título destacado, rótulos secundários e espaçamentos mobile. O conteúdo do formulário se alinha ao início para evitar espaços verticais esticados; as ações permanecem no rodapé. Lógica de horários e dados preservada. Cache: `intervalo-v1-10-3`.

## V1.10.4 — tamanho da dose na anotação

Anotar consumo oferece Meia/Inteira antes dos horários quando askDoseSize está ativo, reutilizando o seletor do editor de eventos. Inteira é o padrão a cada abertura. Atalhos e formulário salvam a escolha diretamente, sem repetir o popup; registro direto pelo card mantém o fluxo anterior. Bebidas sem a opção preservam doseSize nulo. Há 20px extras entre os atalhos e o seletor de tempo. Cache: `intervalo-v1-10-4`; schema permanece 8.

## V1.10.5 — texto de atualização

Aviso ajustado para “Atualize quando puder para vX.X.X”, preservando a versão dinâmica. Cache: `intervalo-v1-10-5`; modelo de dados permanece 8.

## V1.10.6 — atualização das alterações de texto

Versão e cache atualizados para distribuir às PWAs instaladas os textos de privacidade e a correção dos botões: Histórico Geral no início e Histórico nos cards. Cache: `intervalo-v1-10-6`; modelo de dados permanece 8. Alterações de HTML/CSS/JS publicadas devem atualizar o Service Worker para que o fluxo de atualização do app em cache seja acionado.


## V1.11.0 — políticas, aceite e validação de arquivos

`policies.html` é uma página pública estática, incluída no pré-cache junto de `policies.js`. O app chama `requireTermsAcceptance()` antes de inicializar o fluxo instalado. Abas comuns preservam a landing de instalação; todos os pontos de entrada têm acesso às políticas.

`TERMS_VERSION = "1.0"` em `policies.js`. A chave `intervalo-terms-v1` contém `termsAccepted`, `termsVersion` e `termsAcceptedAt` (timestamp local). Não faz parte dos backups nem de preferências. Se não puder gravar, o aceite mantém a tela com erro visível.

Para exigir novo aceite, atualize TERMS_VERSION e a versão/data/texto da página, ajuste o teste correspondente e publique uma nova versão do shell/cache. Não precisa mudar DATA_VERSION. O aceite é específico do armazenamento deste navegador: reinstalações que preservam dados podem preservá-lo.

Importações passam a validar tipos estritos e limites de strings. Backup rejeita schema futuro, registros inválidos, datas não representáveis e IDs duplicados antes da normalização. Propriedades desconhecidas são descartadas por reconstrução. Migrações locais existentes não foram alteradas. Falha do aviso opcional em sessionStorage não invalida uma restauração já gravada.

Testes: `node --check app.js`, `node --check sw.js`, `node --check policies.js` e `node --test tests/audit.test.cjs`. Cenários manuais adicionais: primeiro acesso; link antes do aceite; persistência após reabrir; alteração de TERMS_VERSION; armazenamento bloqueado; backup de outro dispositivo sem transferência do aceite; políticas offline após atualização; PIN/biometria e share target após o aceite. Não apagar dados reais para testar.

Versão da aplicação/footers: 1.11.0. Cache: `intervalo-v1-11-0`. DATA_VERSION permanece 8. Diagnóstico e limitações residuais: [AUDIT.md](docs/history/AUDIT.md).


## V1.11.1 — rascunho do aceite

`intervalo-terms-draft-v1` em sessionStorage guarda a versão das políticas e os estados booleanos dos três checkboxes. É restaurado ao retornar à tela na mesma sessão, sem registrar aceite automaticamente; somente Continuar grava a confirmação definitiva. O rascunho é removido após aceitar e ignorado se a versão diferir ou os dados forem inválidos. Não entra no backup. Se sessionStorage estiver indisponível, o formulário funciona, mas a navegação não pode preservar o rascunho.

TERMS_VERSION permanece 1.0 nesta correção de UX. Para mudanças materiais, incrementar essa constante e a versão/data da página: o app atualizado volta a solicitar todas as confirmações. Versão 1.11.1; cache intervalo-v1-11-1; DATA_VERSION 8.


## V1.11.2 — redação da página de políticas

Descrição ajustada para uso dos autores e testes de feedback com conhecidos selecionados. Mudança editorial: TERMS_VERSION 1.0 e DATA_VERSION 8 preservados. Versão do app e footers em 1.11.2; cache intervalo-v1-11-2 para distribuir o HTML atualizado.


## V1.11.3 — teste de renovação do aceite

TERMS_VERSION 1.0.1 e versão visível da página atualizadas para testar a renovação do aceite, sem mudança material no texto. App/footers 1.11.3 e cache intervalo-v1-11-3. DATA_VERSION permanece 8.

Após receber e aplicar a atualização, quem aceitou 1.0 verá a tela novamente com as três caixas desmarcadas; o rascunho anterior não será reaproveitado. Continuar grava 1.0.1, dispensando novas confirmações nas próximas aberturas. Teste automatizado simula a transição 1.0 → 1.0.1 e a persistência do novo aceite. Teste manual em PWA instalada deve ser feito após publicação, sem limpar dados reais.


## V1.12.0 — catálogo pessoal de ícones

O seletor permite adicionar um emoji ou símbolo pelo teclado/colagem e remover qualquer opção pelo ×, com Desfazer dentro do editor. O card + permanece disponível mesmo com a lista vazia. Limite de 100 opções, sem duplicatas; emojis compostos são validados como uma unidade visual. Navegadores sem Intl.Segmenter exibem uma orientação de atualização ao tentar adicionar.

Remover uma opção não altera bebidas nem snapshots históricos. O ícone selecionado permanece disponível no rascunho, mesmo fora do catálogo. Alterações do catálogo são preferências globais, salvas imediatamente, independentemente de Cancelar a bebida. Desfazer recupera a última exclusão enquanto o editor permanece aberto.

DATA_VERSION 9: preferences.iconCatalog é uma lista ordenada; dados e backups antigos recebem o catálogo padrão, listas vazias permanecem vazias. Backup inclui o catálogo; exportação de bebidas transporta somente o ícone de cada bebida. Importação preserva o catálogo local. Falhas de gravação mantêm o estado anterior e mostram erro. App/footers 1.12.0; cache intervalo-v1-12-0. Políticas e versão de aceite preservadas.

Testes manuais da entrega: adicionar e excluir por toque; desfazer; cancelar edição e reabrir; remover opção selecionada/em uso; lista vazia; teclado virtual e rolagem; restaurar backup antigo/novo. Nunca limpar armazenamento real.

## V1.12.1 — edição discreta e painel de emojis

Os botões × aparecem somente após tocar na caneta abaixo do +. O mesmo card conclui a edição; cada abertura do cadastro começa com a edição desligada. O + abre um painel interno com categorias e uma seleção de emojis Unicode, sem campo de texto, imagens, dependências ou requisições externas. Não é o teclado nativo nem um catálogo completo de todos os emojis; os símbolos disponíveis são renderizados pelo aparelho. Opções já cadastradas ficam desabilitadas no painel.

O catálogo padrão removido não é reposto em atualizações: preferences.iconCatalog é preservado, incluindo lista vazia. Somente dados/backups sem catálogo recebem os padrões. Restaurar um backup substitui o catálogo pelo conteúdo restaurado. DATA_VERSION permanece 9; app e footers 1.12.1, cache intervalo-v1-12-1. Arrastar e soltar permanece no roadmap.

Validação V1.12.1: node --check app.js; node --check sw.js; node --test tests/audit.test.cjs (14 testes). Prévia isolada no navegador: exclusões ocultas inicialmente, ativação/conclusão pela caneta, excluir/desfazer e adicionar por menu com seleção automática. Armazenamento da prévia é simulado; não modifica dados reais. Android/iOS, teclado de acessibilidade, atualização em PWA instalada e restauração pela interface ainda precisam de teste manual. A seleção de emojis ocupa cerca de 3,9 KB sem compressão; alguns desenhos dependem do suporte do sistema operacional.

## V1.13.0 — redefinir e apagar dados

Configurações inclui uma seção expansível depois de Backup, disponível também no modo compacto. Restaurar ícones padrão preserva bebidas e snapshots. Apagar histórico oferece 30 min, 1h, 2h, 5h, 24h, 2 dias, 7 dias, 30 dias ou tudo, por consumedAt; os limites são inclusivos e os períodos finitos não abrangem datas futuras. A prévia fixa os IDs e horários antes da autenticação. Apagar bebidas permite escolher cadastros, todos inicialmente marcados, e apagar também seu histórico (marcado por padrão); históricos de outras bebidas e órfãos permanecem.

Todas as ações exigem confirmação e nova autenticação pelo método configurado. Sem proteção, o usuário deve configurá-la e retornar à ação. A autorização é vinculada à prévia, ao estado e à proteção local; cancelamento, bloqueio ou alteração dos dados invalida a operação. PIN compartilha contador/limite de tentativas com o desbloqueio. Exclusões não oferecem Desfazer; contadores são recalculados.

APAGAR TUDO grava um estado vazio válido, restaura preferências e ícones, remove a chave legada, importação compartilhada pendente, sessão e configuração local de segurança. A proteção é removida por último; falha complementar é informada como parcial, sem alegar preservação de dados já apagados. Apenas chaves próprias são limpas. Não remove backups exportados, instalação, dados de outros aparelhos ou credenciais no sistema operacional. Por solicitação do usuário, o aceite atual das políticas é preservado; policies.js e policies.html não foram alterados, inclusive sua versão visível. Não é necessário aceitar os termos novamente por esta atualização.

Lógica em reset.js, incluído no cache offline. App/footer principal 1.13.0, cache intervalo-v1-13-0; DATA_VERSION permanece 9. Nenhuma dependência ou backend.

Validação: node --check app.js, sw.js e reset.js; node --test tests/audit.test.cjs tests/reset.test.cjs. Prévia isolada no navegador verificou seleção com histórico marcado, confirmação separada, PIN incorreto e exclusão após PIN correto, com armazenamento simulado. Não testados em dispositivo real: biometria/WebAuthn, teclado mobile, atualização offline da PWA e limpeza completa pela interface. Não apagar armazenamento real para testes.

## V1.13.1 — padrões de diálogos e notificações

Apagar bebidas começa sem seleção. Selecionar todas/Desmarcar todas abrangem a lista inteira, com contador e indicação de rolagem. A opção de apagar histórico continua marcada por padrão, mas fica separada após a prévia e o aviso de irreversibilidade. A primeira etapa usa botão branco e “1 de 2 · Revisar”; a segunda usa botão vermelho e “2 de 2 · Autenticar”.

ui.js normaliza os diálogos com conteúdo rolável e ações fixas no celular (até 600px), seguindo o cadastro. Desktop mantém modal centralizado. ui.js precisa ser carregado antes de app.js, depois de construir o HTML, e está no pré-cache. Campos e IDs existentes são preservados.

showAppNotification(message, {title, type, persistent, undo, onDismiss}) centraliza os avisos. showToast mantém compatibilidade com Desfazer, agora por 10 segundos. A apresentação tem título, símbolo, contraste e botão Entendi; usa popover manual acima dos diálogos quando disponível. Notificações de reset permanecem até dispensar; APAGAR TUDO exibe conclusão antes de recarregar ao tocar Entendi. Avisos são ocultados ao bloquear/ocultar dados privados. Erros de exportação/backup usam apresentação de falha.

App/footer principal 1.13.1, cache intervalo-v1-13-1; DATA_VERSION 9 e políticas/aceite inalterados. Preservada a alteração manual “Excluir bebida mas manter histórico”.

Validação: node --check app.js, sw.js, reset.js e ui.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs. Prévia isolada em 390×844: seleção inicial vazia, selecionar/desmarcar todas, bloqueio de confirmação vazia, transição para autenticação, exclusão simulada e aviso persistente. Sem alterações ao armazenamento real. Ainda não testados: teclado virtual e biometria em aparelhos Android/iOS, atualização da PWA instalada e todos os diálogos em dispositivos reais.


## V1.14.0 — catálogo completo e rolagem de emojis

O painel oferece 3.781 emojis Unicode 16.0 em nove categorias, incluindo tons de pele, sequências compostas e bandeiras. Dados locais em emoji-data.js, carregados antes de app.js e incluídos no pré-cache; fonte https://unicode.org/Public/emoji/16.0/emoji-test.txt e licença em UNICODE-LICENSE.txt. Os desenhos e o suporte a emojis recentes dependem do sistema; não são imagens do WhatsApp.

Todas as categorias aparecem em uma rolagem contínua com títulos. O dropdown acompanha a categoria no topo da área visível; selecionar uma categoria manualmente desloca somente a lista de emojis. O painel é construído uma vez e atualiza as opções já adicionadas ao reabrir. Catálogo pessoal mantém o limite de 100 favoritos, exclusões e ordem; bebidas e snapshots preservados. DATA_VERSION permanece 9; app/footer 1.14.0 e cache intervalo-v1-14-0. Políticas e aceite inalterados.

Validação: node --check app.js, sw.js e emoji-data.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs. Cobertura do catálogo, unicidade, sequências compostas, limites de persistência e sincronização/salto com geometria simulada. Não realizados: testes visuais/manuais no navegador, toque em Android/iOS, leitor de tela e atualização da PWA instalada. Não foi alterado armazenamento real.

## V1.14.1 — emojis sem variações de tom de pele

Removidas 1.875 variações de tom de pele do painel. Permanecem 1.906 emojis, com a apresentação padrão (amarela quando aplicável), nas mesmas nove categorias e com rolagem contínua. Ícones pessoais já salvos, bebidas e snapshots históricos são preservados.

App e footers 1.14.1; cache intervalo-v1-14-1; DATA_VERSION permanece 9. Validação: node --check app.js, sw.js e emoji-data.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs, incluindo ausência de modificadores de pele e presença de emojis padrão. Não realizados testes manuais em celular/navegador nem atualização de PWA instalada.

## V1.14.2 — escolha da contagem e avisos compactos

Configurações → Interface permite escolher Contagem regressiva (padrão) ou Contagem normal. A regressiva mantém o início e o histórico anteriores. A normal mostra Decorrido: HH:MM:SS no início, de zero até o intervalo do último snapshot; ao concluir, mantém a ação Anotar nova dose. No histórico, cada intervalo ainda ativo mostra Falta MM:SS (minutos totais, por exemplo 90:00); concluídos mostram tempo atrás. Cálculos continuam baseados em timestamps e intervalos históricos, inclusive após reabrir o app ou alterar a bebida.

O rótulo inicial passa a Intervalo, com duração sem quebra interna. Avisos comuns duram 4 segundos; erros e ações com Desfazer, 6 segundos. Layout e botão Entendi mais discretos, com alvos de toque de 44px; avisos persistentes continuam exigindo dispensa.

preferences.countingMode é opcional e aceita countdown/normal, com padrão regressivo para dados e backups anteriores. Backup inclui a preferência; importação de bebidas preserva a local. Falha ao gravar mantém a escolha anterior. DATA_VERSION permanece 9, pois o campo é opcional e compatível; app/footer 1.14.2 e cache intervalo-v1-14-2. Políticas e aceite preservados.

Validação: node --check app.js e sw.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs (32 testes). Cobertura de migração, backup, falha de gravação, limites e transição dos contadores, tempos dos avisos e persistência dos avisos essenciais. Não realizados testes visuais/manuais no navegador ou celular, leitor de tela e atualização da PWA instalada. Armazenamento real preservado.

## V1.14.3 — formato e rótulos dos contadores

Na contagem normal, o início mostra Contando: HH:MM:SS. Na regressiva, mostra Falta: -HH:MM:SS; o sinal é apenas visual e não altera cálculos. No histórico em modo normal, intervalos ativos mostram Falta HH:MM, arredondando o tempo restante para cima até o próximo minuto (menos de um minuto aparece como 00:01). Ao concluir, volta ao tempo atrás. Exemplo: 90 minutos aparecem como Falta 01:30.

App/footer 1.14.3 e cache intervalo-v1-14-3; dados e preferências preservados, DATA_VERSION 9. Validação: node --check app.js e sw.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs (32 testes), incluindo limites de hora, último minuto e conclusão. Não realizados testes visuais/manuais no celular e atualização da PWA instalada.

## Ajuste local — formulários e edição de registro (09/09/2026)

Registro usa as mesmas roletas e hierarquia visual do cadastro/anotação. Data exibe dia da semana por extenso, mantendo o seletor nativo. beginFormDraft/updateFormDraft em ui.js comparam campos com a abertura; botões de conclusão ficam ocultos sem mudanças e envio por Enter também é bloqueado nesse estado. Roletas notificam input para integrar o controle compartilhado. Nenhuma alteração de schema ou publicação.

Validação: sintaxe de app.js, sw.js e ui.js; testes audit/ui e teste integrado countdown-menu-browser em origem e perfil efêmeros. Inclui retorno ao valor original, horário pelo teclado, data com dia da semana, edição preservando snapshot e larguras 320/390. Celular real e atualização da PWA não testados.

## Ajustes locais — confirmações e exclusão (09/09/2026)

Auditoria encontrou dois window.alert (falhas de importação de bebidas e leitura de backup) e dois window.confirm (desativar bloqueio e excluir registro). Erros usam showAppNotification persistente; confirmações usam showAppConfirmation em ui.js com o layout comum dos diálogos e cancelamento pelo Voltar/Escape/bloqueio. Não há alert/confirm nativos restantes nos scripts atuais. O prompt de instalação é uma API do navegador e permanece.

Bebida sem eventos oferece apenas Cancelar/Excluir bebida, sem decisões sobre histórico; bebida com eventos mantém as duas opções. Confirmar cancelamento da contagem volta ao Início; desistir mantém o menu e falha de gravação preserva a confirmação.

Validação: node --check app.js/sw.js/ui.js; 27 testes em audit, ui, navigation-browser e countdown-menu-browser, com dados e perfil isolados. Cobertura de exclusão com/sem histórico, confirmações internas, ausência de diálogos nativos, arquivos inválidos sem alteração de dados e retorno ao Início. Celular real e atualização de PWA não testados. Sem publicação nesta etapa.

## Prévia local no PC e teste dos cards neutros

Execute no PowerShell, dentro de C:\xampp\htdocs\balada:

```powershell
node scripts/dev-server.cjs
```

Abra http://127.0.0.1:4173/funtime/ no navegador comum. Na primeira abertura, escolha Começar sem dados e aceite as políticas. Cadastre bebidas de teste ou restaure uma cópia de backup pela prévia/confirmacão normal. Os dados pertencem somente a essa origem e persistem entre recargas; não são os dados do GitHub Pages nem os de localhost/balada. Não é necessário instalar a PWA. Para encerrar um servidor iniciado no terminal, use Ctrl+C. Se a porta estiver ocupada, reutilize a prévia existente ou defina FUNTIME_DEV_PORT antes de executar; outra porta possui outro armazenamento.

O servidor escuta apenas em 127.0.0.1 e só serve arquivos públicos do shell. Injeta a detecção de app instalado apenas no HTML servido e mantém o boot real, migração assíncrona, lock, aceite e bloqueio. O SW servido mantém o protocolo, mas deixa GET ir para a rede para F5 refletir os arquivos locais, sem precisar incrementar versão a cada edição. Não usar esta prévia para validar funcionamento offline ou atualização de cache: esses cenários continuam nos testes com o SW original. Nenhum bypass foi acrescentado ao HTML/boot/app publicados; não há backend de produção.

Os experimentos de neutralização automática/manual foram substituídos pelo desenvolvimento de eventos, descrito abaixo.

Validação local: node --check app.js/sw.js/scripts/dev-server.cjs; 24 testes aprovados em audit, countdown-menu-browser e dev-preview-browser. Prévia testada no Edge em aba comum, com dados fictícios e perfil isolado, persistência após recarga e bloqueio de arquivos fora do shell. Imagem mobile 390×844 inspecionada. Celular real não testado. Versão/cache permanecem 2.0.12 até a aprovação; sem commit ou push.

## Desenvolvimento local — eventos e navegação inferior

Implementação solicitada após rejeitar os experimentos de neutralização. A prévia agora oferece eventos opcionais, com nome, início, encerramento, edição, reabertura e exclusão do agrupamento mantendo doses. Um evento aberto por vez; períodos não se sobrepõem (a fronteira pode coincidir, com vínculo explícito para doses nessa fronteira). A Home mostra o contexto atual; cards sem registro no evento são neutros, exceto contagens/alertas anteriores ainda ativos. Doses do evento usam a apresentação usual enquanto ele está aberto. Sem evento, doses avulsas continuam possíveis; contagens ativas permanecem e cards concluídos ficam neutros. Retirado o botão experimental de neutralização.

Menu fixo com SVGs locais: Home, Histórico, Evento e Configurações. Políticas e disclaimer mantidos, com espaço para não ficarem cobertos. Seleção acessível via aria-current; diálogos seguem o componente rolável existente. Datas do evento usam editor recolhível com as mesmas roletas de hora/minuto; nome obrigatório nesta primeira implementação. Não há encerramento automático: evento antigo mostra aviso nos detalhes após 12h sem registro. Encerrar propõe agora; horário pode ser corrigido por Editar. Reabrir exige ausência de conflito com outros eventos.

occasions.js valida as entidades e vínculos; occasions-ui.js centraliza interface/transições. events continua significando doses e recebe occasionId opcional. occasions contém id, name, startedAt e endedAt (null quando aberto). DATA_VERSION 10; normalização de dados antigos cria lista vazia e vínculo null sem inventar agrupamentos. Fuso de exibição é o do aparelho nesta etapa; armazenamento de fuso próprio permanece pendente. Backup exportado usa formato 2 e inclui ocasiões; leitura dos backups formato 1 preservada. Versões publicadas anteriores rejeitam o novo backup/schema, evitando descartar vínculos. Importação de bebidas preserva ocasiões. Reset de histórico preserva eventos vazios, informado na prévia; apagar tudo remove ambos. Migração cumulativa, posse e lock preservados.

Registros novos entram no evento aberto quando o timestamp pertence ao período. Retroativos fora dele ficam sem evento, com edição individual disponível no Histórico. Alterar horário/vínculo exige compatibilidade do período; segundos originais são preservados quando os campos de data/hora não mudam. Iniciar/encerrar/mover agrupamento não filtra os cálculos globais de intervalos. Gravações de eventos, vínculos e novas doses acontecem antes de atualizar memória; falhas mantêm o estado anterior.

Esta é uma versão de avaliação local, sem commit/push. Versão visível e cache de release ainda 2.0.12; precisam de nova versão antes de publicação. Dados experimentais ficam na origem de prévia; backups do schema 10 não devem ser usados na versão publicada 2.0.12. Não houve leitura ou limpeza de dados do GitHub Pages. Planejamento e pendências em EVENTOS-PLANEJAMENTO.md.

Validação desta etapa: 59 testes aprovados (audit, occasions, occasions-browser, dev-preview-browser, countdown-menu-browser, navigation-browser, migration, reset, ui, receiver-browser e release). Cobertura de início/fim/reabertura, evento seguinte no mesmo minuto, edição, exclusão sem apagar doses, filtro, nomes no histórico, preservação de contagens anteriores, backup novo/legado, falha de gravação no início e recarga do schema 10. Sintaxe dos scripts alterados e git diff --check aprovados. Imagens em 390×844 da Home, evento ativo e editor conferidas; celular real e fuso diferente não testados. Testes do receptor usam SW original; prévia usa rede direta. Não foi feito commit/push.

Revisão de agenda e automações para 2.1.x: EVENTOS-AGENDA-UX.md. A tela compacta e as regras automáticas ainda são propostas. Alinhamento local de versão para 2.1.0 validado em 10 testes; permanece pendente de commit/push.

## Implementação local — agenda e automações (linha 2.1.x)

Implementada após autorização do usuário: lista por mês, abas Próximos/Anteriores, busca, filtro mensal, paginação de 20 itens e detalhes em diálogo. O evento ativo ocupa uma única linha destacada. Editar/reabrir/excluir ficam em Mais opções; cancelar agendamento é distinto de excluir agrupamento. Navegação fixa e políticas preservadas. A lista mantém filtro e quantidade carregada ao fechar detalhes.

Novo evento permite Iniciar agora ou Agendar, início automático opcional e encerramento programado opcional. Horários planejados são separados do início efetivo; manual inicia no instante da confirmação. Dois agendamentos podem se sobrepor, com aviso nos detalhes, mas apenas um pode ficar ativo. Conflito impede início automático até revisão. Evento cujo início e fim passaram sem ativação fica Expirado. Reagendar exige alterar o início para uma data futura.

Home oferece aviso dentro de uma janela de 1h antes/1h depois do início manual, sem outro evento ativo. Agora não dispensa o aviso daquele agendamento/horário na sessão do navegador. Nenhum push, permissão de notificação ou serviço externo foi acrescentado.

FunTimeOccasions.reconcile é puro e baseado em timestamps. Executado no app desbloqueado, no relógio da página, ao retornar e antes de registrar dose; não existe execução garantida com app fechado. Transições são validadas e gravadas uma vez, antes da memória, sob o lock existente. Erro preserva dados e impede nova dose até conseguir reconciliar, com tentativa posterior e mensagem de erro.

Sem fim programado, após 48h de início: aguardar término de todas as contagens vinculadas; encerrar no maior término calculado com snapshots (respeitando countingStoppedAt legado). Sem doses: fim administrativo no marco de 48h, motivo empty48h. Com fim programado, respeitar esse horário, sem remover nem encerrar contadores. endedAt, closedAt e endReason distinguem horário inferido de processamento. Reabertura remove programação anterior de fim; eventos longos devem ter fim programado para não entrar na recuperação por 48h.

DATA_VERSION 11 (migração cumulativa de dados 9/10), formato de backup 2 preservado. startedAt null identifica agendamento; scheduledStartAt, scheduledEndAt, autoStart, closedAt, endReason e timeZone são campos validados. Campos legados permanecem; nenhuma agenda é inventada na migração. Horários exibidos no fuso atual, com nota nos detalhes quando diferente do fuso gravado; instantes não mudam ao viajar. Backup/restauração incluem agenda. Página de instalação continua sem dados privados. Sem commit/push nesta etapa; app/boot/cache local alinhados a 2.1.0 conforme pedido anterior.

Validação da agenda: 64 testes aprovados em audit, agenda, occasions, occasions-browser, navigation-browser, countdown-menu-browser, dev-preview-browser, reset, migration, receiver-browser, release e ui. Teste integrado repetido após acabamento dos controles: passou. Inclui 100 itens/paginação/busca, retorno dos detalhes, menu em 320 e 1024px, agendamento manual/automático, encerramento e relógio simulado, aviso dispensado após reload, falha de persistência automática e recuperação, backup e dados legados. Imagens do cadastro e lista 390×844 conferidas. Sintaxe e diff verificados. Celular real, mudança de fuso em aparelho e execução com app fechado não testados; app fechado é reconciliado ao retornar, sem promessa de execução em segundo plano.

## Cadastro retroativo de eventos
Escolher data aceita início passado com aviso. Com término passado, salva encerrado; sem término, segue as regras do evento em andamento e recuperação após 48h. Inclui registros sem evento no período, preservando vínculos existentes e rejeitando sobreposição. Iniciar agora oculta o editor de início e usa o instante de confirmação. Abas ordenadas Anteriores / Próximos. Schema 11 preservado. Sete testes de agenda, ocasiões e navegador aprovados, incluindo cadastro retroativo e associação. Sintaxe app.js, sw.js e occasions-ui.js verificada; celular real não testado.

## Eventos opcionais (implementação local)
Usar eventos fica desmarcado por padrão, inclusive em dados antigos sem preferência explícita. eventsEnabled é preservado no backup completo e validado como booleano; schema 11 mantido. Desativação encerra evento ativo e salva a preferência na mesma gravação, mantendo snapshots e contagens. Na primeira abertura de dados legados com evento ativo, o encerramento é aplicado com aviso. Agendamentos ficam suspensos; reativação converte início automático vencido em manual e mantém os futuros. Novas doses não recebem evento quando desativado; vínculos históricos são preservados. Navegação usa três itens, sem contexto/lembrete na Home. Cards concluídos sem eventos ficam neutros após 24h. Celular real não testado.

## V2.1.18 — senha na página de instalação

A página pública pede um código de acesso antes de mostrar o botão ou as orientações de instalação. A senha inicial está em `BROWSER_INSTALL_PASSWORD`, no início de app.js. A comparação é exata, diferencia maiúsculas e libera automaticamente ao digitar/colar o valor completo. O campo usa caracteres ocultos e é limpo após liberar; o desbloqueio vive apenas na memória da página. A PWA em modo instalado e a confirmação de instalação detectada dispensam o campo.

É apenas uma barreira visual: código e manifest continuam públicos, e a instalação pelo menu do navegador não é bloqueada. Nenhum dado privado ou armazenamento é acessado pelo desbloqueio. App, boot, rodapés e cache alinhados a 2.1.18; DATA_VERSION 11 e política 1.0.2 preservados.

Validação local: sintaxe de app.js/sw.js, diff e 24 testes de install/receiver/transition/ui aprovados. Cobertura de senha parcial/incorreta/correta, prompt antes/depois da liberação, orientação sem prompt, recarga simulada e instalação detectada. Aparência em navegador, instalação real e celular não testados. Commit e push solicitados.

## Ícone Android — revisão local de 11/09/2026

Matriz funtime-maskable-master-v2.png e exportação icon-maskable-512-v2.png atualizadas: personagem ampliado de aproximadamente 43% para 72% da altura. Edição pela ferramenta integrada de imagens, preservando o conceito existente. Prompt: ampliar o personagem, conservar cores, relógio, óculos, canudo e fundo contínuo; manter o desenho dentro do círculo central de diâmetro 80%. Refinamento final: reduzir 6% em relação à primeira saída e deslocar 2% para baixo.

Manifest e precache usam icon-maskable-512-v2.png?rev=2; cache funtime-v2-1-18-icons-2 distingue a revisão de assets. Versão funcional 2.1.18 e DATA_VERSION preservados. Commit e push para funtime/main solicitados em 11/09/2026.

Validação: PNG RGB opaco 512×512, caminhos dos ícones do manifest existentes, inspeção visual do recorte circular mínimo de 80% (personagem inteiro), node --check app.js, node --check sw.js e git diff --check aprovados. Instalação, atualização do ícone no launcher e celular real não testados; atualização dos metadados depende do navegador/sistema.
