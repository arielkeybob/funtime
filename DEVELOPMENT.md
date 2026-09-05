# Intervalo — documentação de desenvolvimento

**Versão da aplicação:** `v1.10.2`\
**Versão do modelo persistido:** `DATA_VERSION = 8`\
**Autor exibido na interface:** `arielkeybob`  
**Stack:** HTML + CSS + JavaScript puro  
**Persistência:** `localStorage`  
**Backend:** não existe  
**Build step:** não existe

> Este documento descreve a arquitetura e o comportamento técnico da versão `v1.10.2`. Ele foi escrito para facilitar manutenção, depuração e evolução do projeto sem depender do histórico da conversa em que o app foi criado.

## Exportação TXT — V1.10.1

`exportDrinks()` gera `.txt` com MIME `text/plain`, preservando o payload JSON `intervalo-drinks` e sua versão de formato. A importação valida o conteúdo com o mesmo parser, independentemente da extensão; o seletor e o `share_target` aceitam TXT e JSON. Backup continua JSON. `DATA_VERSION` permanece 8 e o cache passa para `intervalo-v1-10-1`.

Validação desta alteração: sintaxe de app.js/sw.js e simulação Node dos caminhos de compartilhamento, download, cancelamento, conteúdo/MIME do arquivo e leitura TXT/JSON. A simulação não verifica integração com WhatsApp ou atualização do manifest no aparelho; esses fluxos precisam de teste na PWA publicada.

> Nota de continuidade: o documento também preserva descrições e exemplos de releases anteriores. Para preferências e arquivos de dados atuais, consulte as seções V1.9.0 e V1.10.0 ao final e confira o código; exemplos antigos com modelo 7 ou caches anteriores não representam a versão vigente. A procedência do contexto recuperado está em [CONTEXT.md](CONTEXT.md), e as orientações de trabalho em [AGENTS.md](AGENTS.md).

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

Não há suíte automatizada nesta versão. Antes de distribuir uma release, testar manualmente.

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

O aviso consulta a versão do Service Worker em espera via GET_VERSION/MessageChannel e exibe “Atualize quando puder vX.X.X”. Sem resposta válida em 2 segundos, mantém o texto genérico. A versão exibida é a disponível, não a instalada. O cliente antigo V1.10.1 ainda mostra o aviso antigo ao receber esta atualização; o novo aviso passa a funcionar após instalar V1.10.2, nas próximas atualizações.

Configurações: Aparência, Privacidade, Sobre a proteção, Bebidas e Backup. “Sobre a proteção” fica oculto no modo de interface limpa. Os controles de privacidade e o disclaimer continuam visíveis. Cache: `intervalo-v1-10-2`; modelo de dados permanece 8.
