# Roadmap · FunTime

Este documento registra decisões de evolução e ideias em estudo. Os itens abaixo não representam funcionalidades confirmadas e podem mudar conforme testes de UX, limitações técnicas e requisitos de privacidade e segurança.

## Concluído — migração de marca Intervalo → FunTime

A identidade mudou de "Intervalo" para "FunTime" em três fases (v1.15.0 → v1.16.0 → v2.0.0): novo repositório (`funtime`), novo ícone, nova URL (`/funtime/`) e uma ponte temporária em `/intervalo/` para transferir instalações antigas. O usuário confirmou os testes no celular e a v2.0.0 foi estabilizada; a ponte e todo o protocolo de transferência (`migration.js`/`transition.js`/`receiver.js`) foram removidos do código quando o suporte à v1 deixou de ser necessário (spec 0018). Registro histórico completo em [docs/history/](docs/history/) (`MIGRATION-FUNTIME.md`, `TRANSITION-V2.md`, `V2-PREPARATION.md`, `RELEASE-V2.md`).

## Próximos estudos

### Mesclar bebidas

Permitir unir dois cadastros que representam a mesma bebida, especialmente após importações.

Pontos a considerar:

- escolher qual cadastro será mantido como principal;
- transferir os registros históricos para a bebida mantida;
- preservar snapshots históricos;
- oferecer a ação manualmente e, futuramente, ao detectar possíveis duplicidades em uma importação.

### Backup protegido por senha

A V1.10.0 cria e restaura backup local em JSON, sem incluir PIN/biometria.

Uma evolução futura pode oferecer backup criptografado, com desenho específico para:

- AES-GCM;
- derivação de chave a partir de senha;
- recuperação e mensagens claras sobre perda da senha;
- compatibilidade/versionamento do formato.

### Relações configuradas entre bebidas

Permitir que o próprio usuário cadastre relações do tipo:

`X → evitar combinar com Y durante N horas/minutos`

Quando X estiver dentro da janela configurada:

- X continua usando seu estado normal de intervalo;
- Y pode receber um estado visual distinto, por exemplo laranja;
- Y pode mostrar uma mensagem como **“Não misturar com X”**.

Essas relações serão **exclusivamente cadastradas pelo usuário**. O app não terá uma base própria de combinações consideradas perigosas e não fará recomendações médicas automáticas.

A relação não precisa ser obrigatoriamente simétrica; `X → Y` pode existir sem `Y → X`.

## Longo prazo / exige projeto específico

### Compartilhamento temporário com pessoas autorizadas

Estudar um modo opcional de permitir que duas pessoas conectadas compartilhem parte de seus registros por um período definido.

Requisitos mínimos antes de implementação:

- contas e autenticação;
- backend e sincronização;
- consentimento explícito;
- escolha granular do que compartilhar;
- duração limitada;
- revogação imediata;
- privacidade e segurança dos dados;
- tratamento de conflitos/offline;
- clareza de que os registros compartilhados não determinam se alguém está seguro para consumir mais.

A proposta deve ser tratada como **compartilhamento entre pessoas de confiança**, e não como rede social pública.

## Implementado

### Interface limpa e compacta — V1.9.0

Preferência disponível em **Configurações → Aparência**.

- ativada por padrão;
- oculta textos e explicações auxiliares;
- não oculta alertas importantes, erros, estados de intervalo ou disclaimers.

### Exportar / importar bebidas — V1.10.0

Recurso específico para transportar **somente a lista e as configurações das bebidas**.

- arquivo JSON versionado;
- desde V1.10.1, exportado como `.txt` (`text/plain`) para compartilhamento nativo; importação aceita TXT e JSON;
- exportação por botão único **Exportar bebidas**;
- em plataformas compatíveis, a exportação pode usar a folha nativa do sistema para escolher o destino do arquivo;
- importação manual por seletor de arquivo;
- em Android/PWA compatível, o manifest inclui `share_target` para receber um arquivo JSON enviado ao Intervalo;
- prévia antes de importar;
- opção de adicionar ou substituir;
- duplicatas exatas ignoradas no modo adicionar;
- histórico nunca é apagado pela importação de bebidas.

### Backup / restauração — V1.10.0

Recurso separado da transferência de bebidas.

- backup inclui bebidas, histórico e preferências;
- bloqueio, PIN e credenciais do aparelho ficam fora do backup;
- restauração sempre substitui o estado restaurável;
- arquivo é validado integralmente antes da gravação;
- erro de validação/gravação mantém os dados atuais.

### Reordenar ícones por arrastar e soltar — V2.0.3 a V2.0.5

No modo de edição do catálogo, pressão longa arrasta o ícone até outra posição, com rolagem automática nas bordas, alternativa por teclado (setas/Home/End, Escape cancela) e lixeira vermelha para exclusão por soltura, com Desfazer. A caneta continua como alternativa explícita de exclusão. Ordem persistida no catálogo e incluída no backup, sem mudar o schema.

### Eventos/ocasiões e agenda — V2.1.0 em diante

Cards distinguem "consumido nesta ocasião" de "possui histórico"; eventos são opcionais, com no máximo um em andamento. A aba Evento é uma agenda compacta (Próximos/Anteriores) com agendamento manual/automático, aviso na Home antes do início e recuperação de eventos esquecidos após 48h sem registro. Detalhe técnico e histórico de versões em DEVELOPMENT.md; os documentos de planejamento originais (comparação de alternativas, casos de borda considerados) estão arquivados em [docs/history/EVENTOS-PLANEJAMENTO.md](docs/history/EVENTOS-PLANEJAMENTO.md) e [docs/history/EVENTOS-AGENDA-UX.md](docs/history/EVENTOS-AGENDA-UX.md).

## Débito técnico

Itens identificados durante auditorias/refactors anteriores, sem correção própria agendada ainda.

- **HTML das roletas duplicado em `index.html`** (auditoria de formulários, 09/09/2026): a lógica JS já foi unificada em `src/ui/wheel-picker.js` (specs 0011 e 0020/9.2.1), mas o markup de cada roleta ainda se repete; falta extrair um template/fábrica compartilhado com rótulos e limites configuráveis.
- ~~`styles.css` acumula regras específicas de `#drink-dialog`/`#log-dialog`~~ — resolvido: as regras byte-idênticas (tamanho do wheel-picker no mobile, rodapé fixo de ações) foram unificadas com `:is()`. `#event-dialog` ficou de fora de propósito, por ter hoje uma aparência diferente nesses pontos (ver commit); unificar os três exigiria decidir e validar uma mudança visual, não só um refactor.
- ~~Abertura/limpeza de formulário ainda específica em `app.js`~~ — reavaliado: o contrato compartilhado (`beginFormDraft`/`updateFormDraft` em `ui.js`) já cobre tudo que é genuinamente comum entre os 6 diálogos com rascunho (bebida, log, evento, PIN, ocasião). O que resta em cada `openXDialog()` é a população de campos específicos de cada modelo de dado — não é duplicação, é o próprio conteúdo do formulário; forçar uma abstração ali trocaria poucas linhas claras por indireção sem ganho real. Catálogo de ícones persiste imediatamente, independente de Cancelar — continua separado do rascunho da bebida, de propósito.
- ~~`loadAppData()` sem caminho de recuperação para dado ilegível~~ — resolvido: a tela de erro de `boot.js` (única que sobrevive quando `app.js` falha ao carregar) ganhou um botão "Baixar cópia dos dados" quando o erro é especificamente de dado corrompido (`loadAppData()` marca isso com `error.name = 'FunTimeDataCorruptedError'`). Escopo deliberado: só `funtime-v1-data`, só baixar (sem "apagar e recomeçar" ainda); a validação fail-closed em si não mudou.
- ~~Histórico sem paginação/virtualização~~ — resolvido com paginação incremental (não virtualização de janela de scroll, ver commit): `state.historyLimit` mostra 20 registros por vez, com "Mostrar mais" revelando o resto. Mesmo padrão já usado na agenda de eventos.
- **Cache de share-target sem expiração** (`sw.js`): um arquivo pendente de compartilhamento fica em cache até ser lido; um novo recebimento simplesmente substitui o anterior, sem prazo automático.
- **Lock/unlock ainda em `app.js`** (spec 0020, Fase 9.2.5): `lockApp`/`unlockApp`/`showLockScreen`/`handlePinUnlock`/`handleDeviceUnlock`, os diálogos de configurar método/PIN e os 3 listeners inline de auto-lock ficaram de fora da extração de segurança porque `reset.js:184-192` duplica a lógica de bloqueio (reimplementa a contagem de tentativas em vez de chamar `handlePinUnlock`) e há zero teste cobrindo hoje o fluxo real de lock/unlock. Resolver a duplicação e escrever esses testes antes de extrair.
