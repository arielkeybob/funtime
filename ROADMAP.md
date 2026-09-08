# Roadmap · FunTime

Este documento registra decisões de evolução e ideias em estudo. A migração FunTime abaixo foi acordada com o usuário; os demais estudos não representam funcionalidades confirmadas e podem mudar conforme testes de UX, limitações técnicas e requisitos de privacidade e segurança.

## Decisão acordada — FunTime v1.x → v2.0

FunTime 2.0.0 estabilizado após a confirmação do usuário de que os testes no celular funcionaram. Repositório principal `funtime`, Pages `/funtime/`, novo ícone e receptor real; a ponte permanece em `/intervalo/`. A atualização da dev.2 usa o botão Atualizar, sem repetir a transferência. O aviso na v1.16 é ativado separadamente após conferir o deployment estável. Registro em [RELEASE-V2.md](RELEASE-V2.md); histórico em [V2-PREPARATION.md](V2-PREPARATION.md).

Registrada em 07/09/2026. Primeira fase v1.15.0 enviada ao repositório no commit `5edf167`. A segunda fase v1.16.0 integra esta entrega. Base da migração: v1.14.3, DATA_VERSION 9. O deployment do GitHub Pages deve ser conferido separadamente após o push. Consulte [MIGRATION-FUNTIME.md](MIGRATION-FUNTIME.md) e [TRANSITION-V2.md](TRANSITION-V2.md).

O usuário quer substituir a identidade Intervalo por FunTime, incluindo posteriormente repositório, URL do GitHub Pages e referências internas. A transição terá versões v1.x que migram automaticamente ao tocar em Atualizar. Na v2.0, o usuário aceita uma mudança mais ampla, mesmo que os dispositivos interpretem FunTime como um novo app e precisem de nova instalação. O usuário pretende fornecer um novo ícone para distinguir a v2 da anterior.

- **v1.15.0 — primeira fase:** marca FunTime, armazenamento com nomes FunTime e compatibilidade com dados/arquivos anteriores, mantendo endereço e identidade da PWA atual. Implementação e validação em [MIGRATION-FUNTIME.md](MIGRATION-FUNTIME.md).
- **v1.16.0 — ponte da v2:** diário compacto e recuperação de versões anteriores, caches separados por geração, descoberta da publicação em `/funtime/transition.json`, contrato de posse e orientação após a transferência. Mantida no repositório antigo; o receptor real está no FunTime 2.0. Detalhes em [TRANSITION-V2.md](TRANSITION-V2.md).
- **v2.0.0 — identidade definitiva:** novo ícone baseado no conceito do usuário, identidade da PWA e repositório `funtime`, GitHub Pages em `/funtime/`, referências atuais FunTime. A pasta local permanece `balada` por ser o workspace configurado; uma eventual mudança local será coordenada separadamente e não altera a instalação dos usuários.

### Critérios de continuidade

- Quem pular versões intermediárias também deve conseguir migrar. Manter migrações cumulativas e compatibilidade de arquivos antigos; não remover o suporte apenas porque uma versão intermediária foi publicada.
- Planejar uma ponte no endereço antigo antes de renomear o repositório. Instalações antigas precisam continuar encontrando a atualização, o manifest e os recursos de transição necessários.
- Preservar bebidas, IDs, eventos, timestamps, snapshots e preferências. Evitar duas instalações gravando estados divergentes; o mecanismo de transferência e de desativação de escrita da instalação antiga precisa ser projetado e testado antes da v2.
- A preservação automática da proteção entre instalações depende do navegador, armazenamento e origem. Não prometer reaproveitamento universal de credenciais nem incluir PIN/credenciais nos backups.
- O botão Atualizar controla a atualização do app; nome/ícone no sistema dependem do navegador e podem não acompanhar imediatamente. A v1 mantém a identidade instalada; a v2 pode rompê-la explicitamente.
- FunTime será a marca atual. Referências antigas indispensáveis à leitura de formatos e migrações ficarão isoladas e documentadas; histórico documental e Git não serão reescritos para fingir que a marca antiga nunca existiu. A palavra “intervalo” como duração permanece.
- A primeira fase foi solicitada após o registro do plano. Essa implementação local não implica autorização de commit, push, renomeação remota ou publicação; as fases seguintes continuam planejadas.

### Referências técnicas

- [Identidade da PWA](https://developer.chrome.com/docs/capabilities/pwa-manifest-id): preservar o identificador efetivo mantém a identidade instalada; alterá-lo pode criar outro app.
- [Atualização de PWA e metadados](https://web.dev/learn/pwa/update): atualização do Service Worker e dos metadados da instalação são processos distintos e dependem da plataforma.
- [Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API): localStorage pertence à origem, não ao caminho; mudar somente `/intervalo/` para `/funtime/` não cria, por si só, outro armazenamento.
- [Renomeação de repositório](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository): planejar separadamente o endereço do GitHub Pages.

## Próximos estudos

### Reordenar ícones por arrastar e soltar

Permitir reorganizar o catálogo pessoal, distinguindo arraste de rolagem horizontal, seleção e exclusão no celular. Prever alternativa por teclado, feedback visual e persistência da ordem. Adiado para uma evolução própria; adicionar e excluir disponíveis na V1.12.0.


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
