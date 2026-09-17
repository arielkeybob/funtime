# 0022 — Sincronização entre aparelhos com Firebase Auth + Firestore

Status: implementada

## Contexto

Todo o dado do app vive só em `localStorage` (`DATA_STORAGE_KEY = "funtime-v1-data"`,
`app.js:301`). Limpar dados do navegador, trocar de aparelho ou reinstalar pode apagar
o histórico, e não há como ver os mesmos registros em dois aparelhos. Hoje a única
permanência é manual: `createBackup()` (`app.js:1322`) gera um JSON e
`confirmBackupRestore()` (`app.js:1668`) restaura, ambos exigindo ação do usuário a
cada vez. `requestPersistentStorage()` (`app.js:3053`) reduz o risco de despejo pelo
navegador, mas não protege contra troca/perda de aparelho.

O pedido é backup automático no modelo do WhatsApp: os dados sobem sozinhos de tempos
em tempos e voltam em outro aparelho, sem o usuário salvar arquivo ou criar pasta.
Três alternativas foram avaliadas e descartadas antes desta decisão:

1. **Google Drive API (`appDataFolder`, pasta oculta por app)** — tecnicamente viável
   e 100% client-side, mas o escopo `drive.appdata` é sensível: sem passar pela
   verificação do app no Google, só funciona em modo "Testando", com **cada conta
   Google adicionada manualmente** como testadora (limite 100). O usuário quer que
   qualquer pessoa que instale o app possa ativar sozinha, e não quer publicar/
   verificar o app no Google. Incompatível.
2. **Arquivo local via File System Access API** (usuário escolhe uma vez uma pasta —
   por exemplo a do Google Drive sincronizada no PC — e o app regrava lá sozinho) —
   `showSaveFilePicker`/`showDirectoryPicker` **não existem no Safari iOS nem no
   Chrome Android**, só em navegadores desktop Chromium. Como o uso real do app é
   majoritariamente no celular, não cobre o caso principal.
3. **Só melhorar o export/import manual que já existe** — não atende o "automático".

**Decisão do usuário: Firebase Authentication (provedor Google) + Cloud Firestore.**
O login do Firebase pede apenas `email`/`profile` (escopo não sensível), então não
passa por verificação do Google nem tem limite de testadores; funciona em iOS,
Android e desktop; e o plano Spark (gratuito, sem cartão) cobre Auth + Firestore com
folga nesta escala. Isso é uma **mudança de escopo deliberada e autorizada** em
relação ao `AGENTS.md` ("Preserve HTML/CSS/JavaScript puro, sem build ou backend,
salvo mudança de escopo solicitada"): continua sem build (o SDK modular do Firebase é
importado como ES module direto do CDN) e sem backend administrado por nós, mas passa
a existir um serviço gerenciado de terceiros guardando dados do usuário. A concessão
foi feita com conhecimento de causa e precisa ficar explícita em `policies.html`.

### Achados na investigação (mudam o desenho ingênuo)

- **18 pontos de mutação já passam por uma única referência `commitAppData`**: 7
  diretos em `app.js` (1193, 1221, 1538, 1674, 1795, 2865, 2878) e 11 injetados via
  fábrica em `src/drinks/interactions.js` (138, 161, 237, 259, 294, 361, 387, 442…) e
  `src/history/event-dialog.js` (109, 128). Como as fábricas recebem `commitAppData`
  por parâmetro de `app.js` (`app.js:2647`, `app.js:2671`), trocar o import e definir
  um wrapper local com o **mesmo nome** cobre os 18 sem editar call site nenhum.
- **`commit()` não é o único caminho de escrita em `DATA_STORAGE_KEY`.** Três
  bypasses, confirmados por grep:
  - `occasions-ui.js:14` (`commitOccasions()`) — choke point de toda mutação de
    ocasião (criar/editar/excluir manual + `reconcileOccasions()` automático). Grava
    direto e **já** chama `globalThis.syncSecurityEventUnlock?.()` na linha seguinte
    (`occasions-ui.js:16`): precedente exato do hook que esta spec precisa.
  - `reset.js:106` (`executeDataReset()`) — resets destrutivos, deixados fora da
    migração para `commit()` de propósito (`docs/specs/0005-store-core.md`,
    `docs/specs/0007-store-ordering-bug-sites.md`).
  - `app.js:1173` (`migrateLegacyData()`) — migração única de dados V1 no primeiro
    boot, antes de existir conta conectada; sem tratamento especial (a primeira
    mutação real depois do login já sincroniza o estado completo).
- **Nenhum registro tem campo de edição, e não precisa ganhar um.** `normalizeData()`
  (`app.js:1064`) e `FunTimeOccasions.normalize()` (`occasions.js:7`) mostram: drinks
  `{id,name,icon,intervalMinutes,askDoseSize}`; events `{id,drinkId,drinkName,
  drinkIcon,consumedAt,occasionId,intervalMinutes,doseSize,countingStoppedAt?}` —
  `consumedAt` é timestamp de domínio (quando a dose foi tomada), não de edição;
  occasions `{id,name,startedAt,endedAt,scheduledStartAt?,…}`. A versão inicial desta
  spec previa adicionar `updatedAt` por registro e subir `DATA_VERSION` 11 → 12 para
  resolver conflitos. **Descartado**: o Firestore já carimba cada escrita com
  `serverTimestamp()` (relógio do servidor, imune a relógio errado no aparelho) e
  ordena escritas concorrentes no servidor; o SDK ainda aplica escritas pendentes
  offline de forma otimista nos snapshots (`metadata.hasPendingWrites`), então uma
  edição local não é sobrescrita por um snapshot antigo. Somar a isso que `createId()`
  gera ids por aparelho — dois aparelhos nunca criam o mesmo id — e o campo local fica
  sem função. **O formato em `localStorage` não muda e `DATA_VERSION` continua 11**
  (`app.js:303`), eliminando a migração de schema, que era a parte de maior risco
  desta mudança.
- **Os listeners de `visibilitychange`/`beforeunload`/`pointerdown` (`app.js:2961`,
  `3023`, `3028`) começam todos com `if (!IS_STANDALONE_APP || …) return;`** — existem
  para o cadeado de PIN/privacy shield. Os gatilhos novos de envio ficam em listeners
  próprios, separados desses, filtrando só `terms-pending`.
- **Mas a sincronização inteira fica desligada fora do app instalado.** Achado durante
  a implementação, corrigindo a conclusão anterior de que sincronizar não dependeria do
  modo de exibição: `initialData` é `normalizeData({ drinks: [], events: [] })` quando
  `IS_STANDALONE_APP` é falso — a tela de instalação **não** carrega os dados reais, de
  propósito. Se a sincronização rodasse ali, `buildCurrentAppData()` devolveria um
  retrato vazio, que subiria para a nuvem e voltaria apagando o histórico real no
  aparelho. Por isso `firebaseAuth` só é criado com `IS_STANDALONE_APP && isFirebaseConfigured()`,
  espelhando o que `state.securityConfig` (`app.js:385`) já faz pelo mesmo motivo.

## Decisão

### Modelo de dados no Firestore

```
users/{uid}/drinks/{drinkId}
users/{uid}/events/{eventId}
users/{uid}/occasions/{occasionId}
users/{uid}/meta/app          → { preferences, version, syncedAt: serverTimestamp() }
```

`syncedAt` existe só para mostrar "última sincronização" na interface; não é usado
como critério de conflito (quem ordena escritas é o próprio servidor do Firestore).

Um documento por registro, não um blob único. Cada `drink`/`event`/`occasion` já tem
`id` estável, que vira o id do documento. O motivo é conflito: registrar uma dose no
celular enquanto se edita o nome de uma bebida no tablet, ambos offline, são escritas
em documentos **diferentes** — nunca colidem. Um documento único com o JSON inteiro
reintroduziria exatamente o problema de "último a gravar apaga o resto" que inviabilizou
a ideia do arquivo no Drive. Invariantes que atravessam registros (ocasiões não
sobrepostas, `occasionId` de evento apontando para ocasião que o contém) continuam
sendo validadas **localmente** sobre o array completo, como já acontece hoje na
restauração de backup — o Firestore não precisa conhecê-las.

### Regras de segurança (única camada de controle de acesso; não há servidor)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Escopo deliberado: isolamento entre usuários (ninguém lê/escreve a subárvore de
outro), **não** validação de schema nas regras. O app já valida forma via
`normalizeData()`/`FunTimeOccasions.normalize()` antes de gravar e ao receber;
duplicar isso em linguagem de regras seria manter a mesma validação em dois lugares
sem ganho real nesta escala.

### Módulos novos em `src/`

Padrão de fábrica com dependências injetadas, igual `createSecurityConfig`
(`app.js:376`) e `createSecurityLock` (`src/security/lock.js:3`); exports nomeados;
`kebab-case.js`.

```js
// src/auth/firebase-auth.js
export function createFirebaseAuth({ firebaseConfig, onSignedIn, onSignedOut })
  // → { signIn, signOut, getCurrentUser }

// src/data/firestore-sync.js
export function createFirestoreSync({ db, uid, onRemoteUpdate, normalizeData, buildCurrentAppData })
  // → { start, stop, scheduleSyncPush, flushPendingWrites, deleteCloudData }
export function diffAppData(previous, next)
  // → { drinkIds, eventIds, occasionIds, preferencesChanged } — pura, testável isolada

// src/data/firestore-config.js
export function getFirebaseConfig()   // objeto público de config (não é segredo)
```

`scheduleSyncPush` não grava por tecla: acumula ids alterados e dispara **uma**
`writeBatch()` depois de ~800 ms de inatividade, incluindo o doc `meta/app`.
`flushPendingWrites()` força o envio imediato. `onSnapshot` por subcoleção recebe
mudanças de outros aparelhos e passa tudo por `normalizeData()` antes de tocar
`state`.

### Integração em `app.js`

`app.js:7` passa de `import { commit as commitAppData }` para
`import { commit as commitToStorage }`, e ganha o wrapper local:

```js
function commitAppData(storageKey, current, patch) {
  const next = commitToStorage(storageKey, current, patch);
  if (storageKey === DATA_STORAGE_KEY) cloudSync?.scheduleSyncPush(current, next);
  return next;
}
```

`cloudSync` é `null` enquanto não houver login — sem conta conectada o wrapper é
no-op e nada sai do aparelho (opt-in real). Para os dois bypasses, uma linha cada,
reusando o precedente de `occasions-ui.js:16`:

- `occasions-ui.js:14` e `reset.js:106`, logo após o `setItem`:
  `globalThis.notifyLocalDataChanged?.();`
- `notifyLocalDataChanged` é publicada por `app.js` no `Object.assign(globalThis, {…})`
  existente e chama `cloudSync?.scheduleSyncPush(previous, buildCurrentAppData())`.

Isso evita migrar `reset.js`/`occasions-ui.js` para `commitAppData` — mudar *como*
esses dois persistem é escopo alheio a esta spec.

**Diferimento com o app bloqueado**: novo `state.pendingSyncApply`, seguindo o padrão
de `state.pendingSharedImportCheck` (`app.js:1742-1745`, drenado em `unlockApp()` em
`src/security/lock.js:61-64`). Snapshot recebido com `state.securityLocked` fica
guardado e só é aplicado ao desbloquear — nunca repinta a tela por trás do cadeado.

**Listeners próprios** (separados dos gated por `IS_STANDALONE_APP`), só pulando
`terms-pending`: `visibilitychange` (flush ao esconder) e `beforeunload` (flush).

### Login

`signInWithPopup` como padrão, com fallback para `signInWithRedirect` quando o popup
falhar (`auth/operation-not-supported-in-this-environment`, popup bloqueado) — o
redirect é mais robusto em webview/standalone de iOS, mas volta no meio da sequência
de boot (`boot.js` + gate de termos), então não serve como caminho principal.

### Decisões de produto confirmadas pelo usuário

1. **Resets destrutivos propagam para a nuvem.** "Apagar histórico"/"Apagar tudo"
   sincronizam o estado esvaziado. Sem isso, a próxima sincronização ressuscitaria
   o que o usuário acabou de apagar — falha pior e mais confusa que propagar.
2. **"Apagar dados na nuvem" é ação explícita e separada**, botão próprio nas
   Configurações, com confirmação: apaga os documentos em `users/{uid}/…` sem tocar
   no `localStorage`. Sair da conta apenas interrompe a sincronização e **não** apaga
   o que já subiu.
3. **Versão 2.2.x** ao concluir (a série atual está em 2.1.47).

## Contrato do módulo

- Três módulos novos com exports nomeados (acima). `src/auth/firebase-auth.js` e
  `src/data/firestore-sync.js` são os primeiros de `src/` a falar com a rede — recebem
  `db`/`auth` por parâmetro, então os testes injetam falsos e nada real é chamado.
  Nenhum dos três toca `state` global nem `localStorage` direto (regra de
  `src/README.md`).
- **Compatibilidade de dados**: nada muda. `DATA_VERSION` continua 11, o formato em
  `DATA_STORAGE_KEY` é o mesmo de hoje, backups já exportados continuam válidos, e
  desinstalar a sincronização não deixa resíduo no dado local. `SECURITY_STORAGE_KEY`
  e `SECURITY_SESSION_KEY` não mudam e **nunca** são sincronizados.
- `reset.js` e `occasions-ui.js` continuam scripts clássicos, lendo
  `notifyLocalDataChanged` via `globalThis` como já leem `syncSecurityEventUnlock`.

## Casos de borda preservados

- Sem login, o comportamento do app é byte-a-byte o de hoje: `cloudSync` é `null`,
  nenhum listener novo faz efeito, nada sai do aparelho.
- PIN/biometria/bloqueio/sessão continuam locais e fora de `buildCurrentAppData()`
  (`app.js:1225`) — estruturalmente impossível sincronizar por engano.
- Backup/restauração manual continua funcionando igual e independente da nuvem
  (`AGENTS.md`: "Exportar/importar bebidas e backup/restauração devem continuar
  visual e funcionalmente separados") — o cartão novo é um terceiro bloco, não
  substitui nem se mistura aos dois existentes.
- Dado vindo da nuvem passa por `normalizeData()`/`FunTimeOccasions.normalize()`
  antes de tocar `state`, igual um backup restaurado — payload corrompido ou que viole
  invariante de ocasião não chega à interface.
- Offline: `writeBatch()` enfileira no SDK e sobe sozinho ao reconectar; o
  `localStorage` segue como fonte de verdade imediata da interface.
- Conflito real (mesmo registro editado em dois aparelhos offline): resolve por
  ordem de chegada no servidor do Firestore (last-write-wins), e os dois aparelhos
  convergem para o mesmo valor pelo `onSnapshot`. Aceito e documentado — mesclagem
  tipo CRDT está fora de escopo.
- **Primeiro login num aparelho que já tem dados locais**: união por `id` entre o
  local e o que está na nuvem (nenhum lado é descartado). Como `createId()` gera ids
  por aparelho, colisão de id entre dados criados independentemente não acontece.

## Fora de escopo (registrado, não implementado nesta spec)

- **Compartilhamento entre pessoas** (ROADMAP.md, "Compartilhamento temporário com
  pessoas autorizadas") — continua fora; esta spec sincroniza os aparelhos de **uma**
  conta, não cruza dados entre usuários.
- **Backup criptografado ponta a ponta** — segue no roadmap; os dados no Firestore
  ficam legíveis pelo projeto Firebase (só o dono da conta os acessa pelas regras, mas
  não há criptografia própria por cima).
- **Emulador oficial do Firebase nos testes** — ver plano de teste.
- Migrar `reset.js`/`occasions-ui.js` para `commitAppData` — escopo alheio.

## Plano de teste

- `node --input-type=module --check < app.js`; `node --check sw.js`,
  `node --check reset.js`, `node --check occasions-ui.js`; `npm test` a cada sub-fase,
  não só no fim.
- `tests/firestore-sync.test.cjs` (novo, `node:test` puro): `diffAppData` (ids
  adicionados/alterados/removidos entre dois snapshots) e o agrupamento com debounce
  (N chamadas rápidas → uma escrita; `flushPendingWrites` envia na hora), com `db`
  falso injetado — mesmo padrão de `fakeStorage()` em `tests/data-store.test.cjs`.
- `tests/firebase-auth.test.cjs` (novo): fluxo de login/logout com auth falsa
  injetada, incluindo o fallback popup → redirect.
- `tests/sync-browser.test.cjs` (novo, Playwright, padrão de
  `tests/data-recovery-browser.test.cjs`): dois `browser.newContext()` como dois
  aparelhos, Firestore/Auth falsos injetados em memória; dose registrada em um aparece
  no outro. **Não** sobe o Firebase Local Emulator Suite: traria `firebase-tools` +
  runtime Java para um repo cuja única devDependency é `playwright`, desproporcional
  para o ganho.
- Regressão de dados: `npm test` existente precisa passar sem alterar asserção
  nenhuma, já que o formato local não muda (é a evidência de que a sincronização é
  puramente aditiva).
- Teste manual: login real em dois aparelhos; dose em um aparece no outro em segundos;
  trocar de app no meio de uma edição (flush ao esconder); sair da conta mantendo os
  dados locais; "Apagar tudo" propagando; "Apagar dados na nuvem" limpando o remoto sem
  tocar no local; usar o app sem nunca logar e confirmar que nada muda.
- Fora desta rodada: teste de carga/quota do plano gratuito; qualquer cenário
  multiusuário.
