# 0027 — Conta desconectada sem pedir: lembrar, avisar e retomar

## Contexto

A sessão do Firebase pode acabar sem a pessoa pedir: ao abrir o app o SDK recarrega o
usuário salvo, e qualquer falha que não seja de rede (renovação recusada, erro interno)
faz o Firebase relatar "sem usuário". Em `onSignedOut` (`app.js`), isso era tratado igual
a "Sair": `rememberSyncConnection(false)` apagava `funtime-sync-v1`. Sem a chave, as
aberturas seguintes nem chamavam `firebaseAuth.init()`. A conta sumia em silêncio, e só
se notava pelo ícone de Amigos ausente no topo (ele só aparece com conta conectada).

Dois problemas menores agravavam:

- `src/auth/firebase-auth.js` guardava a promessa de carregamento do SDK mesmo rejeitada
  (abrir sem internet travava até o "Entrar" na sessão inteira). Além disso, o navegador
  guarda a falha de um `import()` dinâmico da mesma URL (confirmado no Edge 155), então
  zerar a promessa sozinho não bastava.
- Durante o carregamento do SDK, o menu já dizia "Sem conta conectada".

## Decisão

- **Queda ≠ saída.** `syncSigningOut` marca as saídas pedidas (Sair, Apagar dados na
  nuvem); só elas apagam `funtime-sync-v1` (`forgetSyncConnection`). As outras chamam
  `markSyncConnectionLost`: mantém `connected: true` (o app continua tentando retomar a
  cada abertura) e grava `lost: true`. Exceção: primeiro login por redirect abandonado
  (`redirecting` sem `account`) continua limpando, porque nunca houve conta.
- **Estados** (`syncAuthState`): `pending` (retomando), `failed` (SDK não baixou),
  `ready`. `describeSyncState()` é a fonte única para o menu, o cartão e o aviso.
- **Aviso compacto na Home** (`#sync-lost-notice`), só em queda: *Conectar* (abre o
  login), *Mais tarde* (`snoozedUntil` = agora + 12 h; reavaliado quando o app volta à
  frente) e *Não perguntar mais* (`dontAsk`; cala só o aviso, o menu e o cartão
  continuam mostrando a queda). O próximo login limpa `lost`, `snoozedUntil` e `dontAsk`.
- **Indicação visual:** sem conta, o item "Backup e conta" troca a nuvem pela nuvem
  cortada; quando pede atenção (queda, sem internet, nunca conectado), ícone e resumo
  ficam laranja (`--warning`). "Conectando…" fica neutro. O cartão "Sincronizar entre
  aparelhos" ganha `#sync-state-note` com o motivo.
- **Retomada sem internet:** `importWhenReachable` faz um `fetch` (`no-cors`) antes do
  `import()`, para a falha de rede não ficar registrada no mapa de módulos. A promessa
  rejeitada é descartada. O app tenta de novo no evento `online` e ao voltar à frente.

Não muda: o schema de dados do app (`DATA_VERSION`), o backup, as regras do Firestore,
o comportamento de "Sair" e "Apagar dados na nuvem", nem a exigência de conta para Amigos.

## Contrato

`funtime-sync-v1` (localStorage, só deste aparelho; fora do backup):
`{ connected, account?, fullHistoryFor?, redirecting?, lost?, lostAt?, snoozedUntil?, dontAsk? }`.
Chaves antigas (`{ connected: true }` sem `account`) continuam válidas: uma queda nelas
vira aviso sem e-mail. `fullHistoryFor` sobrevive à queda, então reconectar a mesma
conta não refaz o download completo.

## Plano de teste

- `tests/firebase-auth.test.cjs`: falha ao baixar o SDK não trava as tentativas seguintes.
- `tests/sync-lost-browser.test.cjs` (SDK falso servido no lugar do CDN): queda avisa e
  mantém a lembrança; Mais tarde / Não perguntar mais / Conectar; sem internet mostra o
  motivo e retoma no `online`; nunca conectado fica laranja sem aviso; Sair não vira aviso.
- Fora do automatizado: queda real do Firebase num aparelho (não reproduzível sem
  revogar a sessão).
- **Afeta algum tutorial?** Nenhum (`npm run tutorials:check` em dia).

## Nota pós-implementação (v2.34.3) — sessão no localStorage

Num celular com 1% de espaço livre, o Chrome apagou o IndexedDB, o Cache Storage e o Service
Worker do site (e os de outro site), mas não o localStorage. Provas, lidas no aparelho por
depuração USB: o contador de consultas do Firestore recomeçou do zero no IndexedDB enquanto o
registro dele no localStorage seguia desde 18/09, e os dois únicos Service Workers do navegador
tinham sido recriados no mesmo dia. A sessão do Firebase, guardada no IndexedDB pelo `getAuth`,
foi junto, e o app mostrou o aviso de queda desta spec.

`src/auth/firebase-auth.js` passou a usar `initializeAuth` com a persistência
`[browserLocalPersistence, indexedDBLocalPersistence]` e `browserPopupRedirectResolver` (o que
o `getAuth` já passava). A sessão que está no IndexedDB é migrada pelo próprio SDK para o
localStorage na primeira abertura, sem novo login. Verificado com o SDK real 12.19.0, com os
servidores de login bloqueados: com o código antigo a conta caía ao apagar o IndexedDB; com o
novo, a sessão migra e continua.

A queda de 02/11/2026 aconteceu com o armazenamento intacto e segue sem causa conhecida
(ROADMAP.md, "Correções a fazer").
