# 0025 — Evento compartilhado entre amigos

Status: **em andamento** — Fase 0 (custo), regras do Firestore, módulo do cliente, campos da
ocasião e interface implementados e verificados (unitários, navegador e emulador com as regras
reais). Faltam: publicar as regras, teste em aparelhos reais, versão/cache do service worker,
documentação de usuário e o texto das políticas (decisão do usuário, numa próxima versão).

## Contexto

Dez amigos que vão à mesma festa hoje criam dez eventos iguais. O app já tem amizade por
código/QR e compartilhamento de doses por evento e por pessoa (spec 0023), mas nenhum conceito
de evento **comum**: uma ocasião (`occasions.js`) é sempre de um só dono, e nada nela diz que
outra pessoa também vai.

Pedido: o organizador cria o evento (inclusive **futuro**) e convida amigos; quem aceita não
recria nada. **Participar não significa mostrar doses** — isso continua sendo decisão separada,
por pessoa, e cada participante mantém o controle do próprio evento (encerrar, iniciar ou não,
manter o app desbloqueado).

Decisões tomadas junto ao usuário:

- **Convite direto pela nuvem, entre amigos** (não o cartão por QR sem servidor, que foi
  considerado e deixado de fora).
- **Sem limite de convidados** no produto.
- **Os participantes veem quais dos seus amigos foram convidados e quais confirmaram.**
- **Doses podem ser compartilhadas com quem não vai ao evento**: o seletor de doses lista todos
  os amigos.
- **Interface limpa**: convidar e compartilhar doses ficam atrás de uma linha clicável, nunca em
  linha. Sinalização por ícones pequenos (✉ convidado, ✔ confirmou) **abaixo** do avatar,
  afastados dele, que **somem quando o evento está em andamento**.
- **Custo primeiro**: o compartilhamento de doses já existente é otimizado antes de um evento em
  grupo multiplicá-lo.
- **Sem novo aceite das políticas nesta entrega** — o usuário atualiza o texto e decide o aceite
  numa próxima versão (ver "Políticas").

## Decisão

**Cópia com vínculo, não evento vivo.** O organizador publica uma **ficha pequena, só de leitura
para os convidados** (nome, início, fim, fuso) em `sharedEvents/{eventId}`. Quem aceita ganha uma
**ocasião local normal**, com o vínculo num campo opcional (`sharedEventId`). Depois de aceita, a
ocasião é 100% da pessoa: `autoStart`, "manter desbloqueado" (`eventUnlockOccasionId`),
encerrar, reabrir e a recuperação de 48h seguem sem mudança.

Por que não um evento vivo com vários escritores: tudo que foi pedido (aceitar ou recusar,
encerrar só para si, iniciar ou não, manter aberto) **já é propriedade de uma ocasião local**;
preserva o escritor único, "um evento ativo por pessoa" e "ninguém pede acesso". Um evento vivo
reimplementaria isso por participante e reabriria o problema de conflito de escrita.

### Três camadas independentes

| Camada | Significa | Estado |
|---|---|---|
| Amizade | "posso te oferecer coisas" | existe (0023) |
| Participar | "eu vou nesse evento" — não mostra consumo | **nova** |
| Compartilhar doses | "você vê minhas doses neste evento" | existe (0023), inalterada |

Dá para compartilhar doses com quem não foi convidado e convidar quem não vai ver dose nenhuma.
Frase fixa na tela do evento: "Estar no evento não mostra suas doses".

## Modelo de dados

```
sharedEvents/{eventId}  { hostUid, name, startAt, endAt|null, timeZone, status: 'active'|'cancelled',
                          invited: [uid], going: [uid], schemaVersion, createdAt, updatedAt, expiresAt }
pairings/{pairId}       + invites.{hostUid}: [eventId] | null        // ponteiro, como `sharing`
occasion (local)        + sharedEventId?, sharedHostUid?, shareWith?: [uid]   // opcionais
```

- **Ponteiro no pareamento** (`invites`): mesma razão do `sharing` da 0023 — o convidado só liga
  a escuta quando o ponteiro aparece. Isso vale porque **escutar um documento inexistente é
  negado e a escuta morre** (verificado, abaixo).
- **`invited`**: só o organizador escreve, **uma pessoa por escrita**, e cada convite prova
  amizade aceita pelos dois lados (`acceptedPair`). Regras não têm laço, e cada `get()` é
  limitado; por isso o convite em lote é uma sequência de escritas.
- **`going`**: cada convidado só acrescenta ou retira o **próprio** uid. O organizador nunca
  acrescenta ninguém: presença é ato de quem vai. `going` só contém quem está em `invited`, então
  retirar um convite leva a presença junto na mesma escrita.
- **Recusa não escreve nada**: quem recusa só descarta o convite localmente (guardado numa área
  exclusiva do dono). Recusa e "sem resposta" ficam indistinguíveis, para não criar pressão
  social num app de bebida.
- **Roster**: cada aparelho mapeia uid→apelido pelos próprios pareamentos. Amigos aparecem por
  nome; os demais só como "+N pessoas". O documento carrega uids de todos os convidados, mas uids
  são opacos: só têm significado para quem tem aquela pessoa como amigo.
- **Cancelar é suave** (`status: 'cancelled'`; o documento fica até vencer). Apagar derrubaria a
  escuta do convidado com `permission-denied` (verificado). A cópia local sobrevive, marcada como
  cancelada.
- **Mudança de horário ou nome**: convidados veem "atualização disponível — aplicar?". Nunca em
  silêncio: `autoStart` poderia disparar na hora errada.
- **Prazo**: `expiresAt` próprio, com teto de **365 dias** nas regras (o de `shares` é 96h e não
  serve para evento futuro). É só rede de segurança, invisível na interface. Limpeza pelo
  organizador ao abrir o app, no padrão de `sweepExpiredShares`.

### Compartilhar doses em evento futuro (interpretação a confirmar)

Ver, na tela de compartilhar doses, os ícones "do que já foi decidido na tela de convidar" — e
eles somem com o evento em andamento — só faz sentido se essa tela existir **antes** do início. Hoje
só se compartilha evento já iniciado. Então: no evento **agendado**, a escolha grava uma
**intenção** (`shareWith` na ocasião, que sincroniza só na conta do próprio dono) e, **quando o
evento começa** (manual ou `autoStart`), o app executa `startShare` para cada uid, reaproveitando
`startOccasionShares`, e limpa a intenção só depois do sucesso; falha ou offline mantém e tenta de
novo. Consentimento continua por evento e por pessoa, explícito e revogável.

## Regras de segurança (implementadas em `firestore.rules`, **ainda não publicadas**)

Cobertas por 18 testes novos em `tests/firestore-rules.test.cjs` (39 no total, verdes).
Verificado por mutação: remover o caso da lista vazia, deixar o convidado retirar a presença
alheia, ou convidar sem exigir amizade aceita — cada uma derruba o teste correspondente.

| Garantia | Mecanismo |
|---|---|
| Só o organizador cria, edita a ficha, convida, cancela e apaga | `hostUid == me()` |
| Convite exige amizade aceita pelos dois; uma pessoa por escrita | `acceptedPair()` + lista com um elemento a mais |
| Convidado só mexe na própria presença | `going.hasOnly(velho.concat([me()]))` nos dois sentidos |
| Organizador não acrescenta ninguém a `going` | `going.hasOnly(going anterior)` |
| `going ⊆ invited` | `going.hasOnly(invited)` |
| Convidado lê só enquanto o convite vale | `me() in invited && expiresAt > request.time` |
| Ninguém lista eventos alheios | `list` só para `hostUid == me()` |
| Prazo não passa de 365 dias | `validExpiry()` |
| Ponteiro `invites` é sempre do próprio lado, mesmo em pareamento antigo sem o campo | `get('invites', {})` |

### O que o emulador mostrou (não estava no desenho)

- **A fatia `lista[0:0]` de uma lista vazia é negada pelo motor de regras**, embora `[0:2]` de uma
  lista de dois funcione. Com o desenho inicial, o **primeiro convidado de qualquer evento seria
  recusado**. Resolvido tratando a lista antiga vazia à parte. Há teste dedicado.
- **`Set` não tem `toList()`** nas regras; não dá para extrair "a pessoa acrescentada" de uma
  diferença de conjuntos. O convite em lista com acréscimo ao fim, conferido por fatia, resolve.
- **Apagar o documento derruba a escuta do convidado** (`permission-denied`, sem snapshot de
  "sumiu"), e **escutar documento inexistente também é negado**. É por isso que cancelar é um
  estado e não uma exclusão, e que o ponteiro existe. Coerente com o que a 0023 já registrou.
- **Teto técnico**: sem limite encontrado nas regras até **10.000 convidados** (leitura 82 ms;
  confirmar presença 0,65 s; convidar +1 1,8 s). O limite real da plataforma é o documento de 1 MiB
  e as 40 mil entradas de índice por documento, algo na casa das dezenas de milhares de uids, muito
  acima de qualquer uso plausível. "Sem limite" é, portanto, honesto.
- **30 convidados confirmando ao mesmo tempo**: 30 de 30 gravadas (o `arrayUnion` é aplicado no
  servidor, sem perda por concorrência), em cerca de 1 s.

## Fase 0 — Custo do compartilhamento de doses (feita)

Achados em `src/data/share-writer.js`:

- `flushSharePushes` reconstruía e regravava **cada** compartilhamento ativo a cada commit do
  app, sem comparar com o que já tinha sido enviado. Preferência, ordem de bebida ou dose de outro
  evento custavam uma escrita por convidado, e uma leitura em cada aparelho que escuta.
- `rehydrateShares` gravava o `meta/shares` a cada abertura do app, mesmo sem mudança.

Correções: guardar em memória o retrato estável do último payload por compartilhamento e **pular a
escrita quando igual** (semeado, ao reabrir, a partir do documento já lido); uma escrita que falha
não conta como enviada; o bookkeeping grava só entradas novas ou alteradas. `stableJson` passou a
ser exportado de `src/data/sync-merge.js`. O `merge: true` do bookkeeping foi mantido de propósito:
ele deixa uma entrada que outro aparelho da mesma conta acabou de criar sobreviver.

**Medição no emulador**, com o `share-writer` real e as regras reais: 10 pessoas em malha completa
(90 compartilhamentos), 10 doses cada, 5 commits sem relação com o evento por pessoa.

| | Antes | Depois |
|---|---|---|
| Início (compartilhar com os outros 9) | 270 | 270 |
| Durante a festa | 1.350 | 900 |
| Fechar e reabrir o app | 100 | 0 |
| **Total de escritas** | **1.720** | **1.170** (−32%) |

As leituras de quem vê caem na mesma proporção (~1.530 → ~990; derivado de uma leitura por escrita
em cada compartilhamento, não medido com ouvintes reais).

**O que sobra é estrutural.** Das 1.170 escritas, 900 (77%) são uma escrita por dose **por amigo**
(10 pessoas × 10 doses × 9). Um documento por dono com uma lista de quem vê (`viewerUids`) as
reduziria para cerca de 100, sem mudar as leituras; as regras conseguem validar isso (uma pessoa por
escrita), mas exige migrar os compartilhamentos existentes. **Decisão do usuário: seguir com o
evento compartilhado e migrar depois, se o uso real mostrar necessidade.** Uma festa de 10 pessoas
consome cerca de 6% da cota diária de 20 mil escritas do plano gratuito (cota de memória, não
confirmada nesta sessão).

## Cliente e interface (implementados)

**Módulos.** `src/data/shared-event.js` (nuvem: organizador e convidado no mesmo módulo, porque
compartilham o documento), `src/sharing/invite-ui.js` (cartão de convites, folha de aceite, tela
de convidados), `src/sharing/friend-grid.js` (a grade de amigos, antes duplicada dentro de
`share-ui.js`, agora com as marcas), `src/sharing/share-intents.js` (execução da intenção, pura e
testada). `share-ui.js` ganhou o modo evento futuro e o modo "escolher antes de salvar".

**Reaproveitamento de custo.** O módulo **não abre escuta de pareamentos própria**: recebe a lista
que `share-writer.js` já escuta, agora com `invitesFromOther`/`invitesFromMe`. Convite pendente é
um `get` único; só as ocasiões ligadas a evento de OUTRA pessoa e ainda não encerradas são
escutadas; os meus eventos vêm de uma consulta por `hostUid`. Ficha só é regravada se mudou, e a
base é semeada do documento lido (mesma lição da Fase 0).

**Interface, do jeito pedido.** Nada em linha: o formulário e o detalhe do evento têm duas
**linhas clicáveis** (Convidados, Compartilhar doses) que abrem telas próprias; só aparecem para
quem tem amigos. Marcas ✉ (convidado) e ✔ (confirmou) **abaixo do avatar, afastadas dele**, nas
telas de convidados e de compartilhar doses; **somem com o evento em andamento**; nunca só por
cor (`aria-label`). Uma marca por pessoa: presença vale mais que convite, então ✔ substitui ✉.
O seletor de amigos que ficava dentro do formulário "Novo evento" (v2.6.0) foi removido.

**Decisões tomadas na implementação.**

- **Aceitar cria uma ocasião agendada de início manual** (`autoStart: false`), o padrão de
  qualquer agendamento. Início automático e "manter desbloqueado" se ajustam no próprio evento.
  Já em andamento, o detalhe abre com "Iniciar agora".
- **Aceitar sem "Usar eventos"** (desligado por padrão) oferece ligar, em vez de falhar calado.
- **`sharedFichaKey`**: retrato da ficha que o convidado já viu. Só uma mudança **nova** do
  organizador gera "atualização disponível"; editar o horário de propósito não a dispara para
  sempre (comparar a ficha com a ocasião local faria isso). "Atualizar" ou "Manter o meu".
- **A ausência da ocasião local não cancela nada.** Outro aparelho da mesma conta pode apenas
  não ter sincronizado. Cancelar/apagar na nuvem é sempre ato explícito (excluir ou cancelar o
  agendamento, dos dois lados).
- **Ações locais nunca esperam a rede.** Com cache persistente o SDK só resolve uma escrita
  quando o servidor confirma; esperar isso travaria "Vou", "Sair" e "Excluir" sem internet. Sair e
  excluir agem no aparelho primeiro e a nuvem em segundo plano; aceitar espera a confirmação por
  até 6 s e segue (a escrita fica na fila do SDK). Uma negação que chegue nesse prazo é respeitada.
- **Recusar não escreve no evento**: fica só numa área exclusiva da própria conta, para o
  convite não voltar. Recusa e "sem resposta" ficam indistinguíveis para o organizador.
- **Quem foi convidado só olha** e só vê os **próprios amigos** na lista; os demais viram uma
  contagem ("Mais 3 pessoas que não são suas amigas estão na lista").
- **O aviso "ir ao evento não mostra suas doses" é sempre visível** na folha do convite (não é
  `clean-optional`): é exatamente o momento do consentimento.
- **A intenção de compartilhar** (`shareWith`) vira `startShare` quando o evento começa, manual
  ou automático. Quem deixou de ser amigo é descartado; quem falhou (sem rede) **continua na
  intenção** e é tentado de novo no ciclo seguinte; quem já recebe o evento é pulado.
- **Sair da conta não apaga os eventos que organizo** (a ficha não carrega consumo); só para de
  escutá-los. **Apagar dados na nuvem** apaga os meus eventos, limpa os ponteiros e retira minha
  presença nos dos outros.
- **Backup restaurado em outra conta** deixa `sharedEventId`/`shareWith` velhos: a escuta cai
  como "indisponível" e `shareWith` de quem não é amigo é descartado ao iniciar. Não é perda de
  dado; o evento vira comum.

**Verificação.** 34 testes do módulo com Firestore em memória que aplica `arrayUnion`/`arrayRemove`;
9 testes do módulo **real contra o emulador com as regras reais** (`tests/shared-event-emulator.test.cjs`,
no `npm run test:rules`), que existem para não repetir o descompasso da v2.3.2 (fake que não sabe o
que as regras negam); 7 da execução da intenção; 9 de navegador na interface. Verificado por
mutação: ordem documento→ponteiro, checagem de organizador do ponteiro e não regravar ficha igual.
Conferência visual das telas em 390×844.

## Reversões conscientes da spec 0023 ("Fora de escopo")

O convidado passa a **escrever** (`going`) e há aviso de convite. RSVP é resposta deliberada, não
presença ("está vendo agora"); convite é ato explícito do organizador, então o aviso não vaza
atividade dele. O invariante central continua de pé: **não existe caminho para alguém pedir acesso
às doses de outra pessoa**.

## Políticas

**Não** se sobe `TERMS_VERSION` nem se mexe em `TERMS_VERSIONS_STILL_VALID` nesta entrega, por
decisão do usuário, que atualizará o texto e decidirá o aceite numa próxima versão. Fica registrado
que a seção 9 de `policies.html` ainda descreve só o compartilhamento de doses, enquanto o convite
passa a guardar no servidor a ficha do evento e os uids dos participantes, com a participação
visível a amigos.

## Casos de borda

- Sem login, nada muda: sem convite, sem ponteiro, sem interface.
- "Usar eventos" desligado (padrão do app): aceitar um convite oferece ligar.
- Aceitar com o evento já em andamento: oferecer "Iniciar agora".
- Conflito com outro evento em andamento: já resolvido pelo "Aguardando revisão" existente.
- **Sair do evento ≠ encerrar.** Sair retira o uid de `going`, desvincula e revoga as doses
  compartilhadas daquele evento. Encerrar só fecha o tempo (comportamento atual).
- Organizador apaga a conta ou sai: cópias locais sobrevivem, o vínculo mostra "evento cancelado".
- Backup restaurado em outra conta: o vínculo fica velho e a ocasião passa a valer como comum.
- Convite pendente é um `get` único, não um listener; cada aparelho escuta só eventos ainda não
  encerrados.

## Compatibilidade de dados

Campos novos da ocasião são opcionais e passam por `normalize` (`occasions.js`) e `normalizeData`
(`app.js`), senão são descartados ao carregar. `DATA_VERSION` **não muda** (continua 11;
`validateStoredShape` rejeita versão maior). Aparelho numa versão anterior descarta os campos ao
regravar a ocasião: perde o vínculo, nunca a ocasião.

## Plano de teste

- `npm test` a cada fase; `node --input-type=module --check < app.js`, `node --check sw.js`,
  `node --check occasions-ui.js`.
- `npm run test:rules` verde antes de qualquer `npm run rules:deploy` (exige Java).
- Fase 0: 8 testes novos em `tests/share-writer.test.cjs`; 7 falham no código antigo e o oitavo (nova
  tentativa após falha) foi verificado por mutação.
- **Ainda não feitos**: publicar `firestore.rules` (as regras precisam ir **antes** do app, como
  na v2.4.0), teste em aparelhos reais e no Safari/PWA instalada (a câmera e o cache offline
  nunca foram exercitados aqui), fluxo completo pelo app com contas reais (o que existe é o
  módulo real contra o emulador e a interface com dependências falsas; a ligação em `app.js`
  — aceitar, convidar, sair, executar a intenção — não tem teste automatizado próprio, por
  depender do login real), versão do app, cache do service worker e documentação de usuário.
