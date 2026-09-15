# 0018 — Remover suporte à V1 ("Intervalo")

Status: implementada

## ⚠️ Antes de tudo: desambiguar "v1"

Duas coisas completamente diferentes usam "v1" no código, e esta spec mexe em **só
uma** delas:

1. **App antigo "Intervalo" (v1)**, servido em `/intervalo/` por um repositório GitHub
   separado (`arielkeybob/intervalo`, remote `origin` deste repo, GitHub Pages próprio).
   Ninguém mais usa — **é isto que esta spec remove**: o protocolo de negociação,
   transferência e coexistência entre esse app e o FunTime 2, incluindo as chaves de
   `localStorage` que só ele grava (`balada-v1-data`, `balada-v1-drinks`,
   `intervalo-security-v1`, `intervalo-terms-v1`).
2. **`DATA_STORAGE_KEY`/`SECURITY_STORAGE_KEY`/`SECURITY_SESSION_KEY` do próprio
   FunTime 2** (`app.js:296,308` e afins) — que **por acaso** se chamam
   `"funtime-v1-data"`, `"funtime-security-v1"`, `"funtime-terms-v1"` etc. O "-v1-"
   aqui é a versão do *schema de dados do FunTime*, não tem nenhuma relação com o app
   antigo. **Estas chaves não mudam de nome, não saem, e todo o código que as lê/grava
   hoje (`app.js`, `commit()`, `saveData()`, `normalizeData()`) fica intocado.** É a
   própria bebida/histórico/segurança reais do usuário.

Qualquer código tocado nesta spec precisa preservar essa distinção. Nenhuma operação
de "apagar chave legada" pode, por engano, mirar em `funtime-v1-data`/
`funtime-security-v1`/`funtime-terms-v1`.

## Contexto

Levantamento completo feito por agente de exploração antes desta spec (arquivo por
arquivo, com `arquivo:linha`). Resumo do que existe hoje:

- **`boot.js`** mistura, no branch "app instalado como PWA" (`start()`,
  `boot.js:128-186`), duas responsabilidades diferentes: (a) negociar posse/
  transferência de dados com a v1 via `FunTimeTransition`/`FunTimeReceiver`
  (`chooseSetup`, `verifyBridge`, `claim`) e (b) garantir que só uma aba/janela do
  **próprio FunTime 2** escreve por vez, via `navigator.locks`. As duas coisas
  compartilham o mesmo lock (`FunTimeTransition.writerLock`) e a mesma mensagem
  `FUNTIME_PREPARE` ao Service Worker.
- **`transition.js`** (`FunTimeTransition`) e **`receiver.js`** (`FunTimeReceiver`)
  são 100% sobre a ponte v1↔v2 (contrato de posse, `transition.json`, verificação do
  SW da v1). Não são referenciados por nenhum arquivo de produto além de `boot.js`.
- **`migration.js`** (`FunTimeMigration`) mistura: (a) transferência de chaves antigas
  (`balada-*`/`intervalo-*`) para as atuais (`funtime-*`) — sai; (b) `validate()`, que
  hoje roda em **toda leitura normal** de dados/segurança pelo próprio `app.js`
  (`app.js:544,1191`), não só durante transferência — precisa ser preservada, só que
  fora de um arquivo chamado "migration"; (c) `repairDrinkOrderCorruption`, reparo de
  um bug de drag-and-drop da v2.1.23 que grava de volta `funtime-v1-data` sem `null`s
  no array de bebidas.
- **Achado crítico:** `loadSecurityConfig()`/`loadAppData()` em `app.js` só lançam erro
  "fail-closed" em dado corrompido **porque `globalThis.FunTimeMigration` sempre existe
  hoje** (`if (globalThis.FunTimeMigration) throw ...`, `app.js:577,1199,1202`). Se
  `migration.js` for apagado sem tocar nesses `if`, esse guard morto vira **permissivo
  por acidente**: um JSON corrompido em `funtime-v1-data`/`funtime-security-v1` passaria
  a cair silenciosamente em `migrateLegacyData()` (dados vazios) ou
  `getDefaultSecurityConfig()` (proteção resetada), em vez de avisar o usuário e
  preservar os dados brutos. Isso não pode ser um efeito colateral — precisa virar
  comportamento explícito (ver Decisão).
- **`repairDrinkOrderCorruption` é seguro de remover sem perda:** `normalizeData()`
  (`app.js:1213`, chamada em **toda** leitura) já filtra `drink && drink.id &&
  drink.name`, ou seja, já descarta entradas `null` do array em memória a cada boot,
  independente desse reparo. A única diferença é que o reparo também *persistia* a
  limpeza; sem ele, a limpeza continua acontecendo em memória e é regravada
  naturalmente no próximo `commit()` normal (qualquer ação do usuário já salva).
- **`sw.js`**: `APP_SHELL` tem 3 entradas exclusivas de migração
  (`migration.js`/`transition.js`/`receiver.js`); as mensagens `GET_VERSION`/
  `FUNTIME_PREPARE` respondem campos `migrationProtocol`/`transitionProtocol` só para a
  v1 verificar compatibilidade — mas o mecanismo por trás (`prepareMigrationClients`/
  `hasMigrationBoot`, que navega janelas desatualizadas da própria v2) é genérico e
  reaproveitado pela exclusividade entre abas.
- **Nenhuma pasta física da v1 existe neste repositório** — é servida por um
  repositório GitHub separado (Pages). Os testes hoje buscam esse código via
  `git show <commit-antigo>` (`tests/bridge-fixture.cjs`, commit congelado `7c93bd2`/
  `7c75410`), nunca por uma pasta local.
- **Decisão já tomada com o usuário:** manter uma versão **simplificada** da
  exclusividade entre abas/janelas do FunTime 2 (não abrir mão dela), removendo só a
  parte de negociação/ponte com a v1.

## Decisão

### Arquivos removidos por completo

- `transition.js`, `receiver.js`, `migration.js`
- `transition.json`, `transition-v2-ready.example.json`
- Testes: `tests/transition.test.cjs`, `tests/transition-browser.test.cjs`,
  `tests/receiver.test.cjs`, `tests/migration.test.cjs`,
  `tests/migration-browser.test.cjs`, `tests/release.test.cjs`,
  `tests/bridge-fixture.cjs`

### `boot.js` — reescrito, mantendo exclusividade simplificada

Fica: DOM/erro (`showError`/`FunTimeBootFailure`), `loadScript`/`loadApp` (lista de
scripts sem `migration.js`/`transition.js`/`receiver.js`), o branch instalado vs. não
instalado, `prepareWorker()` (checa versão/oferece update — não é sobre v1).

Sai: `chooseSetup()`, `FunTimeTransition.readOwner`/`FunTimeReceiver.verifyBridge`/
`inspect`/`prepare`/`claim`, `FunTimeMigration.repairDrinkOrderCorruption`,
`FunTimeRestoreRequested`, `FunTimeSessionReady` (deixa de existir — sem branch de
"sessão não herdada de v1", `loadSecuritySession()` sempre pode tentar a sessão
normal), a limpeza de `sessionStorage` de chaves `-v1-` no boot, o link
`#startup-old`/`href="/intervalo/"`, os textos "Encontramos dados da versão
anterior…"/"Nenhum dado foi encontrado…".

Novo branch "instalado" (substitui `boot.js:136-185`):
```js
if (!navigator.locks) throw new Error("Este navegador precisa ser atualizado para usar o FunTime com proteção contra janelas simultâneas.");
show("Abrindo o FunTime…");
let waitingForWriter = true;
const writerWaitNotice = setTimeout(() => {
  if (waitingForWriter) show("O FunTime já está aberto em outra janela. Feche as outras janelas para continuar aqui.");
}, 800);
try {
  await navigator.locks.request("funtime-writer-lock", async () => {
    waitingForWriter = false;
    clearTimeout(writerWaitNotice);
    try {
      if (!(await prepareWorker())) return;
      await loadApp();
    } catch (error) { showError(error); }
    await new Promise(() => {});
  });
} finally {
  waitingForWriter = false;
  clearTimeout(writerWaitNotice);
}
```
(Nome do lock trocado de `funtime-app-writer-v1` para `funtime-writer-lock` — sem
sufixo `-v1-`, para não sugerir relação com o schema de dados. É só o nome do lock,
não persiste em `localStorage`, renomear não tem custo de migração.)

Guarda de pathname (`boot.js:129-131`) perde a menção a `/intervalo/` na mensagem de
erro.

### `sw.js`

- Remove as 3 entradas de `APP_SHELL` (`migration.js`/`transition.js`/`receiver.js`).
- `GET_VERSION` para de responder `migrationProtocol`/`transitionProtocol` — só
  `{ version }`.
- `FUNTIME_PREPARE`/`prepareMigrationClients`/`hasMigrationBoot`/`isAppWindow` **ficam**
  (mecanismo genérico de exclusividade entre janelas da v2), mas a resposta perde
  `transitionProtocol`; `FUNTIME_BOOT_CHECK` (`boot.js:21-25`) responde só
  `{ protocol: 2 }`, sem relação com v1 mesmo hoje.

### `app.js`

- `loadSecurityConfig()`/`loadAppData()`: os guards `if (globalThis.FunTimeMigration)`
  saem, mas o **comportamento fail-closed em dado corrompido é preservado
  explicitamente** — `validate()` (renomeado, ex. `validateStoredShape(raw, key)`) migra
  para dentro de `app.js` como função própria (mesmas checagens de shape hoje em
  `migration.js:22-53`, restritas a `funtime-v1-data`/`funtime-security-v1`), chamada
  incondicionalmente, sempre lançando em formato inválido — sem depender de nenhum
  global externo.
- `migrateLegacyData()` (`app.js:1270+`) e o fallback de `getDefaultSecurityConfig()` em
  erro passam a ser o caminho normal (não mais "morto") só para o caso legítimo de
  **primeira instalação sem nenhum dado ainda** (raw === null) — não para dado
  corrompido, que continua lançando erro.
- Remove o bloco `if (globalThis.FunTimeRestoreRequested) {...}` (`app.js:4243-4249`) —
  órfão, dependia só do fluxo de `chooseSetup` que sai.
- `loadSecuritySession()`: remove o guard `globalThis.FunTimeSessionReady === false`
  (`app.js:583`) — sem v1, toda sessão nova é tratada igual (sessão normal,
  comportamento inalterado no dia a dia, já que esse guard só disparava vindo da v1).

### `reset.js`

Remove o bloco `if (globalThis.FunTimeMigration) {...}` (`reset.js:115-119`) e as duas
linhas de limpeza pontual de chaves só-v1 (`localStorage.removeItem('intervalo-security-v1')`,
`caches.delete('intervalo-share-target-v1')`) — são no-ops garantidos hoje (o usuário já
migrou; essas chaves/cache não existem mais neste dispositivo) e dependiam de
`migration.js`. `LEGACY_DRINKS_STORAGE_KEY`/`SECURITY_STORAGE_KEY`/
`SHARE_IMPORT_CACHE_NAME` (as chaves atuais) continuam sendo limpas normalmente.

### `index.html` / `styles.css`

Remove `#startup-continue`, `#startup-backup`, `#startup-old` e as regras CSS
específicas deles (`styles.css:2354,2356,2358`). `#startup-retry` fica (reaproveitado
por erro/update). `#browser-gate*`/`#terms-screen` ficam intocados (não são v1).

### Testes adaptados (não removidos por completo)

- **`tests/receiver-browser.test.cjs`**: os testes (2)-(4) (transferência v1→v2,
  backup isolado, dados sem ponte) saem. Os testes (1) ("página de instalação conclui
  por evento…") e (5) ("dev.2 atualiza pelo botão…") cobrem comportamento genuíno da
  v2 — migram para `tests/install.test.cjs` e um teste de update-por-lock dedicado
  (`tests/update-lock-browser.test.cjs` ou similar), respectivamente. Arquivo original
  é apagado depois da migração.
- **`tests/migration-sw.test.cjs`**: os testes de limpeza de cache `intervalo-*` e
  isolamento de fetch para `/intervalo/` saem. Os testes de `prepareMigrationClients`/
  `GET_VERSION`/`FUNTIME_PREPARE` ficam, ajustados para a resposta sem
  `transitionProtocol`.
- **`tests/v2-preview.test.cjs`**: o teste "v2 no endereço antigo não acessa
  armazenamento" é ajustado para a nova mensagem de erro do guard de pathname (sem
  citar `/intervalo/` como link de fallback).
- **`tests/install.test.cjs`**: remove só o teste "v1 instalada não é confundida com
  FunTime 2" (linhas 115-118) — testava `detectInstalledPwa()` contra o manifest da v1,
  que deixa de ser um cenário relevante.
- **Novo teste em `app.js`'s suite** (`tests/audit.test.cjs` ou dedicado): cobre
  `validateStoredShape`/comportamento fail-closed que antes vivia em
  `tests/migration.test.cjs`, para não perder a cobertura do achado crítico acima.

## Correção após a implementação

Dois ajustes em relação ao desenho original, descobertos ao implementar:

1. **`readPendingSharedDrinkFile()`/`maybeHandleSharedDrinkImport()` em `app.js`**
   não constavam no levantamento original, mas também faziam parte da coexistência
   com a v1: verificavam o cache de share-target **da v1** (`intervalo-share-target-v1`,
   caminho `/intervalo/__shared-drinks-import__`) além do cache atual da v2, para não
   perder um arquivo compartilhado com o app antigo antes de abrir o v2. Simplificadas
   para checar só o cache/caminho atuais (`SHARE_IMPORT_CACHE_NAME`/
   `SHARE_IMPORT_REQUEST_PATH`). Nenhum teste cobria esse caminho duplo depois que
   `tests/receiver-browser.test.cjs` foi removido (o único teste que exercitava isso
   fazia parte do mesmo arquivo).
2. **Mais testes preservados do que o previsto:** ao reescrever
   `tests/migration-sw.test.cjs` (renomeado para `tests/sw-boot.test.cjs`), percebi que
   quase todos os testes ali — limpeza de cache na ativação, isolamento de fetch fora do
   escopo — não são especificos da v1: testam comportamento genérico do próprio SW
   (regex `/^funtime-v2-/` na limpeza, guarda de escopo por `pathname`) usando nomes de
   cache/caminhos "v1" só como exemplo realista. Mantive todos, só trocando os nomes de
   exemplo (`intervalo-*`/`/intervalo/`) por genéricos (`other-app-cache`/
   `/other-app/`), preservando a cobertura real em vez de descartá-la. Mesmo raciocínio
   aplicado a `tests/install.test.cjs`: o teste "v1 instalada não é confundida" virou
   "app relacionado com outro id não é confundido", com um id genérico no lugar de
   `/intervalo/`, porque a lógica de correspondência de `detectInstalledPwa()` que ele
   cobre continua existindo e não é sobre v1 especificamente.
3. **Testes extraídos de `receiver-browser.test.cjs` em arquivos próprios**, seguindo a
   convenção existente de um arquivo por cenário Playwright, em vez de dentro de
   `tests/install.test.cjs` (que é baseado em `vm`, não em navegador real):
   `tests/install-browser.test.cjs` (teste 1) e `tests/update-lock-browser.test.cjs`
   (teste 5, com um helper local mínimo para ler a build antiga via `git show`,
   substituindo `tests/bridge-fixture.cjs`).
4. **Nomes internos de `sw.js`** ficaram `funtime-writer-lock` (era
   `funtime-app-writer-v1`), `prepareBootClients`/`hasCurrentBoot` (eram
   `prepareMigrationClients`/`hasMigrationBoot`) — só nomes internos, sem persistência
   em `localStorage`, renomear não tem custo de compatibilidade.

Validado: `node --check`/`node --input-type=module --check` em todos os arquivos
tocados; suíte completa rodada após as mudanças (ver relato de testes no commit).

## Fora desta spec (decisões separadas, não-código)

- O repositório/Pages `arielkeybob/intervalo` em si (remote `origin`) — continuar
  existindo, arquivar, ou apagar é decisão sobre infraestrutura/hospedagem, não sobre
  este código.
- O worktree local `.worktrees/v1-16` (branch `codex/v1-16-install-ux`, gitignorado) —
  fica como está; não é tocado por nenhuma mudança desta spec.
- `AGENTS.md:3,8,9,10` referenciam o protocolo de migração/transição como regra
  vigente — precisam de atualização **depois** que este código sair, numa
  edição separada e pequena (não faz sentido revisar AGENTS.md antes do código
  mudar).
- Docs históricos (`MIGRATION-FUNTIME.md`, `TRANSITION-V2.md`, seções de
  `V2-PREPARATION.md`/`RELEASE-V2.md`/`ROADMAP.md`/`README.md`/`DEVELOPMENT.md` sobre
  a ponte) — viram registro histórico do que já aconteceu; não precisam ser apagados
  nem editados (não descrevem nada que ainda precise funcionar), só deixam de ser
  "vigentes". Posso sinalizar isso com uma nota no topo de cada um, se você quiser,
  numa PR separada.

## Casos de borda a validar com cuidado

1. **Primeira instalação, sem dado nenhum**: hoje passa por `chooseSetup()` mostrando
   "Nenhum dado foi encontrado…"/"Começar sem dados". Sem esse branch, o boot deve ir
   direto para `loadApp()`, e `loadAppData()` volta o caminho `raw === null` →
   `migrateLegacyData()` (que já retorna dataset vazio válido quando
   `LEGACY_DRINKS_STORAGE_KEY` também está vazio) — precisa de teste manual/automatizado
   confirmando que o app abre normalmente, vazio, sem exigir nenhuma ação extra do
   usuário.
2. **Dado corrompido em `funtime-v1-data`/`funtime-security-v1`** (ex. JSON truncado):
   antes e depois desta spec precisa continuar lançando erro visível ("Não foi possível
   ler seus dados. Tente novamente.") em vez de resetar silenciosamente — este é o
   caso que valida o achado crítico.
3. **Duas abas/janelas do FunTime 2 abertas ao mesmo tempo** (instalado): a segunda
   deve continuar mostrando "O FunTime já está aberto em outra janela…" e assumir ao
   fechar a primeira — mesmo comportamento de hoje, só sem a camada de v1.
4. **Atualização de versão via SW** (`prepareWorker`/`FUNTIME_PREPARE`) continua
   funcionando igual — coberta pelo teste migrado de
   `receiver-browser.test.cjs` (5).
5. **Restaurar um backup JSON exportado por uma versão bem antiga**: continua
   funcionando sem qualquer relação com esta spec — `validateBackupPayload`/import de
   bebidas em `app.js` já lidam com tipos antigos (`intervalo-backup`/
   `intervalo-drinks`) por conta própria, sem depender de `migration.js`.
6. **"Apagar tudo" nas configurações**: continua limpando `funtime-v1-data`,
   `funtime-security-v1` e demais chaves atuais normalmente; só as duas linhas de
   limpeza de resíduo específico da v1 saem (item já sem efeito hoje).

## Plano de teste

- `node --check` de todos os arquivos tocados (`boot.js`, `sw.js`, `app.js`,
  `reset.js`, `index.html` não se aplica, `node --check` normal para os `.js`).
- `npm test` completo — baseline esperado depois desta spec: as 2 falhas hoje
  conhecidas de `receiver-browser.test.cjs` **desaparecem** (o arquivo é removido/
  dividido); atenção a qualquer falha nova introduzida pela reescrita de `boot.js`.
- Teste manual obrigatório antes de fechar (maior risco: fluxo de boot inteiro,
  igual à Fase 7): instalação nova sem dados, abrir com dados reais existentes,
  configurar/testar PIN, abrir o app em duas abas ao mesmo tempo (checar mensagem de
  espera e handoff ao fechar uma), forçar uma atualização de versão pelo botão.
- Fora desta rodada: qualquer edição em `AGENTS.md` ou nos docs históricos (seção
  "Fora desta spec" acima).
