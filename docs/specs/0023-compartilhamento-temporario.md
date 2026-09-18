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

- QR (ler pela câmera não funciona no iOS; exibir exigiria um codificador próprio).
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

**Pendente nesta revisão**: código implementado e testado (unitário + regras
no emulador), mas as regras de `firestore.rules` ainda não foram publicadas no
projeto real, e nada foi enviado ao repositório remoto. Até isso acontecer,
esta funcionalidade não existe fora do ambiente local.
