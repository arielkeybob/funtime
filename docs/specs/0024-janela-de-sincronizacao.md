# 0024 — Janela de sincronização: escutar só o histórico recente

Status: implementada

## Contexto

A spec 0022 escuta as coleções `users/{uid}/events` e `users/{uid}/occasions` **inteiras**
(`src/data/firestore-sync.js`). O Firestore cobra uma leitura por documento, e um listener
que ficou desconectado por mais de 30 minutos é cobrado como consulta nova — ou seja, o
histórico inteiro de novo (documentação de preços do Cloud Firestore). Na prática, toda
abertura do app depois de uma pausa relê tudo, e o custo cresce com a idade da conta.

O plano gratuito (Spark) dá 50 mil leituras/dia e, ao estourar, **desativa o produto** até
o dia seguinte (aviso no próprio console). O usuário decidiu não migrar para o plano pago
(app de estudo e uso pessoal), então o consumo precisa caber na cota.

Medição no emulador (real `firestore-sync`, regras reais, ~10 meses de histórico: 300
doses, 42 eventos, 3 bebidas): **346 leituras por abertura sem janela, 109 com janela**
(−69%), e o custo deixa de crescer com o tempo.

## Decisão

Com `windowDays` (90 no app), o aparelho escuta na nuvem apenas:

- doses com `consumedAt >= agora − 90 dias`;
- eventos com `startedAt >= agora − 90 dias − 7 dias` (a margem cobre um evento que
  começou antes do corte mas ainda contém doses recentes);
- eventos **agendados, ainda não iniciados** (`startedAt == null`), em consulta própria —
  a consulta por data os perderia, e agendamentos precisam aparecer em todos os aparelhos;
- bebidas e o documento `meta/app` inteiros (poucos documentos).

Todas são consultas de **um campo só**: usam o índice automático, sem
`firestore.indexes.json`. As regras (`users/{uid}/{document=**}`) não mudam.

O histórico mais antigo **fica no aparelho** (`localStorage`, a fonte de verdade de
sempre) e não é consultado a cada abertura. Para isso não virar perda de dado:

1. **Download completo, uma vez por aparelho e conta.** Na primeira sincronização (ou
   depois de sair e entrar de novo) o módulo lê a coleção inteira **do servidor**
   (`getDocsFromServer`) e faz a união por `id` — nenhum lado é descartado, mesma regra do
   primeiro login da 0022. Sobe o que só existia neste aparelho, traz o que só existia na
   nuvem. Só depois de esse envio terminar é que `fullSync.markDone()` grava que já foi
   feito. Um aparelho novo recebe o histórico todo sozinho, **sem botão "carregar mais"**.
   Falhou (sem internet)? Não marca; tenta de novo na próxima abertura.
2. **Estar fora da janela não é exclusão.** `mergeCollection` mantém um registro local
   ausente do remoto se ele é mais antigo que o corte (`isOutsideWindow`); antes só o
   mantinha se ainda não tivesse sido enviado. Exclusão em outro aparelho de um registro
   **recente** continua propagando.
3. **A base "já enviado" inclui o antigo local** (`syncedBaseline`). Sem isso o diff veria
   todo o histórico antigo como novo e o reescreveria a cada abertura — trocaria leituras
   poupadas por escritas. Apagar ou editar um registro antigo neste aparelho continua
   gerando a exclusão/escrita correspondente.

`createFirestoreSync` ganha três parâmetros opcionais: `windowDays`, `fullSync`
(`{ isDone(), markDone() }`, injetado porque `src/` não toca `localStorage`) e `now`.
Sem `windowDays` o comportamento é o de antes, byte a byte. Em `app.js`, `fullSync` guarda
`fullHistoryFor: <uid>` dentro da chave `funtime-sync-v1` que já existe — que é apagada ao
sair da conta, então o próximo login refaz o download completo.

## Contrato do módulo

- `src/data/sync-merge.js`: `isOutsideWindow(name, record, windowStart)`,
  `syncedBaseline({ merged, remote, windowStart })`, `OCCASION_WINDOW_MARGIN_MS`;
  `mergeRemote` aceita `windowStart` (nulo = modo de sempre).
- `src/data/firestore-sync.js`: `createFirestoreSync({ …, windowDays, fullSync, now })`.
- **Compatibilidade de dados:** nada muda em `localStorage` (`DATA_VERSION` continua 11),
  no formato dos documentos do Firestore, nas regras ou nos backups. A chave
  `funtime-sync-v1` ganha o campo opcional `fullHistoryFor`; quem não o tem apenas faz o
  download completo uma vez.

## Casos de borda preservados

- Sem `windowDays` (ou fora do app instalado, onde a sincronização nem liga), nada muda.
- Primeiro login num aparelho com dados locais: união por `id`, agora explícita no
  download completo.
- "Apagar tudo" continua apagando a nuvem inteira: o aparelho já baixou tudo, então tudo
  está na base "já enviado" e o diff gera as exclusões.
- "Apagar dados na nuvem" lê as coleções inteiras de propósito (`deleteCloudData`).

## Limitações aceitas

- **Editar ou apagar, em outro aparelho, um registro com mais de 90 dias** não chega a um
  aparelho que já baixou o histórico: ele mantém a cópia antiga. Sair da conta e entrar de
  novo refaz o download e reconcilia. Raro (mexer em histórico velho) e sem perda de dado.
- Uma dose retroativa (mais antiga que 90 dias) criada offline, com a fila do SDK perdida
  antes de subir, não chega à nuvem. A fila persiste (spec 0022, v2.2.1), então exige
  também navegação privada/armazenamento bloqueado.
- A cada abertura a escuta recente lê ~janela de documentos; o custo deixa de crescer com
  a idade da conta, mas continua proporcional ao número de usuários e de aberturas.

## Achado durante a validação: ciclo de gravação do `meta/app`

Os prints do console de uso (12 mil gravações e 15 mil leituras em 24h com 2 contas de
teste) e o `syncedAt` do `meta/app` mudando a cada segundo com o app aberto levaram a um
defeito **anterior a esta spec** (presente na 2.15.0): `diffAppData` compara a ordem dos
ids das bebidas em `lastPushed` com a do aparelho, e `lastPushed.drinks` vinha na ordem em
que o Firestore entrega (por id), não na ordem que a pessoa arrastou. Toda vez que as duas
diferiam, `metaChanged` era verdadeiro, o `meta/app` era regravado, e o eco da própria
gravação chegava como novo retrato, refazendo `lastPushed` na ordem por id — sem fim, a
cerca de 1 escrita/s, mais uma leitura de eco e uma reaplicação da tela por retrato.

Reproduzido no emulador com o módulo real (bebidas em ordem própria, app aberto, nada
sendo feito): **8 escritas e 17 reaplicações da tela em 8 s**, contra 0 escritas com as
bebidas na ordem dos ids. Correção: `syncedBaseline` ordena as bebidas por `drinkOrder`
(a mesma ordem que `mergeRemote` aplica ao aparelho), então "nada mudou" volta a ser
"nada mudou". Depois dela, o mesmo cenário faz 0 escritas e 1 reaplicação. Cobertura:
um teste puro em `tests/sync-merge.test.cjs` e um de eco repetido em
`tests/firestore-sync.test.cjs`, ambos falham sem a correção.

Isso independe da janela, mas está na mesma versão porque as duas coisas gastam a mesma
cota e o ciclo mascararia o ganho da janela.

## Plano de teste

- `node --input-type=module --check < app.js`; `node --check sw.js`.
- `tests/sync-merge.test.cjs` (9 casos novos) e `tests/firestore-sync.test.cjs` (10 novos):
  as cinco escutas com filtro certo, espera de todas antes de aplicar, antigo daqui não
  reenviado nem apagado, exclusão recente ainda propaga, apagar antigo daqui apaga na
  nuvem, download completo único (une, sobe só o que faltava, marca só no fim), falha sem
  internet não marca nem derruba a escuta. Verificado por mutação: remover a exceção de
  registro antigo em `mergeCollection` e remover o antigo da base fazem 2 e 4 testes
  falharem.
- Emulador com as regras reais (script descartável): consultas aceitas, incluindo
  `startedAt == null`; 346 → 109 leituras por abertura; 0 escritas ao abrir; dose nova = 1
  escrita.
- **Não feito:** teste em dois aparelhos reais e sob a cota real do plano gratuito.
