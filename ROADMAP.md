# Roadmap · Intervalo

Este documento registra ideias em estudo. Os itens abaixo não representam funcionalidades confirmadas e podem mudar conforme testes de UX, limitações técnicas e requisitos de privacidade e segurança.

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
