# FunTime — V2.0.6

V2.0.6 em validação: toque separado do mouse, tolerância de 18px durante a pressão longa e acompanhamento pelo identificador do contato até touchend/touchcancel. Configurações → **Diagnóstico de toque** permite registrar e exportar eventos para investigar falhas no aparelho. Começa desligado em cada abertura; registro só em memória, sem bebidas, ícones, histórico ou PIN. App, boot, footers e cache `funtime-v2-0-6` preparados; DATA_VERSION 9 preservado. Validação no aparelho real ainda pendente.

V2.0.5: segure um ícone por meio segundo para reorganizar; solte para salvar. Deslizar antes disso continua rolando a lista. Durante o arraste aparece a área vermelha **Solte aqui para excluir**: só soltar dentro dela remove a opção do catálogo, com Desfazer, preservando bebidas e histórico. A caneta volta a ativar somente os × vermelhos; nesse modo não há arraste. Sem alças ou menu. Pelo teclado, Alt + setas/Home/End reorganiza o ícone focado. App, boot e footers 2.0.5; cache `funtime-v2-0-5`; DATA_VERSION 9 e aceite preservados. Commit/push autorizados após validação.

V2.0.4: a caneta abre um pequeno menu com **Reordenar ícones** e **Excluir ícones**. Cards mantêm o tamanho compacto; a alça e o × ocupam o mesmo canto, em modos separados. Durante o arraste, o emoji acompanha o dedo e os outros abrem espaço com animação. A ordem só é salva ao soltar, com Desfazer; teclado e rolagem nas bordas preservados. O ✓ conclui o modo escolhido. App, boot e footers 2.0.4; cache `funtime-v2-0-4`; DATA_VERSION 9 e aceite preservados. Commit e push autorizados; validação em celular real ainda pendente.

V2.0.3: reordenação do catálogo de ícones. No cadastro/edição de uma bebida, toque na caneta e arraste pela alça ⠿ até outro ícone. Pelo teclado, foque a alça e use as setas ou Home/End. A ordem é salva imediatamente, mesmo ao cancelar a bebida, e acompanha o backup. Bebidas e histórico permanecem intactos. Publicação autorizada em 08/09/2026. App, boot e footers 2.0.3; cache funtime-v2-0-3; DATA_VERSION 9 preservado.

V2.0.2: a página de instalação confirma “App já instalado” por evento do navegador ou detecção, sem manter o convite para instalar. Aceitação do prompt continua distinta de conclusão; verificações periódicas e proteção contra respostas atrasadas evitam estado incorreto. App, boot, footers e cache `funtime-v2-0-2` atualizados; DATA_VERSION 9 e aceite preservados. Publicação autorizada em 08/09/2026, com deployment a conferir após o push.

Navegação 2.0.1 já enviada ao remoto: Voltar percorre telas, diálogos e subetapas até o Início. Planejamento por tela, comportamento e testes em [NAVIGATION.md](NAVIGATION.md). O registro abaixo preserva a estabilização inicial 2.0.0.

FunTime 2.0: novo ícone de abacaxi com relógio, identidade `/funtime/` e cache separado da v1. Pelo navegador, oferece instalação sem ler dados privados; pelo novo ícone, confirma a utilização dos dados existentes ou oferece backup/início sem dados. A transferência exige ponte v1.16 compatível e exclusividade de escrita, preservando bebidas, histórico, proteção e preferências. O repositório principal é [arielkeybob/funtime](https://github.com/arielkeybob/funtime). A ponte v1.16 continua no repositório `intervalo`, commit `7c75410`; não publicar o app v2 sobre `/intervalo/`.

Abra [FunTime 2](https://arielkeybob.github.io/funtime/): faça backup na versão anterior, instale pelo novo endereço, feche a janela antiga e abra o novo ícone. Após confirmar a transferência, use a v2: a antiga deixa de editar os dados. Se o sistema separar o armazenamento, escolha “Tenho um backup” e use a restauração com prévia. Quem já instalou a dev.2 recebe a versão estável pelo botão Atualizar, sem nova instalação ou transferência.

O usuário confirmou os testes no celular e o funcionamento da transição. O marcador `transition.json` anuncia a versão estável para a v1.16, após verificação do deployment. Registro da entrega em [RELEASE-V2.md](RELEASE-V2.md); histórico da preparação em [V2-PREPARATION.md](V2-PREPARATION.md). As seções seguintes documentam as entregas anteriores.

## V1.16.0 — preparação da transição para v2

A migração usa um diário compacto com SHA-256 para reduzir o espaço temporário, preservando cópia verificada antes de remover a origem. Diários interrompidos da v1.15.0 também são compactados e retomados. O schema dos dados e os formatos de arquivos permanecem compatíveis.

A v1 descobre a publicação por um marcador JSON em `/funtime/transition.json`, sem enviar dados privados, e só então oferece abrir a nova instalação ou continuar na v1.16 para fazer backup. Depois que a futura v2 assumir e validar os dados, a instalação antiga passa a orientar somente a abertura do FunTime 2, sem carregar dados nem permitir escritas. Enquanto o marcador não existir ou estiver indisponível, o app funciona normalmente. A limpeza de caches da v1 também preserva os caches da geração v2.

App, boot, SW e footers 1.16.0; cache `funtime-v1-16-0`; DATA_VERSION 9 e TERMS_VERSION 1.0.1 preservados. O repositório, endereço e ícone continuam os da v1.x. Implementação, contrato da futura v2 e limites dos testes em [TRANSITION-V2.md](TRANSITION-V2.md).

## V1.15.0 — primeira fase da migração FunTime

FunTime é o novo nome do Intervalo. A atualização mantém a identidade instalada, o endereço, o repositório e o ícone da v1.x. A nova identidade/instalação e o novo ícone ficam para a v2.0, conforme [ROADMAP.md](ROADMAP.md).

Antes de abrir os dados, `boot.js` coordena a atualização das janelas antigas pelo Service Worker e obtém exclusividade de escrita usando Web Locks. Uma janela instalada usa o app por vez; outras aguardam e continuam automaticamente quando ela fecha. A página comum de instalação não lê os dados privados nem ocupa essa exclusividade. É necessário um navegador com Web Locks e Service Worker, em HTTPS ou localhost.

`migration.js` transfere dados, proteção e aceite para `funtime-*`, com diário recuperável, verificação das gravações e limpeza posterior das origens. Falhas bloqueiam a abertura com erro visível; não descartam a origem para iniciar vazia ou sem proteção. Uma origem antiga que reapareça após a conclusão é tratada como conflito, sem mesclagem automática.

Novos arquivos usam `FunTime-Bebidas-…txt` / `FunTime-Backup-…json` e tipos `funtime-drinks` / `funtime-backup`. O app também lê os tipos antigos; versões antigas podem rejeitar os arquivos novos. Histórico e preferências continuam fora da importação de bebidas, e segurança/aceite/sessão/diário de migração continuam fora do backup. Importações compartilhadas pendentes da geração antiga são preservadas.

APP_VERSION e footers 1.15.0; cache `funtime-v1-15-0`; DATA_VERSION 9 e TERMS_VERSION 1.0.1 preservados. O nome no launcher depende da atualização de metadados feita pelo sistema. Plano, protocolo e validação em [MIGRATION-FUNTIME.md](MIGRATION-FUNTIME.md). As seções abaixo registram versões históricas do Intervalo.

## V1.14.3 — formato e rótulos dos contadores

Na contagem normal, o início mostra Contando: HH:MM:SS. Na regressiva, mostra Falta: -HH:MM:SS; o sinal é apenas visual e não altera cálculos. No histórico em modo normal, intervalos ativos mostram Falta HH:MM, arredondando o tempo restante para cima até o próximo minuto (menos de um minuto aparece como 00:01). Ao concluir, volta ao tempo atrás. Exemplo: 90 minutos aparecem como Falta 01:30.

App/footer 1.14.3 e cache intervalo-v1-14-3; dados e preferências preservados, DATA_VERSION 9. Validação: node --check app.js e sw.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs (32 testes), incluindo limites de hora, último minuto e conclusão. Não realizados testes visuais/manuais no celular e atualização da PWA instalada.

## V1.14.2 — escolha da contagem e avisos compactos

Configurações → Interface permite escolher Contagem regressiva (padrão) ou Contagem normal. A regressiva mantém o início e o histórico anteriores. A normal mostra Decorrido: HH:MM:SS no início, de zero até o intervalo do último snapshot; ao concluir, mantém a ação Anotar nova dose. No histórico, cada intervalo ainda ativo mostra Falta MM:SS (minutos totais, por exemplo 90:00); concluídos mostram tempo atrás. Cálculos continuam baseados em timestamps e intervalos históricos, inclusive após reabrir o app ou alterar a bebida.

O rótulo inicial passa a Intervalo, com duração sem quebra interna. Avisos comuns duram 4 segundos; erros e ações com Desfazer, 6 segundos. Layout e botão Entendi mais discretos, com alvos de toque de 44px; avisos persistentes continuam exigindo dispensa.

preferences.countingMode é opcional e aceita countdown/normal, com padrão regressivo para dados e backups anteriores. Backup inclui a preferência; importação de bebidas preserva a local. Falha ao gravar mantém a escolha anterior. DATA_VERSION permanece 9, pois o campo é opcional e compatível; app/footer 1.14.2 e cache intervalo-v1-14-2. Políticas e aceite preservados.

Validação: node --check app.js e sw.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs (32 testes). Cobertura de migração, backup, falha de gravação, limites e transição dos contadores, tempos dos avisos e persistência dos avisos essenciais. Não realizados testes visuais/manuais no navegador ou celular, leitor de tela e atualização da PWA instalada. Armazenamento real preservado.

## V1.14.1 — emojis sem variações de tom de pele

Removidas 1.875 variações de tom de pele do painel. Permanecem 1.906 emojis, com a apresentação padrão (amarela quando aplicável), nas mesmas nove categorias e com rolagem contínua. Ícones pessoais já salvos, bebidas e snapshots históricos são preservados.

App e footers 1.14.1; cache intervalo-v1-14-1; DATA_VERSION permanece 9. Validação: node --check app.js, sw.js e emoji-data.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs, incluindo ausência de modificadores de pele e presença de emojis padrão. Não realizados testes manuais em celular/navegador nem atualização de PWA instalada.

## V1.14.0 — catálogo completo e rolagem de emojis

O painel oferece 3.781 emojis Unicode 16.0 em nove categorias, incluindo tons de pele, sequências compostas e bandeiras. Dados locais em emoji-data.js, carregados antes de app.js e incluídos no pré-cache; fonte https://unicode.org/Public/emoji/16.0/emoji-test.txt e licença em UNICODE-LICENSE.txt. Os desenhos e o suporte a emojis recentes dependem do sistema; não são imagens do WhatsApp.

Todas as categorias aparecem em uma rolagem contínua com títulos. O dropdown acompanha a categoria no topo da área visível; selecionar uma categoria manualmente desloca somente a lista de emojis. O painel é construído uma vez e atualiza as opções já adicionadas ao reabrir. Catálogo pessoal mantém o limite de 100 favoritos, exclusões e ordem; bebidas e snapshots preservados. DATA_VERSION permanece 9; app/footer 1.14.0 e cache intervalo-v1-14-0. Políticas e aceite inalterados.

Validação: node --check app.js, sw.js e emoji-data.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs. Cobertura do catálogo, unicidade, sequências compostas, limites de persistência e sincronização/salto com geometria simulada. Não realizados: testes visuais/manuais no navegador, toque em Android/iOS, leitor de tela e atualização da PWA instalada. Não foi alterado armazenamento real.

## V1.13.1 — padrões de diálogos e notificações

Apagar bebidas começa sem seleção. Selecionar todas/Desmarcar todas abrangem a lista inteira, com contador e indicação de rolagem. A opção de apagar histórico continua marcada por padrão, mas fica separada após a prévia e o aviso de irreversibilidade. A primeira etapa usa botão branco e “1 de 2 · Revisar”; a segunda usa botão vermelho e “2 de 2 · Autenticar”.

ui.js normaliza os diálogos com conteúdo rolável e ações fixas no celular (até 600px), seguindo o cadastro. Desktop mantém modal centralizado. ui.js precisa ser carregado antes de app.js, depois de construir o HTML, e está no pré-cache. Campos e IDs existentes são preservados.

showAppNotification(message, {title, type, persistent, undo, onDismiss}) centraliza os avisos. showToast mantém compatibilidade com Desfazer, agora por 10 segundos. A apresentação tem título, símbolo, contraste e botão Entendi; usa popover manual acima dos diálogos quando disponível. Notificações de reset permanecem até dispensar; APAGAR TUDO exibe conclusão antes de recarregar ao tocar Entendi. Avisos são ocultados ao bloquear/ocultar dados privados. Erros de exportação/backup usam apresentação de falha.

App/footer principal 1.13.1, cache intervalo-v1-13-1; DATA_VERSION 9 e políticas/aceite inalterados. Preservada a alteração manual “Excluir bebida mas manter histórico”.

Validação: node --check app.js, sw.js, reset.js e ui.js; node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs. Prévia isolada em 390×844: seleção inicial vazia, selecionar/desmarcar todas, bloqueio de confirmação vazia, transição para autenticação, exclusão simulada e aviso persistente. Sem alterações ao armazenamento real. Ainda não testados: teclado virtual e biometria em aparelhos Android/iOS, atualização da PWA instalada e todos os diálogos em dispositivos reais.

## V1.13.0 — redefinir e apagar dados

Configurações inclui uma seção expansível depois de Backup, disponível também no modo compacto. Restaurar ícones padrão preserva bebidas e snapshots. Apagar histórico oferece 30 min, 1h, 2h, 5h, 24h, 2 dias, 7 dias, 30 dias ou tudo, por consumedAt; os limites são inclusivos e os períodos finitos não abrangem datas futuras. A prévia fixa os IDs e horários antes da autenticação. Apagar bebidas permite escolher cadastros, todos inicialmente marcados, e apagar também seu histórico (marcado por padrão); históricos de outras bebidas e órfãos permanecem.

Todas as ações exigem confirmação e nova autenticação pelo método configurado. Sem proteção, o usuário deve configurá-la e retornar à ação. A autorização é vinculada à prévia, ao estado e à proteção local; cancelamento, bloqueio ou alteração dos dados invalida a operação. PIN compartilha contador/limite de tentativas com o desbloqueio. Exclusões não oferecem Desfazer; contadores são recalculados.

APAGAR TUDO grava um estado vazio válido, restaura preferências e ícones, remove a chave legada, importação compartilhada pendente, sessão e configuração local de segurança. A proteção é removida por último; falha complementar é informada como parcial, sem alegar preservação de dados já apagados. Apenas chaves próprias são limpas. Não remove backups exportados, instalação, dados de outros aparelhos ou credenciais no sistema operacional. Por solicitação do usuário, o aceite atual das políticas é preservado; policies.js e policies.html não foram alterados, inclusive sua versão visível. Não é necessário aceitar os termos novamente por esta atualização.

Lógica em reset.js, incluído no cache offline. App/footer principal 1.13.0, cache intervalo-v1-13-0; DATA_VERSION permanece 9. Nenhuma dependência ou backend.

Validação: node --check app.js, sw.js e reset.js; node --test tests/audit.test.cjs tests/reset.test.cjs. Prévia isolada no navegador verificou seleção com histórico marcado, confirmação separada, PIN incorreto e exclusão após PIN correto, com armazenamento simulado. Não testados em dispositivo real: biometria/WebAuthn, teclado mobile, atualização offline da PWA e limpeza completa pela interface. Não apagar armazenamento real para testes.

## V1.12.1 — edição discreta e painel de emojis

Os botões × aparecem somente após tocar na caneta abaixo do +. O mesmo card conclui a edição; cada abertura do cadastro começa com a edição desligada. O + abre um painel interno com categorias e uma seleção de emojis Unicode, sem campo de texto, imagens, dependências ou requisições externas. Não é o teclado nativo nem um catálogo completo de todos os emojis; os símbolos disponíveis são renderizados pelo aparelho. Opções já cadastradas ficam desabilitadas no painel.

O catálogo padrão removido não é reposto em atualizações: preferences.iconCatalog é preservado, incluindo lista vazia. Somente dados/backups sem catálogo recebem os padrões. Restaurar um backup substitui o catálogo pelo conteúdo restaurado. DATA_VERSION permanece 9; app e footers 1.12.1, cache intervalo-v1-12-1. Arrastar e soltar permanece no roadmap.

## V1.12.0 — catálogo pessoal de ícones

O seletor permite adicionar um emoji ou símbolo pelo teclado/colagem e remover qualquer opção pelo ×, com Desfazer dentro do editor. O card + permanece disponível mesmo com a lista vazia. Limite de 100 opções, sem duplicatas; emojis compostos são validados como uma unidade visual. Navegadores sem Intl.Segmenter exibem uma orientação de atualização ao tentar adicionar.

Remover uma opção não altera bebidas nem snapshots históricos. O ícone selecionado permanece disponível no rascunho, mesmo fora do catálogo. Alterações do catálogo são preferências globais, salvas imediatamente, independentemente de Cancelar a bebida. Desfazer recupera a última exclusão enquanto o editor permanece aberto.

DATA_VERSION 9: preferences.iconCatalog é uma lista ordenada; dados e backups antigos recebem o catálogo padrão, listas vazias permanecem vazias. Backup inclui o catálogo; exportação de bebidas transporta somente o ícone de cada bebida. Importação preserva o catálogo local. Falhas de gravação mantêm o estado anterior e mostram erro. App/footers 1.12.0; cache intervalo-v1-12-0. Políticas e versão de aceite preservadas.

## V1.11.3 — teste de renovação do aceite

TERMS_VERSION passa para `1.0.1` para testar o novo aceite após atualização. Aceites e rascunhos de `1.0` não dispensam as três confirmações da nova versão. Conteúdo das políticas preservado; DATA_VERSION 8; cache `intervalo-v1-11-3`.

## V1.11.2 — redação sobre o projeto

A página de políticas passa a descrever o uso pelos autores e testes de feedback com conhecidos selecionados. Ajuste editorial, sem novo aceite: TERMS_VERSION permanece 1.0 e DATA_VERSION permanece 8. Cache atualizado para `intervalo-v1-11-2` para distribuir o HTML às PWAs instaladas.

## V1.11.1 — continuidade do primeiro aceite

As marcações são preservadas na mesma sessão ao abrir as políticas e voltar. O rascunho não representa aceite e é descartado após Continuar. Uma nova TERMS_VERSION exige nova confirmação e não reaproveita marcações da edição anterior. Políticas permanecem em 1.0, dados em 8 e cache em `intervalo-v1-11-1`.

## V1.11.0 — políticas e primeiro acesso

Projeto desenvolvido principalmente para estudo de programação e fins acadêmicos e didáticos, com uso pessoal e testes com conhecidos.

Página [Políticas e informações](./policies.html), aceite local obrigatório na PWA instalada e links discretos no footer. Validação de arquivos fortalecida e erro de restauração corrigido. Aceite `1.0` fora do backup; dados permanecem na versão 8; cache `intervalo-v1-11-0`.

Veja o diagnóstico, decisões e limites em [AUDIT.md](./AUDIT.md). As seções abaixo registram versões históricas; seus nomes de cache não representam a versão atual.

## V1.10.1 — exportação de bebidas em TXT

**Exportar bebidas** agora gera `Intervalo-Bebidas-AAAA-MM-DD.txt` com MIME `text/plain`, para ampliar a compatibilidade com o compartilhamento nativo. O conteúdo continua sendo JSON versionado. O sistema oferece os aplicativos de destino disponíveis, como WhatsApp; se o compartilhamento não estiver disponível ou falhar, o app usa download.

A importação manual e o manifest de recebimento aceitam `.txt` e os `.json` anteriores. Backup/restauração continuam usando `.json`. Versão dos dados permanece 8; cache PWA: `intervalo-v1-10-1`. A integração de recebimento depende de o sistema atualizar o manifest da PWA instalada.

Aplicação em HTML, CSS e JavaScript puro para registro pessoal de bebidas e acompanhamento dos intervalos configurados pelo usuário.

Documentação técnica detalhada: [`DEVELOPMENT.md`](./DEVELOPMENT.md).






## Mudanças da V1.8.6

- Mantido o símbolo **⚙** como ícone global de Configurações.
- O footer passou a exibir o disclaimer **“App para estudo · não é controle de segurança”** acima da versão e dos créditos.
- O footer agora usa comportamento de *sticky footer por layout*: fica junto ao fim da viewport quando há pouco conteúdo e segue naturalmente após o conteúdo quando a página é maior que a tela.
- Versão exibida atualizada para `v1.8.6`.
- Cache PWA atualizado para `intervalo-v1-8-6`.

## Mudanças da V1.8.5

- No histórico, o badge de tamanho da dose (`Meia` / `Inteira`) agora aparece ao lado do nome da bebida, mantendo a identificação do consumo em uma única linha visual.
- A mensagem de confirmação durante intervalo em andamento foi simplificada para: `Se você já consumiu novamente, anote o horário.`
- Cache da PWA atualizado para `intervalo-v1-8-5`.

## Mudanças da V1.8.4

- Cabeçalho da tela inicial simplificado: `Uso pessoal / Início` à esquerda e `Histórico / Configurações` alinhados à direita.
- O botão `+` saiu do cabeçalho e passou a ficar centralizado abaixo da lista de bebidas.
- Quando não há bebidas cadastradas, o botão central é ocultado para evitar duplicação com o botão do estado vazio.
- Cache da PWA atualizado para `intervalo-v1-8-4`.


## Mudanças da V1.8.3

- Reorganização do cabeçalho da tela inicial em duas linhas para evitar competição entre título e ações no mobile.
- A engrenagem de Configurações agora fica na linha superior, alinhada ao texto `USO PESSOAL`.
- A segunda linha mantém `Início` à esquerda e agrupa apenas `Histórico` e `+` à direita.
- Ajustes responsivos para preservar alinhamento e evitar quebra em telas estreitas.
- Cache da PWA atualizado para `intervalo-v1-8-4`.

## Mudanças da V1.8.1

- Corrigido o cabeçalho mobile da tela inicial: `Início`, `Histórico`, `+` e `⚙` agora compartilham uma linha estável abaixo de `Uso pessoal`, com largura explícita e ajustes para telas estreitas.
- O botão de autenticação do aparelho passou de **Desbloquear com o aparelho** para **Entrar**.
- Novos PINs do aplicativo agora usam **4 dígitos**. PINs de 6 dígitos criados na V1.8.0 continuam aceitos até o usuário trocar o método/PIN.

## Mudanças da V1.8.0

- Adicionada uma tela dedicada de **Configurações**, acessível por uma engrenagem discreta na linha superior do cabeçalho. O cabeçalho foi reorganizado em duas linhas para preservar o acesso direto a **Histórico** e **Adicionar** sem comprimir o título `Início`.
- Adicionado **bloqueio do aplicativo** opcional. Quando ativo, bebidas, histórico e demais dados da interface ficam ocultos até o desbloqueio.
- Dois métodos de desbloqueio: **Biometria / bloqueio do aparelho** via WebAuthn e **PIN do aplicativo** de 4 dígitos.
- O método de aparelho usa `userVerification: "required"` e `authenticatorAttachment: "platform"`. O sistema operacional decide se a verificação será impressão digital, reconhecimento facial ou credencial de bloqueio disponível.
- A credencial WebAuthn é validada localmente: challenge, origin, RP ID hash, flags de presença/verificação do usuário e assinatura da assertion são conferidos no navegador.
- PIN local derivado com **PBKDF2 + SHA-256**, salt aleatório e 210.000 iterações. O PIN em texto puro não é persistido.
- Após 5 PINs incorretos, o desbloqueio fica temporariamente bloqueado por 30 segundos.
- O usuário pode escolher novo bloqueio **imediato, após 1, 5 ou 15 minutos** depois que o app vai para background.
- Durante o background é aplicado um **privacy shield** para reduzir exposição dos dados no seletor de aplicativos; diálogos abertos são fechados quando a proteção está ativa.
- Adicionado botão **Bloquear agora**.
- Configuração de segurança fica separada dos dados de bebidas em `intervalo-security-v1`. `DATA_VERSION` permanece `7`.
- O bloqueio desta versão é uma proteção de acesso pela interface. Os dados do histórico ainda não são criptografados em repouso.
- Cache da PWA atualizado para `intervalo-v1-8-1`.

## Mudanças da V1.7.0

- Implementado fluxo de **atualização controlada da PWA**.
- Uma nova versão do Service Worker é baixada em background e permanece aguardando enquanto a versão atual está em uso.
- Quando existe atualização pronta, o app mostra um aviso discreto **“Nova versão disponível”** com o botão **Atualizar**.
- O novo Service Worker só chama `skipWaiting()` depois da ação explícita do usuário.
- Após a ativação, o app recarrega automaticamente e passa a usar o novo shell em cache.
- O app verifica atualizações no carregamento, ao voltar do background e ao recuperar conexão com a internet.
- O registro do Service Worker usa `updateViaCache: "none"` e o pré-cache baixa os arquivos com `cache: "reload"`, reduzindo risco de instalar assets antigos vindos do cache HTTP.
- O cache desta versão é `intervalo-v1-7-0`.
- `DATA_VERSION` permanece `7`; não houve mudança no schema dos dados do usuário.

## Mudanças da V1.6.5

- Removida da lista do histórico a linha **“Intervalo da dose”**, reduzindo informação redundante no card.
- O selo de tempo decorrido agora comunica também o estado do intervalo daquele registro: **vermelho suave** enquanto ainda não chegou ao intervalo configurado e **verde suave** quando o intervalo já foi concluído.
- A cor do selo é recalculada automaticamente enquanto o histórico permanece aberto, portanto pode mudar de vermelho para verde sem recarregar a tela.
- Mantidos o horário absoluto (`às 05:43h`) e o tempo relativo (`19 min atrás`, `06:52h atrás`, `2 dias atrás`) como informações visuais distintas.
- Cache do Service Worker atualizado para `intervalo-v1-6-5`.

## Mudanças da V1.6.4

- Substituídos os ícones da PWA pelo novo conceito visual do **abacaxi com relógio e canudo**, com arquivos específicos para `192x192`, `512x512`, Apple Touch Icon e favicon.
- Os caminhos dos ícones receberam sufixo de versão para reduzir problemas de cache durante testes de atualização da PWA.
- O histórico agora mostra a hora exata no formato **`às 05:43h`**, diferenciando claramente o horário absoluto.
- Cada anotação do histórico também exibe quanto tempo passou desde o consumo, em estilo visual secundário: **`9 min atrás`**, **`01:25h atrás`** ou **`2 dias atrás`**.
- O tempo decorrido é atualizado enquanto a tela de histórico permanece aberta, sem alterar os dados persistidos.
- Cache do Service Worker atualizado para `intervalo-v1-6-4`.

## Mudanças da V1.6.3

- O corpo do card agora exige **dois toques rápidos** para anotar uma dose ou abrir o fluxo de confirmação quando ainda existe countdown.
- Um toque isolado não cria nenhuma anotação. O primeiro toque recebe feedback visual discreto enquanto o app aguarda o segundo toque por até 430 ms.
- O gesto foi implementado com detecção própria em vez de depender de `dblclick`, visando comportamento mais consistente em Chrome Android, Samsung Internet, Safari iOS e navegadores desktop.
- O **toque e segure** continua abrindo `Anotar dose` para horários retroativos.
- `touch-action: manipulation` evita o zoom de duplo toque do navegador sem impedir a rolagem vertical da lista.
- Cache do Service Worker atualizado para `intervalo-v1-6-3`.

## Mudanças da V1.6.2

- O card principal da tela inicial foi reorganizado em **duas linhas**: o bloco superior concentra ícone, estado, nome e informações auxiliares; a linha inferior concentra a ação principal (por exemplo, **Anotar nova dose** ou **⛔ Aguarde: 00:05:47**).
- A linguagem da interface passou de **registrar** para **anotar** nas ações principais, toasts e fluxos de anotação retroativa.
- O diálogo **Anotar consumo** no mobile agora abre em **tela cheia**, com rolagem do conteúdo e barra de ações fixa no rodapé.
- O formulário de anotação retroativa substituiu os campos numéricos por **wheel pickers** de horas e minutos, visualmente alinhados com o editor de bebidas.
- O menu da bebida passou a usar o texto **Anotar dose** no lugar de **Anotar dose**.

## Mudanças da V1.6.1

- Linguagem dos alertas de sobreposição revisada para **“Tomou dose por cima da outra”** na tela principal, histórico e edição de registro.
- O detalhe da edição agora usa a forma curta: **“Você tomou X após o anterior, quando ainda faltava Y.”**
- A ajuda “Ao salvar, a ordem do histórico...” passou a usar `.clean-optional`, ficando oculta no modo clean atual.
- Adicionado `DEVELOPMENT.md` com documentação técnica detalhada da arquitetura, modelo de dados, fluxos, estados, manutenção, testes e processo de release.

- O botão lateral `Horário` foi substituído por `Histórico`.
- Cada bebida agora pode abrir um histórico filtrado somente com seus próprios registros.
- Toque e segure o corpo do card por cerca de 600 ms para abrir `Anotar dose`.
- O long press é cancelado quando o gesto vira rolagem, evitando registros acidentais ao navegar pela lista.
- O menu `⋮` agora reúne `Anotar dose`, `Editar bebida` e `Excluir bebida`.
- O registro retroativo pelo long press/menu pula a confirmação intermediária, mas continua exibindo o alerta dentro do formulário quando existe intervalo em andamento.
- O toque normal mantém o comportamento anterior: registra agora quando permitido e mostra a confirmação quando o intervalo ainda está contando.


## Mudanças da V1.5.1

- Cada bebida pode ativar a opção **Perguntar se é dose inteira ou meia**.
- Quando a opção está ativa, um novo registro é criado imediatamente como **Inteira**; em seguida, um popup simples permite trocar o registro para **Meia dose**. Fechar o popup sem escolher mantém **Inteira**.
- O tamanho da dose fica salvo no próprio evento (`doseSize: "full" | "half"`). Registros antigos permanecem sem classificação, evitando inventar informação retroativamente.
- O histórico mostra um selo **Meia** ou **Inteira** nos registros que possuem essa informação.
- A tela de edição de um registro permite corrigir posteriormente entre **Meia** e **Inteira**.
- A tela principal mostra a classificação da dose mais recente junto de `Tomou às` ou `Anterior`, quando disponível.
- Ativar/desativar a pergunta em uma bebida afeta apenas novos registros; classificações já salvas permanecem no histórico.
- Dose inteira/meia **não altera o countdown nem a detecção de registros durante o intervalo** nesta versão. O intervalo continua sendo exatamente o configurado para a bebida.
- O editor mobile foi compactado levemente nos ícones e wheel pickers para acomodar a nova opção sem sacrificar a barra fixa de ações.
- Modelo de dados atualizado para a versão 6, com normalização automática dos dados existentes.

### Modelo relevante

```js
// Bebida
{
  id: "...",
  name: "Cafe",
  icon: "🍬",
  intervalMinutes: 60,
  askDoseSize: true
}

// Registro
{
  id: "...",
  drinkId: "...",
  consumedAt: 1788541200000,
  intervalMinutes: 60,
  doseSize: "full" // ou "half"; null em registros antigos/não classificados
}
```


## Mudanças da V1.4.6

- No mobile, o cadastro/edição de bebida passa a ocupar toda a altura útil da viewport.
- O conteúdo do editor possui rolagem própria, enquanto os botões **Cancelar** e **Salvar** permanecem sempre visíveis em uma barra fixa na parte inferior do painel.
- Espaçamentos verticais, seletor de ícones e wheel pickers foram levemente compactados no mobile sem reduzir os botões principais nem comprometer os alvos de toque.
- Em telas particularmente baixas, o editor adota uma compactação adicional dos ícones e dos wheels.
- No desktop, o comportamento continua sendo o modal centralizado tradicional.
- O modelo de dados e a lógica dos wheel pickers não foram alterados.


## Mudanças da V1.4.5

- Os horários `Tomou às` e `Anterior` exibem o `h` como unidade menor e mais discreta.
- O cadastro/edição substitui os campos numéricos de horas e minutos por wheel pickers próprios, com rolagem por toque e `scroll-snap`, para comportamento consistente em Android e iOS.
- Horas variam circularmente de `00` a `24`; minutos variam de `00` a `59`.
- Ao selecionar `24` horas, os minutos são automaticamente fixados em `00` para preservar o limite máximo de 24 horas.
- Os valores continuam sendo persistidos no mesmo campo `intervalMinutes`; não houve mudança no modelo de dados.


## Mudanças da V1.4.2

O seletor de ícones agora usa apenas duas linhas e rolagem horizontal, pensado principalmente para uso por toque no celular.

O catálogo atual, na ordem exibida, é:

`🍬 💊 🍍 🍭 🥃 🍺 🍷 🥂 👃 🐽 🌿 🚬 🌻 ❄️ 🍫 🍄 🍪 🌵 💧 💦 😵‍💫 🕳️ 💤 💫 🥶 🥵 🌊 🪄 🧪 👽 😈 🧙‍♂️`

O catálogo atual é composto pelos emojis escolhidos para o projeto:

```text
🍄 💦 🍄‍🟫 🍬 💊 🍍 🍭 🍫 🍺 🍷 🥂 🚬 🌿 🌻 🌵 💨
❄️ 🧃 💧 👃 🕳️ 💤 💫 🥶 🥵 😵‍💫 🌊 🪄 🧪 👽 😈 🧙‍♂️
```

A lista do seletor não é mais usada para validar dados já gravados. Isso significa que uma bebida antiga pode continuar usando um emoji que não está mais disponível no catálogo atual sem ter seu ícone substituído. Ao editar essa bebida, o ícone antigo aparece como opção selecionada junto do catálogo atual.

Internamente os ícones continuam sendo strings Unicode, portanto o modelo já preserva qualquer emoji válido sem exigir biblioteca ou arquivo de imagem.

## Principal mudança da V1.4

A V1.4 adiciona edição completa das bebidas e reorganiza as ações da tela principal.

Agora o botão lateral `⋮` abre a edição da bebida, permitindo alterar:

- nome;
- ícone;
- intervalo em horas e minutos.

O botão destrutivo foi removido da tela principal e passou a ficar dentro da edição da bebida.

## Alteração de intervalo

Alterar o intervalo da bebida afeta somente registros futuros.

Cada evento continua armazenando o intervalo que estava configurado quando ele foi criado:

```js
{
  id: "...",
  drinkId: "...",
  drinkName: "Vinho",
  drinkIcon: "🍷",
  consumedAt: 1788541200000,
  intervalMinutes: 60
}
```

Portanto, se uma bebida passar de 60 para 90 minutos, os registros antigos continuam sendo avaliados com 60 minutos e os próximos passam a usar 90.

## Exclusão de bebida

Ao escolher **Excluir bebida**, o app mostra três opções:

1. **Cancelar**
2. **Excluir bebida e manter histórico**
3. **Excluir bebida e registros**

### Excluir bebida e manter histórico

A bebida é removida da tela principal, mas seus eventos permanecem no histórico.

Para isso, cada evento passa a guardar também um snapshot do nome e do ícone da bebida. Registros de uma bebida excluída continuam podendo ter data/horário corrigidos ou ser excluídos individualmente.

### Excluir bebida e registros

Remove definitivamente a bebida e todos os eventos ligados a ela.

## Histórico

Mantém as funções da V1.3:

- timeline agrupada por dia;
- destaque permanente de registros ocorridos durante um intervalo;
- edição de data e horário;
- exclusão individual de registros;
- recálculo automático dos alertas depois de qualquer correção.

Quando a bebida já foi excluída, o histórico mostra uma indicação discreta de que o registro foi mantido.

## Estados da tela principal

1. **Sem registro** — bebida sem registros.
2. **Intervalo em andamento** — o intervalo do registro mais recente ainda está contando.
3. **Consumo durante o intervalo** — houve novo registro antes de completar o intervalo anterior.
4. **Intervalo concluído** — o intervalo do registro cronologicamente mais recente terminou.

## Compatibilidade

A chave de dados continua sendo:

```text
balada-v1-data
```

Os dados da V1.3/V1.3.1 são normalizados automaticamente para o modelo da V1.4. A migração antiga de `balada-v1-drinks` também continua disponível.

## Outras funções mantidas

- Cadastro de bebidas.
- Ícones predefinidos.
- Intervalo em horas e minutos, até 24 horas.
- Registro imediato ou retroativo em até 48 horas.
- Reordenação das bebidas pelo consumo cronologicamente mais recente.
- Desfazer novo registro durante 7 segundos.
- Persistência com `localStorage`.
- Manifest e Service Worker mantidos para uso futuro como PWA.

## Aviso de escopo

Os contadores e alertas representam apenas os intervalos configurados pelo próprio usuário. O aplicativo não determina quando é seguro consumir mais álcool.

## Rodar com XAMPP

Coloque a pasta dentro de `htdocs`, por exemplo:

```text
C:\xampp\htdocs\balada-v1
```

Depois acesse:

```text
http://localhost/balada-v1/
```

Para testar no celular na mesma rede, use o IPv4 do computador, por exemplo:

```text
http://192.168.0.10/balada-v1/
```

## Cache ao atualizar

O cache do Service Worker desta versão é:

```text
intervalo-v1-6-2
```

Se uma versão anterior continuar aparecendo, use `Ctrl + F5`. Se necessário, remova o Service Worker/cache do site nas ferramentas do navegador.

## V1.4.4 — refinamentos de interface

- Título da tela principal alterado para **Início**.
- Aviso de escopo movido para depois da lista de bebidas, com espaçamento próprio.
- Cards concluídos usam **Anterior:** no lugar de “Último registro”.
- Cards em contagem usam **Tomou às:** e exibem o contador como **Aguarde: HH:MM:SS**.
- O texto redundante “Intervalo em andamento” foi removido do card em contagem normal.
- Timeline do histórico reorganizada no celular: o horário passa para dentro do card, liberando largura e evitando sobreposição/cortes.
- Footer discreto com `v1.4.4 · By: arielkeybob`.

### Ajustes da V1.4.4

- Countdown em andamento usa `⛔ Aguarde: HH:MM:SS`.
- Horários dos cards usam sufixo `h`, como `Tomou às 18:05h` e `Anterior: 18:05h`.
- Cadastro usa **Intervalo entre doses**.
- A mensagem visual de máximo de 24 horas foi removida; a validação do campo continua existente.
- O aviso sobre alterações futuras de intervalo foi marcado como `.clean-optional` e fica oculto enquanto o `<body>` tiver `.clean-mode`, preparando uma futura configuração de interface limpa.


## V1.8.7 — entrada pelo navegador

- O aplicativo completo agora é inicializado apenas quando executado em modo instalado/standalone.
- Ao acessar a URL diretamente pelo navegador, é exibida uma página simples com logo e orientação de instalação.
- Em navegadores Chromium compatíveis, o app captura `beforeinstallprompt` e oferece um botão próprio **Instalar app**.
- Em navegadores sem esse evento, a página mostra instruções adequadas para iPhone/iPad, Android, Safari no macOS ou desktop.
- Não há botão artificial de “Abrir app”, pois a Web não oferece um mecanismo universal e confiável para lançar uma PWA já instalada.
- O Service Worker continua ativo na página pública para manter os requisitos e a experiência de instalação.
- Cache PWA: `intervalo-v1-8-7`.


## V1.8.8 — fluxo de instalação

- A landing page de instalação foi simplificada: logo, nome, uma frase curta e a ação de instalação/orientação necessária.
- O app não exibe mais **“App instalado”** apenas porque o usuário aceitou o prompt ou porque o evento `appinstalled` disparou.
- Após o aceite, a interface usa o estado neutro **“Instalação iniciada”** e orienta a aguardar o ícone aparecer no aparelho.
- Em navegadores compatíveis, `navigator.getInstalledRelatedApps()` é usado como verificação adicional da PWA instalada.
- O manifesto passou a declarar explicitamente `id: "./"` e uma relação `webapp` com ele mesmo para permitir essa detecção em navegadores compatíveis.
- Se o navegador voltar a emitir `beforeinstallprompt`, o botão **Instalar** volta a aparecer, evitando ficar preso em um falso estado de sucesso.
- Cache PWA: `intervalo-v1-8-8`.


## V1.8.9 — onboarding e cadastro de bebida

- O ícone `+` do estado vazio agora é um botão funcional e abre o cadastro, assim como **Adicionar bebida**.
- Novos cadastros não começam mais com um ícone pré-selecionado.
- O formulário não abre mais o teclado automaticamente; o campo de nome recebe foco somente quando o usuário toca nele.
- `Nome` e `Ícone` são marcados com um `*` vermelho discreto, sem texto “Obrigatório”.
- Ao salvar sem preencher os campos obrigatórios, somente os campos correspondentes ficam destacados em vermelho e a tela rola até o primeiro erro sem abrir o teclado.
- O erro desaparece conforme o usuário corrige o campo.
- A seção **Intervalo entre doses** ganhou hierarquia tipográfica e espaçamento próprios para separar melhor o título dos labels **Horas** e **Minutos**.
- Cache PWA: `intervalo-v1-8-9`.


## V1.9.0 — interface configurável

- Nova preferência **Interface limpa e compacta** em **Configurações → Aparência**.
- A opção vem ativada por padrão.
- Quando ativada, mantém ocultos textos e explicações auxiliares já marcados como opcionais no app.
- Quando desativada, esses conteúdos voltam a aparecer.
- Alertas importantes, erros, estados de intervalo e disclaimers de segurança não são controlados por essa opção.
- A preferência fica salva junto aos dados locais do aplicativo.
- `DATA_VERSION` atualizado para `8`, com migração automática de versões anteriores usando `cleanInterface: true`.
- Novo `ROADMAP.md` separa explicitamente **Exportar/importar bebidas** de **Fazer backup/restaurar backup**, além de registrar mesclagem de bebidas, relações configuradas entre bebidas e compartilhamento temporário entre usuários autorizados.
- Cache PWA: `intervalo-v1-9-0`.

Consulte `ROADMAP.md` para ideias futuras em estudo.


## V1.9.1 — pacote de publicação

Esta versão mantém as funcionalidades da V1.9.0 e altera a forma de distribuição do ZIP.

Os arquivos do projeto são entregues diretamente na raiz do arquivo compactado (`index.html`, `app.js`, `styles.css`, etc.), evitando que a extração crie uma subpasta intermediária e que um `git add .` registre acidentalmente apenas exclusões no repositório.

Antes de cada commit de publicação, recomenda-se executar:

```powershell
git status
```

e confirmar que `index.html`, `app.js`, `styles.css`, `sw.js` e `manifest.webmanifest` aparecem como modificados/adicionados, e não somente como excluídos.

Cache PWA: `intervalo-v1-9-1`.


## V1.10.0 — transferência de bebidas e backup

### Exportar / importar bebidas

A interface mantém este recurso separado de backup.

- **Exportar bebidas** gera `Intervalo-Bebidas-AAAA-MM-DD.json`.
- O arquivo contém somente configurações das bebidas; não contém histórico.
- Em plataformas que suportam Web Share com arquivos, o botão de exportar usa a folha nativa do sistema, permitindo escolher WhatsApp, Arquivos, Drive e outros destinos sem criar uma ação separada chamada “Compartilhar”.
- Quando Web Share com arquivo não está disponível, o app faz download convencional.
- **Importar bebidas** abre um arquivo JSON e mostra uma prévia antes de alterar os dados.
- O usuário escolhe **Adicionar às bebidas atuais** ou **Substituir minha lista de bebidas**.
- No modo adicionar, duplicatas exatas são ignoradas.
- Substituir a lista não apaga o histórico.
- O manifest inclui `share_target` para recebimento progressivo de arquivos JSON em Android/PWAs compatíveis. A importação manual continua sendo o caminho universal.

### Backup / restauração

- **Fazer backup** gera `Intervalo-Backup-AAAA-MM-DD-HHMM.json`.
- Inclui bebidas, eventos/histórico e preferências.
- Não inclui PIN, hash do PIN, credencial WebAuthn, biometria ou sessão desbloqueada.
- **Restaurar backup** valida o arquivo e mostra bebida/registro/data antes da confirmação.
- A restauração substitui bebidas, histórico e preferências, mantendo o bloqueio configurado no aparelho.
- Arquivo de bebidas usado em Restaurar backup (e vice-versa) é rejeitado com orientação para a ação correta.
- Gravações são feitas somente após validação integral do conteúdo.

Cache PWA: `intervalo-v1-10-0`.

## V1.10.2 — aviso de atualização e configurações

O aviso consulta a versão do Service Worker em espera via GET_VERSION/MessageChannel e exibe “Atualize quando puder para vX.X.X”. Sem resposta válida em 2 segundos, mantém o texto genérico. A versão exibida é a disponível, não a instalada. O cliente antigo V1.10.1 ainda mostra o aviso antigo ao receber esta atualização; o novo aviso passa a funcionar após instalar V1.10.2, nas próximas atualizações.

Configurações: Aparência, Privacidade, Sobre a proteção, Bebidas e Backup. “Sobre a proteção” fica oculto no modo de interface limpa. Os controles de privacidade e o disclaimer continuam visíveis. Cache: `intervalo-v1-10-2`; modelo de dados permanece 8.

## V1.10.3 — hierarquia de Anotar consumo

O seletor de tempo reutiliza as classes `interval-fieldset` e `interval-fieldset-title` do cadastro de bebida, incluindo título destacado, rótulos secundários e espaçamentos mobile. O conteúdo do formulário se alinha ao início para evitar espaços verticais esticados; as ações permanecem no rodapé. Lógica de horários e dados preservada. Cache: `intervalo-v1-10-3`.

## V1.10.4 — tamanho da dose na anotação

Anotar consumo oferece Meia/Inteira antes dos horários quando askDoseSize está ativo, reutilizando o seletor do editor de eventos. Inteira é o padrão a cada abertura. Atalhos e formulário salvam a escolha diretamente, sem repetir o popup; registro direto pelo card mantém o fluxo anterior. Bebidas sem a opção preservam doseSize nulo. Há 20px extras entre os atalhos e o seletor de tempo. Cache: `intervalo-v1-10-4`; schema permanece 8.

## V1.10.5 — texto de atualização

Aviso ajustado para “Atualize quando puder para vX.X.X”, preservando a versão dinâmica. Cache: `intervalo-v1-10-5`; modelo de dados permanece 8.

## V1.10.6 — atualização das alterações de texto

Versão e cache atualizados para distribuir às PWAs instaladas os textos de privacidade e a correção dos botões: Histórico Geral no início e Histórico nos cards. Cache: `intervalo-v1-10-6`; modelo de dados permanece 8. Alterações de HTML/CSS/JS publicadas devem atualizar o Service Worker para que o fluxo de atualização do app em cache seja acionado.
