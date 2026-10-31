# 0032 — Copiar a lista de bebidas para um amigo

Status: implementada (v2.31.0; troca movida para "Sobre o amigo" na v2.31.1; escolha das bebidas na v2.32.0)

## Contexto

A lista de bebidas já passa de um aparelho para outro por arquivo: **Exportar bebidas** gera
um TXT (`funtime-drinks` v1, `app.js` `exportDrinks`) e **Importar bebidas** abre uma prévia
com Adicionar/Substituir que preserva o histórico (`openDrinkImportPreview` /
`confirmDrinkImport`). Entre amigos já conectados (spec 0023), o pedido foi fazer o mesmo sem
arquivo: "Copiar bebidas para Bia" de um lado, "Receber cópia de bebidas de Ariel" do outro,
com a cópia valendo 24 horas e saindo do servidor depois.

Decisões do usuário: o nome é **Copiar bebidas** (e não "Enviar"); o envio fica no detalhe do
amigo **e** em Configurações, para vários amigos de uma vez; as Políticas ganham o texto novo
**sem pedir novo aceite** (1.0.8 → 1.0.9, ver `policies.js`).

## Decisão

Uma cópia por direção em `drinkCopies/{quem envia}_{quem recebe}`, mais um ponteiro no
pareamento que o outro lado já escuta. É o mesmo desenho de `shares` (0023) e `sharedEvents`
(0025): quem recebe nunca procura nada, só faz `get` do que o ponteiro aponta, e o prazo é
cobrado pelo servidor contra o documento real.

- **Id fixo por direção.** Enviar de novo sobrescreve a cópia anterior: nunca sobra cópia
  órfã nem lista de pendências, e a regra prova a direção pelo próprio id.
- **Receber é importar.** A cópia passa por `validateDrinkExportPayload` (a mesma validação de
  um arquivo, falha fechada) e abre a **mesma prévia** de Importar bebidas, com
  `source: "friend"`. Nada é gravado antes de confirmar. Nenhuma tela nova de importação.
- **Sem escuta nova.** O ponteiro guarda o horário do envio e chega pela escuta de pareamentos
  do `share-writer`. A cópia só é lida ao tocar em "Receber".
- **Sem Cloud Functions, o prazo é a garantia.** Depois de 24h a regra nega a leitura. O
  documento é apagado de fato quando quem recebe importa ou dispensa (na hora), quando quem
  enviou abre o app depois do vencimento, quando a amizade some da escuta de quem enviou, ou
  em "Apagar dados na nuvem".

Não muda: o formato do arquivo de bebidas, o backup, o `localStorage` e `DATA_VERSION` (11).

## Modelo de dados

```
drinkCopies/{fromUid}_{toUid}  { fromUid, toUid, drinks: [{ name, icon, intervalMinutes, askDoseSize }],
                                 drinkCount, formatVersion: 1, createdAt, expiresAt }
pairings/{pairId}.drinkCopies.{fromUid} = sentAtMs | null
users/{uid}/meta/drinkCopies   { handled: { [fromUid]: sentAtMs } }
```

- Só saem os quatro campos de cada bebida (`buildDrinkCopyPayload`). Não saem o `id` local, o
  histórico, as ocasiões, as preferências, o e-mail nem o nome da Conta Google (asserção em
  `tests/drink-copies.test.cjs`).
- `expiresAt` é `Timestamp` (agora + 24h), como em `shares`: comparar número com
  `request.time` geraria erro e negaria tudo.
- `handled` mora na área exclusiva do dono (regra da 0022, inalterada): importar num aparelho
  esconde a cópia nos outros aparelhos da mesma conta. Só guarda o que ainda pode reaparecer.
- O ponteiro não traz a contagem de bebidas, então o cartão de receber mostra horário e
  validade; a contagem aparece na prévia ("3 bebidas na cópia").

## Regras do Firestore

- `pairings` update aceita a chave `drinkCopies`, só a própria (`get('drinkCopies', {})`, pelo
  mesmo motivo de `invites`: pareamentos antigos não têm o campo).
- `drinkCopies/{copyId}`:
  - `get`: quem enviou, ou quem recebe dentro do prazo;
  - `list`: só quem enviou (`where('fromUid', '==', uid)`), para limpar as vencidas;
  - `create`/`update`: em nome próprio, para outra pessoa, `copyId == me + '_' + toUid`, só os
    campos previstos, de 1 a 500 bebidas, prazo entre agora e agora + 25h (folga de relógio) e
    amizade aceita pelos dois (`acceptedPair`). `update` exige também ser quem enviou;
  - `delete`: quem enviou **ou** quem recebe. Apagar só libera espaço: não é pedido, e não
    existe escrita de quem recebe que quem enviou leia. O princípio "ninguém pede acesso"
    continua valendo.

Testes no emulador (`tests/firestore-rules.test.cjs`, seção "Cópia da lista de bebidas"), um
caso por negação. **Publicar as regras antes do app**: com as regras antigas só o recurso
novo falha (a escrita do ponteiro e da cópia são negadas), nada que já existe quebra.

## Contrato do módulo

`src/data/drink-copies.js` — fábrica com dependências injetadas; não toca `state` nem
`localStorage`.

- `buildDrinkCopyPayload(drinks)`, `readDrinkCopy(raw)` (puros), `DRINK_COPY_TTL_MS`,
  `DRINK_COPY_FORMAT_VERSION`.
- `createDrinkCopies({ app, uid, importModule, onIncomingChange, onStatusChange, now, schedule, cancel, ackWaitMs })`:
  - `send({ toUids, drinks })` → `{ sentAtMs, state: "ack" | "queued", failed }`. Um lote por
    amigo; sem confirmação do servidor em 6s volta `"queued"` (a escrita segue na fila do SDK);
  - `setPairings(lista)` — calcula as recebidas pendentes, limpa os meus ponteiros vencidos e
    apaga a cópia de quem deixou de ser amigo;
  - `sweep()` — chamado a cada minuto pelo app;
  - `fetchIncoming(fromUid)` → `{ ok: true, drinks, expiresAtMs }` ou
    `{ ok: false, reason: "gone" | "offline" }`. Negada, vencida e inexistente são o mesmo
    `"gone"` (a regra lê `resource.data`, então o SDK rejeita; lição da v2.3.2 da 0023);
  - `markHandled(fromUid, sentAtMs)`, `deleteAllMyData()`, `start()`, `stop()`.

`share-writer.js` `pairingsOf()` expõe `drinkCopyFromOther` e `drinkCopyFromMe`.
`share-ui.js` recebe três pontes do app (`getDrinkCopies`, `getDrinks`, `openDrinkCopyPreview`)
e expõe `setIncomingDrinkCopies`, `openDrinkCopyDialog`, `closeDrinkCopyDialog`.

## Interface

- **Sobre o amigo** (o "i" do detalhe; desde a v2.31.1): logo abaixo de "Amigos desde", no
  mesmo bloco, sempre, "Copiar bebidas para Bia" ("Envia uma cópia da sua lista atual"; depois
  de enviar, o horário e a validade). Abaixo do bloco, só enquanto vale, o cartão "Receber
  cópia de bebidas de Bia · Enviada hoje às 14:30 · vale até amanhã às 14:30" e um
  "Dispensar" com confirmação. Sem confirmação ao enviar: o amigo ainda revisa e aceita.
- **Detalhe do amigo** (Vendo/Compartilhando): não mostra a troca de bebidas; o "i" ganha um
  ponto dourado enquanto houver cópia esperando, e o `aria-label` diz isso.
- **Grade de amigos:** um copo no canto inferior esquerdo do avatar de quem enviou (as setas
  ficam nos cantos da direita), e o texto no `aria-label`. O ponto de Amigos na Home acende.
- **Configurações › Backup e conta › Exportar e importar:** terceira linha "Copiar bebidas para
  amigos", visível só com amigo; abre a grade de seleção, com a marca "já tem uma cópia das
  suas bebidas" em quem tem uma válida.
- **Prévia:** com `source: "friend"`, título "Enviadas por Bia", "N bebidas na cópia" e o aviso
  sempre visível de que os intervalos vieram de outra pessoa e não são recomendação de consumo.

## Casos de borda preservados

- Sem login, nada muda: sem módulo, sem linha em Configurações, nada de rede.
- Exportar/importar arquivo e backup/restauração continuam iguais e separados.
- Abrir a prévia não grava nada; importar preserva o histórico (teste de navegador compara os
  registros antes e depois).
- Sair da conta só para o módulo: uma cópia enviada não é dado ao vivo e segue até vencer.
- Gravar bebidas avisa o escritor de compartilhamento (`scheduleSharePush`), como antes.

## Desvios do plano

- `removeFor(otherUid)` chamado por `removePairing` virou a comparação de pareamentos em
  `setPairings`: cobre também a amizade desfeita pelo outro lado com o app aberto, sem acoplar
  `share-writer` ao módulo novo. Com o app fechado, a cópia segue ilegível depois de 24h.
- O cartão de receber não mostra a contagem de bebidas (o ponteiro só tem o horário).

## Plano de teste

- `npm run test:rules` (emulador; 62 casos, 11 novos).
- `tests/drink-copies.test.cjs` (minimização, envio, fila, falha parcial, `handled`,
  vencimento, leitura negada/vencida/offline, limpeza, amizade desfeita, apagar na nuvem).
- `tests/sharing-ui-browser.test.cjs`: cópia recebida → selo e ponto da Home → detalhe sem a
  troca, com ponto no "i" → "Sobre o amigo" (copiar logo abaixo de "Amigos desde", cartão de
  receber) → prévia sem gravar → importar preservando histórico → `markHandled` e pontos
  apagados; enviar por "Sobre o amigo" e por Configurações para dois amigos; sem amigos, a
  linha de Configurações não aparece.
- `node --input-type=module --check < app.js`, `node --check sw.js`, `npm test`.
- Manual com duas contas, que **falta fazer**: enviar e receber, Adicionar e Substituir,
  reenviar, Dispensar, desfazer amizade com cópia pendente, passar das 24h, "Apagar dados na
  nuvem", modo avião.
- **Tutoriais:** `amigos` ganhou dois passos ("Sobre o amigo" com a cópia recebida e a de
  enviar; o "i" e Receber até a prévia) e o seed `demoCopiaBebidas`; `backup-e-bebidas` foi
  regenerado sem mudança de roteiro (a linha nova só aparece com amigos, e o aviso novo da
  prévia só para cópia de amigo).

## Nota pós-implementação (v2.31.1) — a troca mora em "Sobre o amigo"

Na v2.31.0 o cartão de receber ficava no topo do detalhe do amigo e "Copiar bebidas para Bia"
no fim dele, junto das abas Vendo/Compartilhando. O usuário esperava as duas coisas na tela
"Sobre o amigo" (o "i" ao lado do fechar), logo abaixo de "Amigos desde": copiar sempre
visível, receber quando houver. Mudou só o lugar:

- "Copiar bebidas para Bia" virou a segunda linha do bloco de "Amigos desde"
  (`renderDetailDefault` + `renderDrinkCopySend`), só entre amigos aceitos pelos dois, que é
  o que as regras exigem; o cartão de receber vai em `#friend-info-drinks-in`, logo abaixo.
- Como quem recebe agora precisa abrir o "i", ele ganha um ponto dourado
  (`#shared-detail-info-dot`) enquanto houver cópia daquela pessoa. Sem isso o copo no
  avatar levaria a uma tela sem nada sobre a cópia.
- "Enviando…" e "Buscando…" passam a redesenhar "Sobre o amigo" (`atualizarSobreOAmigo`).

Sem mudança de regras, de dados nem de políticas (o texto já falava em "detalhe do amigo").

## Nota pós-implementação (v2.32.0) — escolher quais bebidas

O usuário perguntou se dava para escolher quais bebidas importar (do arquivo e da cópia de um
amigo) e pediu também a escolha do lado de quem envia, sempre com **todas marcadas por padrão**.

- **Prévia de importação** (vale para o arquivo e para a cópia, que usam a mesma prévia): as
  pílulas viram etiquetas de marcar (`src/ui/drink-picker.js`, `aria-pressed`), e só as
  marcadas entram (`getPickedImportDrinks`). Ao **adicionar**, a bebida que você já tem fica
  riscada e desabilitada, como antes (ela ficaria de fora de qualquer jeito); ao **substituir**,
  ela volta a ser tocável, e marcada. Nada marcado desliga o botão ("Marque ao menos uma
  bebida"). "Substituir pela lista (N)" virou "Substituir por N bebidas". A seleção é por
  índice, guardada em `state.pendingDrinkImport.selected`, e some ao fechar a prévia.
- **Quem envia:** o diálogo ganha "Quais bebidas" acima de "Para quem"; só as marcadas vão
  para `send({ toUids, drinks })`. A linha "Copiar bebidas para Bia" em "Sobre o amigo" deixa
  de enviar na hora ("Sem confirmação ao enviar", acima, não vale mais): abre o mesmo diálogo
  com a Bia escolhida e sem a grade. Se a amizade some com o diálogo aberto, ele fecha.
- "Marcar todas / Desmarcar todas" aparece com duas ou mais etiquetas livres.

Sem mudança no payload (`buildDrinkCopyPayload` recebe só as marcadas), nas regras (1 a 500
bebidas continua valendo), no arquivo de bebidas nem em `DATA_VERSION`. O texto das Políticas
("uma cópia da sua lista de bebidas como está naquele momento") ficou como estava — enviar
menos bebidas não é dado novo; ajustar a redação fica a critério do usuário.

## Em aberto

- Política de TTL do Firestore no campo `expiresAt` apagaria as cópias mesmo que quem enviou
  nunca mais abra o app. Falta confirmar disponibilidade e custo no plano Spark; se valer, serve
  também para `pairingCodes` e `shares`.
