# 0021 — Bloqueio/desbloqueio de segurança: resolver a duplicação e extrair

Status: implementada

## Contexto

Fase 9.2 (spec 0020) extraiu a fatia de *configuração/verificação* de segurança
(`src/security/config.js`: `loadSecurityConfig`, `saveSecurityConfig`, `verifyPin`,
`getConfiguredPinLength`, `normalizePinInput`, `getPinLockoutRemainingMs`,
`getDefaultSecurityConfig`) mas deixou de fora, de propósito, tudo que é *runtime* de
bloqueio/desbloqueio:

- `app.js:918` `closeSensitiveDialogs()`
- `app.js:929` `showLockScreen()`
- `app.js:946` `lockApp()`
- `app.js:955` `unlockApp()`
- `app.js:973`/`979` `showPrivacyShield()`/`hidePrivacyShield()`
- `app.js:998` `handlePinUnlock(event)`
- `app.js:1034` `handleDeviceUnlock()`
- `app.js:3080-3137` listener de `visibilitychange` (mostra/esconde privacy shield,
  decide se bloqueia ao voltar, sincroniza exceção de evento)
- `app.js:3142-3145` listener de `beforeunload` (mantém sessão de desbloqueio)
- `app.js:3147-3150` listener de `pointerdown` (marca atividade)

Dois motivos foram registrados então para adiar: (1) os 3 listeners de auto-lock são
funções anônimas inline — extrair exigiria primeiro reescrever, não só mover; (2)
`reset.js:183-185` reimplementa a contagem de tentativas erradas de PIN e o bloqueio
temporário (`state.pinFailedAttempts`/`state.pinLockoutUntil`) em vez de reusar a
mesma lógica de `app.js:1022-1026`, e resolver essa duplicação precisa vir antes de
isolar o módulo, senão a extração herdaria a inconsistência. Havia também **zero teste
unitário** cobrindo o fluxo de lock/unlock (só exercitado de passagem por
`tests/navigation-browser.test.cjs`/`tests/occasions-browser.test.cjs`).

Achado novo, ao investigar para esta spec: `closeSensitiveDialogs()` incrementa
`let securitySetupGeneration` (`app.js:845`), uma variável de módulo (não em `state`)
também incrementada por `openSecurityMethodDialog`/`closeSecurityMethodDialog`/
`openPinSetupDialog`/`closePinSetupDialog` e lida por `handlePinSetupSubmit`/
`chooseDeviceSecurity` para saber se uma configuração assíncrona em andamento (derivar
PIN, criar credencial) foi cancelada/superada enquanto esperava. Isso acopla
`closeSensitiveDialogs` aos diálogos de *configurar* segurança, que ficam fora desta
spec (ver "Fora de escopo" abaixo) — por isso `securitySetupGeneration` precisa virar
campo de `state` (não é dado persistido; só estado de execução) para as duas partes
continuarem lendo/incrementando o mesmo contador depois que uma delas virar módulo.

## Decisão

Duas sub-fases, nesta ordem (a primeira é pré-requisito da segunda):

**9.3.1 — Resolver a duplicação em `reset.js` antes de mexer em mais nada.**
Extrai só a contagem de tentativas + acionamento do bloqueio temporário (a parte
realmente duplicada) para `src/security/config.js`:

```js
function registerFailedPinAttempt() {
  state.pinFailedAttempts += 1;
  const lockedOut = state.pinFailedAttempts >= PIN_LOCKOUT_ATTEMPTS;
  if (lockedOut) state.pinLockoutUntil = Date.now() + PIN_LOCKOUT_MS;
  return lockedOut;
}
```

`app.js:handlePinUnlock` e `reset.js:submitDataReset` passam a chamar essa função em
vez de reimplementar o incremento/limite cada um a seu modo. **Não** unifica a lógica
de "limpar contadores quando o bloqueio já expirou" — hoje ela é propositalmente
diferente entre os dois (`app.js` limpa proativamente via o timer de
`updatePinLockoutMessage()`, que mantém uma contagem regressiva visível na tela de
bloqueio; `reset.js` limpa de forma preguiçosa, só na próxima tentativa, porque não tem
essa contagem visível) — forçar as duas a serem idênticas mudaria comportamento
visível sem necessidade. `PIN_LOCKOUT_ATTEMPTS`/`PIN_LOCKOUT_MS` continuam constantes
de `app.js`, publicadas em `globalThis` como já são hoje.

**9.3.2 — Testes antes, depois extração** (mesmo padrão da 9.2.3/9.2.5). Primeiro
testes unitários de `handlePinUnlock`/`lockApp`/`unlockApp`/`showLockScreen`/
`closeSensitiveDialogs`/`handleDeviceUnlock` via `extract()`+`vm.runInContext` contra
o `app.js` atual (rede de segurança, num commit). Depois, extração para
`src/security/lock.js`:

```js
export function createSecurityLock({
  state, lockScreen, lockError, deviceUnlockPanel, pinUnlockForm, pinUnlockValue,
  deviceUnlockButton, privacyShield, pinSetupValue, pinSetupConfirm, toast,
  getConfiguredPinLength, normalizePinInput, verifyPin, verifyDeviceCredential,
  getPinLockoutRemainingMs, registerFailedPinAttempt,
  clearSecuritySession, saveSecuritySession, markSecurityActive,
  hideToast, hideUpdateAvailable, render, renderHistory, maybeHandleSharedDrinkImport,
}) {
  // lockApp, unlockApp, showLockScreen, closeSensitiveDialogs, handlePinUnlock,
  // handleDeviceUnlock, showPrivacyShield, hidePrivacyShield, updatePinLockoutMessage
  return { lockApp, unlockApp, showLockScreen, closeSensitiveDialogs, handlePinUnlock,
    handleDeviceUnlock, showPrivacyShield, hidePrivacyShield };
}
```

`app.js` constrói o factory (mesmo padrão de `createDrinkInteractions`/
`createEventDialog`), destrutura o retorno como `const` (para o
`Object.assign(globalThis, {...})` continuar publicando os mesmos nomes) e os 3
listeners de auto-lock **continuam em `app.js`**, agora chamando as funções
importadas em vez de definidas inline — não precisam de reescrita para nomear a
função, só trocam o corpo por chamadas.

`state.securitySetupGeneration` substitui `let securitySetupGeneration` — campo novo
em `state`, não persistido, lido/incrementado tanto pelo módulo novo
(`closeSensitiveDialogs`) quanto pelos diálogos de configuração que ficam em `app.js`.

## Contrato do módulo

- `src/security/config.js` ganha `registerFailedPinAttempt` como export nomeado a
  mais, junto dos já existentes.
- `src/security/lock.js` é novo; export nomeado `createSecurityLock`. Nenhum dos dois
  módulos toca `localStorage` diretamente (regra de `src/README.md`) — `clearSecuritySession`/
  `saveSecuritySession` continuam em `app.js`, injetadas por parâmetro.
- Compatibilidade de dados: nenhum campo de `SECURITY_STORAGE_KEY`/`DATA_STORAGE_KEY`
  muda. `state.securitySetupGeneration` é estado de execução (como
  `state.securityLocked`), nunca gravado.
- `reset.js` continua script clássico, lendo `registerFailedPinAttempt` publicado em
  `globalThis` como já lê `verifyPin`/`getPinLockoutRemainingMs` hoje.

## Casos de borda preservados

- PIN incorreto reduz tentativas restantes na mensagem da tela de bloqueio
  (`app.js:1029`); ao atingir `PIN_LOCKOUT_ATTEMPTS`, mostra a contagem regressiva de
  `PIN_LOCKOUT_MS` (`updatePinLockoutMessage`, com `setTimeout` recorrente) — sem
  teste hoje, precisa ganhar um em 9.3.2.
- `reset.js`: "PIN incorreto e bloqueio de tentativas impedem exclusão" já testado em
  `tests/reset.test.cjs` — deve continuar passando sem alterar suas asserções (só
  troca `state.pinFailedAttempts += 1; if (...) state.pinLockoutUntil = ...` por uma
  chamada a `registerFailedPinAttempt()`).
- Contadores compartilhados entre os dois fluxos: hoje, errar o PIN na tela de
  bloqueio e depois tentar "Apagar tudo" (ou vice-versa) soma no mesmo
  `state.pinFailedAttempts`/`pinLockoutUntil` — comportamento existente e intencional
  (um único contador de tentativas erradas por sessão, não um por fluxo); não muda.
- `unlockApp()` processa `state.pendingSharedImportCheck` (compartilhamento recebido
  enquanto o app estava bloqueado) — depende de `maybeHandleSharedDrinkImport` injetada.
- `handleDeviceUnlock()` distingue `NotAllowedError` (cancelado pelo usuário) de outras
  falhas na mensagem mostrada.
- `closeSensitiveDialogs()` fecha **todo** `dialog[open]`, não só os de segurança —
  comportamento preservado tal qual.

## Fora de escopo (registrado, não implementado nesta spec)

- **Diálogos de configurar método/PIN** (`openSecurityMethodDialog`,
  `closeSecurityMethodDialog`, `openPinSetupDialog`, `closePinSetupDialog`,
  `handlePinSetupSubmit`, `configurePinSecurity`, `configureDeviceSecurity`,
  `chooseDeviceSecurity`, `choosePinSecurity`, `disableSecurity`,
  `initializeSecurity`) — concern diferente (configurar proteção, não o
  desbloqueio do dia a dia); ficam em `app.js`.
- **Os 3 listeners de auto-lock** — continuam definidos em `app.js` (não viram
  funções nomeadas em `src/`), por dependerem de orquestração que atravessa vários
  domínios (privacy shield, sincronização de exceção por evento, render/renderHistory,
  verificação de atualização) além do lock/unlock em si.
- Login biométrico (`isPlatformDeviceAuthAvailable`, `createDeviceCredential`,
  `verifyDeviceCredential`) — WebAuthn de baixo nível, já teria uma fronteira própria
  se algum dia for extraído; fora daqui.

## Plano de teste

- `node --input-type=module --check` de `app.js` e dos dois módulos tocados;
  `node --check` de `reset.js`.
- 9.3.1: teste novo de `registerFailedPinAttempt` em `tests/security-config.test.cjs`
  (incrementa, aciona lockout no limite, não antes); `tests/reset.test.cjs` roda sem
  mudar asserções.
- 9.3.2: testes novos de `handlePinUnlock`/`lockApp`/`unlockApp`/`showLockScreen`/
  `closeSensitiveDialogs`/`handleDeviceUnlock` via `extract()` **antes** da extração,
  depois adaptados para `require()` do módulo real (mesmo padrão da 9.2.3a/9.2.3b).
- `npm test` completo depois de cada sub-fase, não só no fim.
- Teste manual ao fim da 9.3.2: configurar PIN, bloquear manualmente, desbloquear
  certo/errado até o limite de tentativas, aguardar o bloqueio passar, trocar de app e
  voltar (privacy shield + relock por tempo), autenticação por dispositivo (se
  disponível), "Apagar tudo" com PIN errado até bloquear.
- Fora desta rodada: qualquer teste de biometria real em aparelho.

## Nota pós-implementação

As duas sub-fases foram commitadas separadamente (9.3.1 unifica a contagem de
tentativas; 9.3.2 escreve testes antes e depois extrai lock/unlock), cada uma com
`npm test` completo antes do commit seguinte.

Achado real durante a 9.3.2 (registrado no commit): os testes "PIN/dispositivo correto
desbloqueia" verificavam, antes da extração, uma chamada a `unlockApp()` substituída de
fora — isso só funcionava porque a versão em `app.js` lia `unlockApp` como identificador
solto de um `vm.Context`. No módulo real, `unlockApp` é uma closure interna do factory,
não interceptável de fora; os testes passaram a verificar os efeitos observáveis reais
de `unlockApp` ter rodado (`state.securityLocked`/`lockScreen.hidden`), sem perder
cobertura do comportamento.

Teste manual completo (configurar PIN, bloquear manualmente, desbloquear certo/errado
até o limite de tentativas, aguardar o bloqueio passar, trocar de app e voltar,
autenticação por dispositivo se disponível, "Apagar tudo" com PIN errado até bloquear)
confirmado pelo usuário no PWA real. Spec encerrada.
