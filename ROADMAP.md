# Roadmap · Intervalo

Este documento registra ideias em estudo. Os itens abaixo não representam funcionalidades confirmadas e podem mudar conforme testes de UX, limitações técnicas e requisitos de privacidade e segurança.

## Curto / médio prazo

### Exportar / importar bebidas

Recurso específico para transportar **somente a lista e as configurações das bebidas**, sem confundir com backup completo.

Possível fluxo de importação:

- visualizar uma prévia antes de confirmar;
- escolher entre **adicionar às bebidas existentes** ou **sobrescrever a lista atual**;
- detectar possíveis duplicidades;
- manter histórico de consumo fora desse processo, salvo decisão futura explícita.

### Mesclar bebidas

Permitir unir dois cadastros que representam a mesma bebida, especialmente após importações.

Pontos a considerar:

- escolher qual cadastro será mantido como principal;
- transferir os registros históricos para a bebida mantida;
- preservar os snapshots históricos de intervalo, dose, nome e ícone conforme as regras do app;
- oferecer a ação manualmente e também ao detectar possíveis duplicidades durante uma importação.

### Backup / restaurar backup

Recurso separado de **Exportar / importar bebidas**.

O objetivo do backup é preservar/restaurar o estado completo do aplicativo, podendo incluir:

- bebidas;
- histórico;
- preferências;
- futuras relações entre bebidas;
- outros dados locais compatíveis com a versão do backup.

A UX deve usar explicitamente os termos **Fazer backup** e **Restaurar backup**, evitando que o usuário confunda esse fluxo com a simples transferência da lista de bebidas.

Antes da implementação devem ser definidos formato, versionamento, validação, compatibilidade entre versões e estratégia futura de criptografia.

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

Exemplo de uso: durante uma saída em grupo, uma pessoa de confiança poderia consultar os registros que o usuário decidiu compartilhar.

Requisitos mínimos antes de implementação:

- contas e autenticação;
- backend e sincronização;
- consentimento explícito;
- escolha granular do que compartilhar;
- duração limitada, por exemplo próximas 2h, 6h ou 24h;
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
- pode ser desativada para exibir novamente essas informações;
- não deve ocultar alertas importantes, erros, estados de intervalo ou disclaimers de segurança.
