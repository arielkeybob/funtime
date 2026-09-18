# 0023 — Compartilhar o consumo de um evento com pessoa de confiança

Status: implementada

## Contexto

A spec 0022 trouxe contas (Firebase Auth) e sincronização (Firestore). Isso destravou
o item de `ROADMAP.md:49-67`, "Compartilhamento temporário com pessoas autorizadas",
cujos dois primeiros pré-requisitos eram exatamente "contas e autenticação" e "backend
e sincronização". A 0022 registrou explicitamente que compartilhamento entre pessoas
ficava fora dela e que ela "não cruza dados entre usuários" — esta spec é quem cruza.

Pedido: durante um evento, A quer que B (cônjuge, amigo) acompanhe seu consumo ao
vivo. Restrições firmes do usuário: **nunca pesquisável por nome ou e-mail** (o
pareamento é por código que A mostra e B digita); **os dois lados aceitam**; e **estar
pareado não mostra nada** — compartilhar é ação separada, evento a evento, pessoa a
pessoa.

Decisões tomadas junto ao usuário: atualização **ao vivo**; acesso expira **24h após o
fim do evento**; **só código digitável** na v1 (ler QR pela câmera não existe no Safari
iOS — mesmo motivo que derrubou a File System Access API na 0022); **apenas histórico
completo**, sem modo "só o total"; e as regras de segurança passam a ser **código
versionado e testado**.

**Enquadramento de segurança.** Este é um app de consumo de álcool e a funcionalidade
toca dinâmicas de casal e família. Ela é **sempre iniciada por quem é dono do dado**.
Não existe caminho para B *pedir* acesso — estruturalmente, B não tem permissão de
escrita em nenhum documento que A leia como pedido. Isso não é detalhe de interface: é
invariante mantido pelas regras, e deve continuar sendo.

## Decisão

Quando A compartilha o evento X com B, o aparelho de A mantém **uma cópia** das doses
daquele evento em `shares/{shareId}` — um documento por par (dono, convidado). B lê
esse documento. B **nunca** recebe permissão dentro da árvore `users/{A}`.

Três propriedades decidem por essa forma, e não por permissão cruzada:

1. **Revogação atômica.** Revogar é um `deleteDoc`; a cópia some inteira. Um documento
   por dose seria mais barato e sem limite de tamanho, mas transformaria a revogação
   num lote de N exclusões que pode falhar pela metade — A acreditando que revogou
   enquanto parte dos registros sobrevive. É o pior modo de falha possível aqui.
2. **Minimização.** Só as doses daquela ocasião saem. Como cada dose já carrega
   `drinkName`/`drinkIcon` embutidos (ver `normalizeData`, `app.js`), B renderiza o
   histórico **sem receber o cadastro de bebidas de A**.
3. **Prazo cobrado pelo servidor.** A regra de leitura exige
   `expiresAt > request.time`, no relógio do servidor.

### Correções ao desenho ingênuo

- **Um documento por convidado, não `viewerUids: [...]`.** Com lista, B precisaria
  *procurar* o share por consulta — e regras são avaliadas contra a **consulta**, não
  contra os documentos retornados. A cláusula de vencimento não é exprimível como
  restrição de consulta: ou a consulta falha, ou o vencimento sai da regra e vira
  decorativo. Com um documento por convidado, B só faz `get` por id, e o vencimento é
  verificado contra o documento real. B **não tem `list`**.
- **B descobre o `shareId` por ponteiro no pareamento.** Adivinhar o id e escutar
  daria `permission-denied` enquanto A não compartilha — e **um `onSnapshot` negado
  encerra o listener de vez**, então o listener estaria morto quando A começasse a
  compartilhar. A publica `sharing[ownerUid] = shareId | null` no pareamento (que B
  sempre lê) e B só conecta quando o ponteiro aparece.
- **Apelido digitado, nunca o `displayName` do Google.** Hoje e-mail e nome vivem em
  `users/{uid}/meta/account`, legível só pelo dono, e `policies.html` promete isso.
  Copiar o nome do Google para um documento legível por outra pessoa quebraria a
  promessa sem ganho: B está ao lado de A segurando um código.
- **Número de conferência.** Quatro dígitos derivados do `pairId` via SHA-256, iguais
  nos dois aparelhos, guardados em lugar nenhum. Sem ele, quem adivinhar um código
  ativo pode mandar pedido com o apelido "Bia" enquanto A espera a Bia — e A aceita a
  pessoa errada.

## Modelo de dados

```
pairingCodes/{code}   { ownerUid, createdAt, expiresAt }      // 6 caracteres, 5 min
pairings/{pairId}     { uids, createdBy, viaCode, acceptedBy, aliases, sharing }
shares/{shareId}      { ownerUid, viewerUid, ownerAlias, occasion, events,
                        totals, eventCount, truncated, lastEventAt, updatedAt, expiresAt }
```

`pairId` = `${uidMenor}_${uidMaior}` — um par, um documento, sem duplicata. O estado do
pareamento é **derivado** (`acceptedBy.size() === 2`), nunca armazenado, para não
existir campo disputado entre os dois escritores.

`expiresAt` **precisa** ser `Timestamp`, não número: a regra compara com `request.time`,
e comparar Timestamp com número gera erro que nega tudo — falha fechada, mas quebraria
a funcionalidade em silêncio.

**Nunca sai do aparelho de A** (vira asserção de teste): `drinkId`, `occasionId`, o
cadastro de bebidas, outras ocasiões, preferências, e-mail, nome da Conta Google,
`SECURITY_STORAGE_KEY`, `SECURITY_SESSION_KEY` e o aceite das políticas.

**Limite de 1 MiB:** inalcançável na prática (uma dose ocupa ~180 bytes e a ocasião é
encerrada à força em 48h), mas não pode falhar calado — corta em 1200 doses, envia as
mais recentes, marca `truncated: true` com `eventCount` verdadeiro, e a tela de B avisa.

## Regras de segurança

Passam a ser **código versionado**: `firestore.rules`, `firebase.json` e `.firebaserc`
entram no repositório, e `firebase-tools` entra como **dependência de desenvolvimento**
— como o Playwright já é. O app publicado continua HTML/CSS/JS puro, sem build e sem
backend; `package.json` já documenta essa separação. Mudança de escopo autorizada pelo
usuário, justificada porque as regras vão de 3 para ~90 linhas e passam a ser a única
coisa separando os dados de duas pessoas.

Garantias que as regras sustentam, cada uma virando um teste no emulador:

| Garantia | Mecanismo |
|---|---|
| `users/{uid}` segue exclusiva do dono | regra da 0022, **inalterada** |
| Ler um código exige conhecê-lo; vencido é ilegível | `get` com `expiresAt > request.time` |
| Criar pareamento exige posse de código válido do outro | `validCode()` |
| Cada lado só se acrescenta a `acceptedBy` e só escreve a própria chave | `diff().affectedKeys()` |
| Compartilhar exige pareamento aceito pelos dois | `acceptedPair()` |
| Convidado lê só o share dele, e só no prazo | `viewerUid == me() && expiresAt > request.time`, sem `list` |
| Só o dono escreve no share | `ownerUid == me()` |
| Prazo não pode ser esticado | teto de 96h na regra de escrita |

As regras validam **só os campos com significado de segurança**; a forma do conteúdo é
validada no cliente por `readSharePayload()`, que falha fechado — mesma divisão que a
0022 registrou.

## Contrato dos módulos

Todos em `src/`, exports nomeados, `kebab-case.js`, fábrica com dependências injetadas,
sem tocar `state`/`localStorage` direto.

- `src/data/firestore-db.js` (extração) — `SDK_BASE`, `chunk`, `loadFirestore`
  memoizado por `app`. Necessário porque `initializeFirestore` lança na segunda chamada
  para o mesmo app e agora três módulos precisam do mesmo handle.
- `src/occasions/summary.js` (extração) — `summarizeOccasionDoses(records, identify)`,
  de `occasions-ui.js:222-225`. `identify` é injetado porque B não tem cadastro de
  bebidas.
- `src/data/share-codes.js` (puro) — código, `buildPairId`, número de conferência.
- `src/data/share-payload.js` (puro) — **onde mora a minimização**; `buildSharePayload`,
  `shareExpiresAtMs`, `readSharePayload`.
- `src/data/share-writer.js` — pareamento, compartilhamento, revogação, limpeza.
- `src/data/shared-view.js` — **somente leitura**; nunca constrói `writeBatch`,
  `setDoc`, `updateDoc` ou `deleteDoc`.
- `src/sharing/share-ui.js` — diálogos, tela do convidado, indicadores.

**Compatibilidade de dados:** nada muda no `localStorage`. `DATA_VERSION` continua 11.
Os campos novos de `state` (`shares`, `sharedView`, `pendingSharedViewApply`) ficam
fora de `buildCurrentAppData()`, e é essa lista explícita que estruturalmente impede
que cheguem ao armazenamento local, a um backup ou à nuvem.

## Casos de borda preservados

- Sem login, nada muda: sem `shareWriter`, sem `sharedView`, sem interface de
  compartilhamento.
- Dado de amigo **nunca** passa por `commitToStorage`/`commitAppData` com
  `DATA_STORAGE_KEY` — a checagem dessa chave é o que roteia escrita para a nuvem.
- Snapshot chegando com a tela de PIN ativa é adiado, como `pendingSyncApply` já faz.
- **"Apagar dados na nuvem" precisa apagar também `shares` e `pairings`.** Sem isso,
  deixaria em silêncio as doses do usuário legíveis por um amigo. É o item mais fácil
  de esquecer.
- Desfazer pareamento revoga os compartilhamentos **antes** de apagar o pareamento — as
  regras não cascateiam. Ordem travada por teste.
- Sair da conta encerra compartilhamentos ativos: senão A não conseguiria mais revogar
  e B continuaria vendo uma tela congelada.
- Revogação offline diz "será encerrado assim que houver conexão" — nunca um "revogado"
  que na verdade é uma escrita na fila.
- B é online por natureza: a tela carimba a idade do dado lendo
  `snapshot.metadata.fromCache`. Uma tela parada que parece ao vivo é o modo de falha
  que esta funcionalidade não pode ter.

## Fora de escopo

- QR (adiado na v1; entrou na v2.8.0 — ver a nota pós-implementação no fim).
- Modo "só o total" — decisão do usuário por só histórico completo.
- Qualquer caminho para B pedir acesso, presença ("está vendo agora", exigiria escrita
  de B), notificar B quando A inicia um evento (vazaria atividade de A sem ato de A), e
  "sempre compartilhar com fulano" (contraria o consentimento por evento do roadmap).
- Criptografia ponta a ponta — segue no roadmap.

## Plano de teste

- **Regras, no emulador** — cada negação é um caso: B lê a árvore de A; B lê share de
  outra pessoa; B lê share vencido; B escreve num share; B lista shares ou códigos; B
  cria pareamento sem código válido; B se acrescenta ao `acceptedBy` alheio; A cria
  share com pareamento aceito por um lado só; A estica o prazo para 10 dias.
- **Privacidade (`share-payload`)** — varrer o payload serializado e assertar que
  `drinkId` e `occasionId` não aparecem; doses de três ocasiões entram, só a
  compartilhada sai; `readSharePayload` falha fechado.
- **Somente leitura (`shared-view`)** — `commits` e `gravacoes` vazios em todo o ciclo,
  no padrão de `fakeFirestore()` de `tests/firestore-sync.test.cjs`.
- **Navegador** — abrir a tela do convidado e assertar `funtime-v1-data` **byte a byte
  idêntico** (mesma forma de `tests/sync-gate-browser.test.cjs`), nada editável dentro
  de `#shared-view`, e o aviso de segurança presente.
- **Manual, duas contas em dois aparelhos** — parear e conferir os números; provar que
  parear não mostra nada; compartilhar; dose em A aparece em B em segundos; revogar e
  sumir; modo avião dos dois lados; passar do prazo e confirmar negação; "apagar dados
  na nuvem" removendo shares e pareamentos.
- `node --input-type=module --check < app.js`, `node --check sw.js`,
  `node --check occasions-ui.js`, `npm test` a cada fase.

## Nota pós-implementação

Duas correções reais encontradas na implementação, nenhuma prevista no desenho original:

- **`removePairing` não revogava compartilhamentos ativos antes de apagar o
  pareamento.** A regra de leitura de `shares/{shareId}` não depende do
  pareamento continuar existindo (só de `viewerUid` + `expiresAt`), então
  desfazer uma conexão não tirava o acesso na hora — quem foi desconectado
  continuaria vendo até o prazo natural de 24h. Contrariava a garantia de
  "revogação imediata" que esta própria spec já listava. Corrigido: revoga
  cada compartilhamento ativo com aquele uid antes de apagar o pareamento.
  Verificado que o teste quebra sem a correção.
- **Código de pareamento não era de uso único.** Válido por 5 minutos, mas
  reutilizável por qualquer pessoa dentro da janela — bastava alguém ver a
  tela ou receber o código encaminhado. Sem Cloud Functions não dá pra
  invalidar atomicamente no instante do resgate, mas o aparelho de quem gerou
  o código está sempre escutando os próprios pareamentos (`onPairingsChange`);
  como ninguém redime o próprio código, um pareamento que o dono não criou só
  pode ter nascido de alguém digitando o código dele — por eliminação, não por
  o documento dizer isso. Ao ver isso, o próprio aparelho apaga o código.
  Fecha a janela em segundos (tempo de propagação do `onSnapshot`) em vez dos
  5 minutos inteiros; não é atômico, mas é o que dá para fazer no plano
  gratuito, e reduz a janela real em duas ordens de grandeza.

Uma mudança de desenho, pedida pelo usuário ao revisar a experiência para
várias pessoas (mais de 10) de um lado ou de outro:

- O diálogo de compartilhar um evento deixou de ser uma lista vertical com um
  botão "Compartilhar"/"Parar" por pessoa e virou uma grade de avatares
  (inicial do apelido, ordem alfabética) com seleção em lote — toca para
  marcar quem vai ver, um botão "Compartilhar" no fim aplica a diferença de
  uma vez. Abrir o diálogo já mostra marcado quem já está vendo. Um "Parar com
  todos" encerra tudo daquele evento numa ação só.
- A tela de quem recebe deixou de mostrar um cartão cheio (período, totais,
  histórico inteiro) empilhado por pessoa, e virou duas grades compactas —
  "Pessoas conectadas" (informativa) e "Compartilhando com você" (toca para
  abrir o detalhe num diálogo). O aviso obrigatório de segurança se moveu do
  topo da página (onde não fazia sentido, a grade não mostra consumo nenhum)
  para dentro do diálogo de detalhe, que é onde o consumo de verdade aparece —
  mais fiel ao "dentro da tela do convidado" original do que a primeira versão.

O aceite das políticas (1.0.4 → 1.0.5) foi dispensado a pedido explícito do
usuário, apesar de esta ser, pelo critério já registrado em
`feedback_politicas_aceite` (memória), uma mudança material — não uma de
forma. Ver comentário em `policies.js` junto de `TERMS_VERSIONS_STILL_VALID`.

**Publicado (v2.3.0)**: `firestore.rules` publicadas no projeto real e
verificadas contra acesso sem autenticação nas três coleções novas; código
enviado ao repositório remoto (`funtime/main`).

## Nota pós-implementação (v2.3.1)

Dois ajustes pedidos pelo usuário após usar a versão publicada de verdade —
não achados durante a implementação original, mas exatamente o tipo de coisa
que só aparece no uso real:

- **Apelido por pareamento, não fixo.** O apelido era digitado a cada conexão
  nova e ficava só dentro daquele documento — conectar com duas pessoas podia
  resultar em dois nomes diferentes para a mesma pessoa. Corrigido: o valor
  canônico agora vive em `users/{uid}/meta/account` (área já exclusiva do
  dono, nenhuma regra nova precisa disso), pré-preenchido ao abrir o diálogo
  de conectar. Mudá-lo propaga, num lote, para `aliases.{uid}` de todo
  pareamento existente — a mesma mudança que `removePairing` já fazia para
  revogar shares em lote, aplicada aqui para atualizar em vez de apagar.
- **Não ficava claro que dá para gerar vários códigos.** A capacidade sempre
  existiu — cada clique em "Gerar código" já criava um documento novo e
  independente, sem cancelar o anterior — mas nada na tela comunicava isso.
  Texto explicativo adicionado; nenhuma mudança de comportamento.

Nenhuma mudança nas regras de segurança: as escritas novas (`setDoc` com
merge em `meta/account`, `update` em `aliases.{uid}` de pareamentos
existentes) já eram permitidas pela regra publicada em v2.3.0.

## Nota pós-implementação (v2.3.2) — bug crítico em uso real

Relatado pelo usuário testando com duas contas reais pela primeira vez:
conectar sempre falhava com "Não foi possível conectar agora". Nenhum teste
unitário pegou isso (o Firestore falso dos testes resolvia `getDoc` de um
documento inexistente com `exists()==false`, nunca lançando), e os testes de
regra também não — eles testam se a regra *nega* corretamente, não como o SDK
do cliente reage a essa negação.

**Causa raiz, confirmada contra o emulador antes de corrigir**: as regras de
`pairingCodes` e `pairings` leem `resource.data` (`expiresAt`, `uids`) para
decidir se deixam ler. Quando o documento não existe, `resource` é nulo na
avaliação da regra — acessar `.data` nessas condições é um erro de avaliação,
que o Firestore trata como negação. O cliente recebe `permission-denied` e
`getDoc()` **rejeita a promessa**, não resolve com um retrato vazio. Testado
diretamente: `getDoc` num `pairingCodes/{código}` ou `pairings/{par}` que
nunca existiu lança; o mesmo caminho sob `users/{uid}/**` (regra que não olha
o conteúdo) resolve normalmente com `exists()==false`.

`redeemPairingCode` tinha duas leituras dessa forma: o código em si, e —
mais grave — a checagem de "esse pareamento já existe?", que na primeira
conexão entre duas pessoas nunca existe. Ou seja, **toda primeira conexão**
caía nessa exceção não tratada, subia até `usarCodigo()` e virava a mensagem
genérica. Corrigido envolvendo as duas leituras em try/catch, tratando a
negação como "não encontrado"/"ainda não existe" (comportamento correto de
qualquer forma — código inexistente e vencido já deviam ser indistinguíveis
para quem tenta usar um). O Firestore falso dos testes de `share-writer.js`
foi corrigido para lançar nesse mesmo cenário (qualquer caminho fora de
`users/` que não esteja pré-semeado), tornando os testes existentes capazes
de pegar isso — confirmado revertendo cada correção isoladamente e vendo os
testes já existentes quebrarem, sem precisar escrever nenhum teste novo.

Corrigido junto, a partir de feedback do mesmo teste real: o campo de código
tinha `maxlength` maior que o código formatado, e nada formatava o traço
automaticamente — daí a dúvida relatada de "precisa do traço?". Ganhou
formatação ao vivo (`liveFormatPairingCode`) e o `maxlength` foi ajustado
para bater exatamente com o formato exibido.

## Nota pós-implementação (v2.4.0) — conexão em uma etapa só

Depois que a correção da v2.3.2 fez o pareamento funcionar de verdade pela
primeira vez, o usuário testou de novo com as duas contas reais e mandou uma
captura de tela: quem digitou o código via a tela "É mesmo essa pessoa?"
pedindo para conferir um número de 4 dígitos antes de aceitar — mas do lado
de quem gerou o código, nada aparecia automaticamente; seria preciso entrar
em Configurações e achar um botão "Conferir e aceitar" escondido ali. Nas
palavras do usuário: *"Acho que deveria simplificar muito essa conexão aí.
Tem muitos passos, muitos checks para um app de estudo e uso pessoal e ainda
mais para usuários que talvez possam estar embriagados no momento da
tentativa de conexão, visto que é um app de doses de bebida."*

Apresentadas três opções de simplificação, o usuário escolheu a mais radical:
conectar na hora, sem nenhuma segunda tela em nenhum dos dois aparelhos.
Mostrar o código já é o consentimento de quem gera; digitá-lo é o da outra
pessoa. Removido por inteiro:

- O diálogo de confirmação (`#pairing-confirm-dialog`) e as funções
  `abrirConfirmacao`/`aceitarConfirmacao` em `share-ui.js`.
- `pairingConfirmationCode` (o número de 4 dígitos derivado do `pairId` por
  SHA-256) em `share-codes.js`, agora sem nenhum lugar que o use.
- O botão "Conferir e aceitar" na lista de pessoas conectadas.

**Mudança nas regras do Firestore.** Antes, `pairings/{pairId}` podia nascer
com `acceptedBy` contendo só quem criou o documento (quem digitou o código);
um segundo `update` de quem gerou o código completava o aceite. Sem essa
segunda etapa, a regra de criação passou a exigir `acceptedBy.size() == 2` e
`acceptedBy.hasAll(uids)` — um pareamento só pode nascer já aceito pelos
dois lados, nunca por um só. **Esta mudança precisa ser publicada
(`firebase deploy --only firestore:rules`) antes de funcionar em produção**;
sem publicar, `redeemPairingCode` passa a ser negado pela regra antiga.

**Problema derivado, resolvido com auto-preenchimento.** Sem a segunda etapa
de aceite, o apelido de quem gerou o código nunca mais teria como chegar ao
documento de pareamento — antes, era exatamente ao aceitar que o aparelho de
quem gerou escrevia o próprio apelido em `aliases.{uid}`. Como quem digitou o
código não tem permissão para ler `users/{outroUid}/meta/account` (regra da
spec 0022, inalterada), a única conta que pode preencher aquele campo é a
própria dona do apelido. Solução: o aparelho de quem gerou o código já estava
escutando os próprios pareamentos (`onPairingsChange`, reaproveitado da
invalidação de código de uso único da v2.3.2); ganhou mais um passo nesse
mesmo listener (`seedMissingAlias`) que, ao notar um pareamento onde falta o
próprio apelido, escreve `aliases.{uid}` sozinho — sem pedir nada à pessoa,
sem diálogo novo. Coberto por três testes novos em `share-writer.test.cjs`,
verificados por mutação (reverter a correção e confirmar que cada teste
quebra).

`estadoDe(par)` manteve os três ramos que já tinha (aceito pelos dois,
aceito só por mim, aceito só pelo outro) como um fallback inofensivo para
pareamentos antigos ou anômalos — mesmo que a criação agora só produza o
primeiro caso.

**Pareamento legado sem caminho de conclusão.** O próprio teste do usuário
com a esposa, feito antes desta correção, deixou um documento real de
pareamento no Firestore de produção com `acceptedBy` contendo só o uid dele
(quem digitou o código) — o aceite da esposa nunca chegou a acontecer, e a
tela que faria isso deixou de existir. Não há mais um "Conferir e aceitar"
para completá-lo. Caminho de recuperação: apagar esse pareamento específico
pela tela de Configurações (o botão "Desfazer conexão" continua disponível
independente do estado de aceite) e gerar um código novo — o próximo
pareamento nasce direto no formato aceito pelos dois.

O aceite das políticas (1.0.5 → 1.0.6) foi dispensado a pedido explícito do
usuário, apesar de esta ser, pelo critério já registrado em
`feedback_politicas_aceite` (memória), uma mudança material no modelo de
consentimento — não uma de forma. Ver comentário em `policies.js` junto de
`TERMS_VERSIONS_STILL_VALID`.

## Nota pós-implementação (v2.5.0) — uma lista só, com indicadores

Depois de testar a v2.4.0 com as duas contas reais e aprovar o funcionamento,
o usuário achou a tela "Acompanhando" (renomeada aqui para "Amigos")
desnecessariamente complexa: duas listas separadas — "Pessoas conectadas" e
"Compartilhando com você" — e nenhuma visão de "com quem eu estou
compartilhando" em lugar nenhum. Pedido: uma lista só, com até dois
indicadores pequenos por pessoa (bolinha no canto do avatar, não um anel em
volta do círculo inteiro), e um detalhe que se adapta ao estado ao tocar.

**Terminologia.** "Conectar"/"conexão"/"pessoas conectadas" viram
"amigo"/"adicionar amigo"/"amigos" em todo texto visível (cartão de
Configurações, diálogo de parear, tela de amigos, toasts, confirmações).
Decisão explícita de não tocar em `policies.html`/`policies.js`: o texto
legal descreve o mecanismo (código, prazo, aceite), que não muda de
substância com o apelido da função — mudar ali reabriria a pergunta sobre
forçar novo aceite (já feita duas vezes nesta spec) sem necessidade.

**Uma grade só, dois indicadores independentes.** `renderSharedPairings()` e
`renderSharedEntries()` (duas funções, dois grids) viram `renderFriends()`
(uma função, um grid `#friends-grid`), com dois booleanos calculados por
pessoa: `vendo` (ela compartilha um evento com você agora — computado batendo
`otherUid` contra os `sharedEntries` recebidos) e `compartilhando` (você
compartilha com ela agora — batendo contra os `shares` ativos que você
está enviando). Os dois podem ser verdadeiros ao mesmo tempo. O anel
`.share-person.is-live` em volta do avatar inteiro foi substituído por duas
bolinhas absolutamente posicionadas dentro do avatar (que ganhou
`position: relative`): verde no canto inferior direito para `vendo`, azul
(`--info`, cor nova) no canto superior direito para `compartilhando`. Como o
indicador visual sozinho não é acessível, o botão de cada pessoa leva um
`aria-label` descrevendo o estado por extenso.

**Diálogo de detalhe adaptável.** O mesmo `#shared-detail-dialog` de antes
passa a ter até duas abas (`Vendo` / `Compartilhando`, reaproveitando o
padrão visual de `.agenda-tabs` sob uma classe própria `.shared-detail-tabs`
— usar a mesma classe quebrava um teste de navegador não relacionado, que
lista `.agenda-tabs button` da página inteira sem escopo), escondidas quando
só um lado se aplica. Corpo mostrado, por caso:
- nenhum ativo: "Amigos desde {data}" (ou "Vocês são amigos." sem
  `createdAt`, caso legado) — ou o `estadoDe(par)` de fallback se o
  pareamento nunca chegou a ser aceito pelos dois lados;
- só `vendo`: o mesmo conteúdo que já existia (frescor, período, totais,
  lista de doses, aviso de segurança);
- só `compartilhando`: cada compartilhamento ativo com essa pessoa, nome da
  ocasião e um botão "Parar de compartilhar" por linha;
- os dois: abas alternando entre os dois corpos acima, "Vendo" como padrão
  ao abrir.

Um botão "Desfazer amizade" fica sempre visível no rodapé do diálogo,
qualquer que seja o estado — chama o mesmo `removePairing` de sempre, que já
revoga os compartilhamentos ativos antes de desfazer.

**Dois campos novos, sem mudança de regra.** `pairingsOf()` passou a expor
`createdAt` (convertido de `Timestamp` para milissegundos) — necessário para
"amigos desde X" e que não existia antes porque nada precisava dele.
`startShare()` e `rehydrateShares()` passaram a guardar também
`occasionName` em `activeShares` — necessário para nomear cada
compartilhamento ativo no painel "Compartilhando", e disponível de graça
porque o nome da ocasião já é gravado no próprio documento `shares/{id}`
desde a v2.3.0 (`buildSharePayload`). Nenhum dos dois é um dado novo indo
para o Firestore nem exige mudança em `firestore.rules` — são campos já
existentes, só passando a ser lidos no mapeamento do cliente. Sem
necessidade de novo deploy de regras.

**Fora do escopo, por decisão e não por pergunta:** "prorrogar" um
compartilhamento (citado pelo usuário como exemplo, não como requisito
firme) não tem mecanismo hoje — o prazo é recalculado sozinho enquanto o
evento está aberto — e não foi criado agora; a lista simples de amigos
dentro de Configurações (`#sharing-people`) continua existindo como estava,
só com o texto renomeado, como forma de gerenciar sem precisar ter nada
compartilhado ativo.

Verificado com `npm test` (308 passando) e com um script Playwright
descartável que montou uma segunda instância de `createShareUI` sobre o DOM
real da página (dados falsos, sem precisar de conta/Firebase de verdade) para
conferir visualmente as bolinhas, as abas e os três corpos de detalhe antes
de publicar — script e captura de tela apagados depois, não fazem parte do
repositório.

## Nota pós-implementação (v2.6.0) — quatro ajustes de uso real

Depois de publicar e testar a v2.5.0, o usuário pediu mais quatro mudanças
na mesma funcionalidade, todas de interface sobre dados que já existiam —
nenhuma mudança em `firestore.rules` nem em políticas.

**1. Compartilhar já ao criar o evento.** Antes só dava para escolher com
quem compartilhar depois de o evento já existir. Perguntado se a escolha
deveria ficar embutida no próprio formulário "Novo evento" ou abrir o
diálogo já existente logo depois de criar, o usuário escolheu a primeira —
menos telas. `renderShareOccasionPeople()` (o grid clicável do diálogo
"Compartilhar evento") foi dividida em duas: um `renderFriendPicker()`
comum (grid + alternar seleção num `Set` + estado vazio) e o wrapper fino
que já existia, reaproveitados agora também por um `renderOccasionSharePicker()`
novo, ligado ao formulário de criação por uma ponte em `app.js`
(`globalThis.renderOccasionSharePicker`), no mesmo padrão que
`openShareOccasionDialog` já usava — `occasions-ui.js` é um script clássico
separado do módulo `share-ui.js` e só se comunica por essas pontes.
`editorVisibility()` (occasions-ui.js) esconde o campo novo sempre que
`current` (editando) ou `planned` (agendado) — compartilhar exige o evento
já ter começado, e só a opção "Iniciar agora" satisfaz isso. No `submit`,
depois de `commitOccasions(...)` criar o evento com `id` real, uma chamada a
`startOccasionShares` (nova ponte, chama `shareWriter.startShare` para cada
uid selecionado — sem "diferença" a calcular, já que o evento acabou de
nascer sem share nenhum) inicia o compartilhamento com quem foi marcado.

**2. Ícone no lugar do cartão da Home.** O cartão de largura total
"👀 Fulano está compartilhando ›" virou um botão pequeno no cabeçalho da
Home. Achado durante a exploração: `.home-header-actions`, o contêiner flex
alinhado à direita que esse ícone precisava, **já existia no CSS**
(`styles.css`) desde um redesenho anterior, sem nenhum elemento do HTML
atual usando — só faltava o `<div class="home-header-actions">` com o botão
dentro. A bolinha verde reaproveita `.share-status-dot--incoming`, a mesma
classe já usada na grade de amigos. A visibilidade do ícone em si deixou de
depender de `pairings.length` (só aparecia com pelo menos um amigo) e passou
a acompanhar `sharingCard.hidden` (login) em `app.js` — agora ele também
serve de atalho para "Adicionar amigo" quando ainda não há nenhum.

**3 e 4 (juntas).** "Desfazer amizade" incomodava por ficar ao lado de
"Fechar" no rodapé do diálogo de detalhe — perto o bastante das abas
Vendo/Compartilhando para passar a impressão de que desfazia o
compartilhamento em vista, não a amizade inteira. E as abas só apareciam
quando os dois lados (vendo e compartilhando) estavam ativos ao mesmo
tempo; nos outros casos o corpo pulava direto para um dos painéis ou para
"amigos desde X" — um terceiro modo escondido. As duas coisas se resolveram
juntas: as abas passaram a ficar **sempre visíveis** (cada painel já sabia
virar "vazio" sozinho, ou ganhou esse caso —`renderVendoPanel(null)` agora
retorna "Ela não está compartilhando nada com você agora."), e o antigo
terceiro modo ("amigos desde X") deixou de existir dentro do diálogo
principal: virou o conteúdo de uma tela nova, "Sobre o amigo"
(`#friend-info-dialog`), aberta por um ícone "i" no cabeçalho do diálogo de
detalhe. É lá que "Desfazer amizade" mora agora, com o botão
`.settings-secondary-button` (não mais `.danger-button`) — deliberadamente
menos chamativo, já que está numa tela dedicada, sem risco de ser confundido
com um botão de parar compartilhamento. O usuário já apontou essa tela como
um lugar que pode crescer com mais informações no futuro.

Verificado com `npm test` (308 passando, sem nenhuma asserção quebrada) e
com um segundo script Playwright descartável — confirmando visualmente o
ícone da Home com e sem bolinha, as duas abas sempre visíveis com suas
mensagens de vazio, a navegação até "Sobre o amigo" (com o botão antigo
ausente do diálogo principal), e o campo de compartilhar aparecendo só no
modo "Iniciar agora" do formulário de criar evento — script e capturas
apagados depois, não fazem parte do repositório. Também confirmado por
mutação: a asserção nova de "abas sempre visíveis" foi checada revertendo
temporariamente o `hidden` estático no HTML e vendo o teste
`tests/sharing-ui-browser.test.cjs` falhar, depois restaurado.

## Nota pós-implementação (v2.7.0) — "Adicionar amigo" sai de Configurações

Usando a v2.6.0, o usuário notou que o card "Compartilhar eventos" em
Configurações (`#settings-sharing-card`) tinha ficado redundante: além do
texto explicativo, ele desenhava uma **segunda** lista de amigos
(`#sharing-people`/`renderPeople()`, com nome + "Conectado" + "Desfazer
amizade" por pessoa) que já não tinha razão de existir desde o redesenho da
v2.5.0 — a grade `#friends-grid` da tela Amigos, junto com o diálogo "Sobre
o amigo" (v2.6.0), já cobre 100% do que esse card fazia. `renderPeople()`
foi removida inteira; `estadoDe()` continuou (ainda usada como fallback em
`renderDetailDefault`).

A ação de "Adicionar amigo" mudou de lugar: em vez de um botão dentro do
card de Configurações, virou um "+" depois da grade de amigos, dentro da
própria tela Amigos — reaproveitando literalmente a mesma estrutura
(`.home-add-zone`/`.home-add-button`) já usada para o "+" de adicionar
bebida na Home, sem CSS nova. Como consequência, o guard que decide se
`shareUI` é criado em `app.js` (antes `if (sharingNodes.sharingConnect)`)
precisou trocar para `if (sharingNodes.pairingDialog)` — o pareamento em si
não depende de nenhum botão específico continuar existindo, só da estrutura
do diálogo.

Junto, dois ajustes vistos direto nos prints do diálogo "Adicionar amigo":
os dois parágrafos explicativos ganharam `clean-optional`, a mesma classe
que já esconde texto de ajuda em outros diálogos quando a preferência
"interface compacta" está ativa (default `true`) — nenhum mecanismo novo,
só faltava aplicar a classe existente. E os campos "Seu apelido"/"Código
recebido", que estavam com a aparência crua do navegador porque
`<label class="settings-field">` não estiliza `input[type=text]` (só
`select`), ganharam também a classe `field` — o seletor `.field
input[type="text"]` não exige filho direto, então herdar o visual "bonito"
não pediu CSS nova, só a classe extra no `<label>`.

Por fim, o botão "Salvar" do apelido (que antes ficava sempre clicável,
mesmo sem nada para salvar) passou a nascer desabilitado, habilitar ao
editar o campo e desabilitar de novo depois de salvar com sucesso —
`apelidoSalvo` guarda o último valor conhecido e `atualizarBotaoApelido()`
compara contra o campo a cada `input`. A regra CSS nova
(`.settings-secondary-button:disabled { opacity: .45; }`) também passou a
valer para os outros botões que já usavam `disabled` com essa classe
(`#export-touch-debug`, `#clear-touch-debug`) — melhoria incidental, não
mudança de comportamento.

Verificado com `npm test` (308 passando) e um terceiro script Playwright
descartável, montando mais uma vez uma instância de `createShareUI` sobre o
DOM real com um `getShareWriter` falso: confirmou o "+" abrindo o diálogo,
o texto sumindo/aparecendo ao alternar `.clean-mode` no `<body>`, o estilo
computado do campo de apelido (fundo `#09090b`, borda, `border-radius:
12px` — igual aos outros campos do app) e o botão "Salvar"
desabilitado→habilitado→desabilitado no ciclo abrir/editar/salvar — script e
capturas apagados depois, não fazem parte do repositório.

## Nota pós-implementação (v2.8.0) — QR e envio automático

A justificativa original para não ter QR ("ler QR pela câmera não existe no Safari
iOS") estava exagerada: o que o Safari não tem é a API nativa `BarcodeDetector`. A
câmera (`getUserMedia`) funciona no iOS Safari e na PWA instalada, e uma biblioteca JS
decodifica QR a partir dos quadros do vídeo em qualquer navegador. O custo real era o
app não ter dependências de terceiros; ficou aceito, com as duas bibliotecas embutidas
em `src/vendor/` (qrcode-generator, MIT; jsQR, Apache-2.0 — ver `LICENSES.md`), no
pré-cache offline e carregadas só quando o diálogo de pareamento precisa.

Quem convida vê o QR do código; quem entra toca "Ler código com a câmera", que lê
dentro do app e conecta. O conteúdo do QR é `funtime:AB7K29` — de propósito **não** é
link: a câmera nativa do iPhone abriria o Safari, com armazenamento separado da PWA
instalada. Digitar continua como alternativa (câmera negada ou ausente) e agora conecta
sozinho ao completar 6 caracteres válidos; o botão "Adicionar amigo" do diálogo foi
removido. A câmera só liga por toque e apaga ao ler, cancelar, fechar o diálogo ou sair
do app; nenhuma imagem é gravada ou enviada, então `policies.html` não mudou.

Verificado com o round-trip gerador→leitor num teste de navegador, e com um script
descartável que injetou uma câmera falsa (canvas com o QR) para exercitar o scanner de
verdade, incluindo o fim das trilhas de vídeo. **Não validado num iPhone real** — esse é
o teste que falta, no Safari e na PWA instalada.
