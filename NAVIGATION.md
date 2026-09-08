# Navegação e Voltar — FunTime 2.0.1

Implementação local, sem publicação. O app antes alterava `hidden` e abria dialogs sem entradas no histórico. O sistema podia sair da PWA porque não havia um passo interno para retornar.

`navigation.js`, carregado depois de app.js e reset.js, integra as camadas visíveis à History API. Observa mudanças de interface, registra uma entrada por camada e usa as rotinas existentes de cancelamento ao receber `popstate`. Fechar pelos botões também consome as entradas correspondentes. Transições no mesmo ciclo e mudanças enquanto uma travessia assíncrona está pendente são reconciliadas após `popstate`.

## Mapa de retorno

| Tela ou camada | Voltar |
| --- | --- |
| Início, sem diálogo | Comportamento do navegador/sistema; não há entrada sentinela prendendo o usuário |
| Histórico geral ou de uma bebida | Início |
| Edição de registro histórico | Histórico que permaneceu aberto, incluindo seu filtro |
| Configurações | Início |
| Seção expandida Redefinir e apagar | Recolhe a seção; próximo Voltar sai de Configurações |
| Menu de uma bebida | Início |
| Cadastro | Tela de origem, descartando o rascunho como Cancelar |
| Editar / excluir / anotar horário pelo menu | Menu permanece abaixo e reaparece ao fechar |
| Excluir pelo editor | Editor permanece aberto com o rascunho; exclusão efetiva fecha os pais que perderam a bebida |
| Edição do catálogo | Conclui o modo de edição; mudanças do catálogo já salvas são preservadas |
| Caneta (V2.0.5) | Ativa apenas exclusão; Voltar encerra esse modo, sem sair do cadastro |
| Pressão longa / arraste de ícone (V2.0.5) | Escape cancela o gesto; fechar o cadastro ou encerrar a interação descarta a prévia sem gravar |
| Painel de emojis | Fecha apenas o painel; preserva cadastro e modo de edição |
| Aviso de intervalo | Tela de origem |
| Anotar horário após aviso | Aviso de intervalo, que permanece abaixo |
| Meia/inteira | Fecha e mantém o registro já existente; mesma regra do botão Fechar |
| Prévia de importar bebidas | Configurações/origem; limpa importação pendente, sem aplicar |
| Prévia de restaurar backup | Configurações; limpa restauração pendente, sem aplicar |
| Escolher proteção | Tela ou prévia de redefinição de origem |
| Criar PIN | Escolher proteção; limpa campos e invalida configuração assíncrona |
| Redefinir: primeira etapa, todas as quatro ações | Fecha a prévia sem executar |
| Redefinir: autenticação | Retorna à seleção preservada e recalcula prévia; nova identidade invalida autenticação anterior |
| Configurar proteção a partir da redefinição | Mantém a prévia abaixo; ao retornar exige confirmação e autenticação normais |
| Políticas e informações | Navegação de documento normal; o link Voltar reutiliza o histórico quando veio do app |
| Índice das políticas | Âncoras e rolagem nativas do navegador |
| Aceite, instalação, migração, espera de outra janela e bloqueio | Não são rotas dispensáveis; Voltar não aceita termos, não migra dados nem desbloqueia |
| Toasts, erros e aviso de atualização | Não criam rotas; conservam sua dispensa/ação explícita |
| Teclado, seletor de arquivo, compartilhamento, biometria e selects nativos | Controlados pelo sistema; o app trata o retorno somente quando o navegador o entrega |

## Persistência, segurança e compatibilidade

O histórico guarda somente identificador da sessão de navegação, profundidade e nome da tela e ID do filtro do histórico. Não guarda conteúdo das bebidas, formulários, PINs ou autorização de exclusão. Recarga e retorno de políticas recuperam Configurações ou Histórico (validando o ID filtrado contra os dados atuais); formulários e subetapas não são reconstruídos após descarregar o documento. Entradas antigas de formulários são consumidas; Avançar não reabre operações encerradas.

Bloquear fecha diálogos e invalida configurações de segurança em andamento. Voltar durante derivação de PIN ou cadastro biométrico impede a gravação tardia da configuração; uma credencial eventualmente criada no autenticador é administrada pelo sistema. Retornar da autenticação de exclusão invalida a operação mesmo se o resultado chegar depois.

Usa History API/popstate, sem detecção de Android/iOS e sem depender da Navigation API. `closedby="none"` evita que navegadores recentes consumam o mesmo gesto no fechamento nativo do dialog; Escape e o evento cancel dos navegadores anteriores usam o mesmo retorno por camada. Não é possível garantir que todos os sistemas entreguem gestos ou controles nativos da mesma forma.

Referências: [History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API), [popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event) e [dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

## Validação

Resultado final em 08/09/2026: cinco verificações de sintaxe e 48 testes aprovados, com os oito arquivos de teste abaixo executados em uma única chamada com `--test-concurrency=1`. A regressão de restauração detectou e permitiu corrigir a disputa entre recarga e travessia do histórico; a navegação suspende a reconciliação antes dessa recarga. Dados reais preservados.

Sintaxe: `node --check app.js`, `sw.js`, `boot.js`, `reset.js` e `navigation.js`.

Regressões: `node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs tests/receiver.test.cjs tests/v2-preview.test.cjs tests/release.test.cjs`.

Navegador: `node --test tests/navigation-browser.test.cjs tests/receiver-browser.test.cjs`, com Playwright no NODE_PATH e Edge. Perfil e origem temporários, viewport 390×844 e modo instalado simulado; não acessa armazenamento real. A suíte de navegação percorre telas, diálogos aninhados, emojis, redefinição em duas etapas, fechamento por Escape/botões, ciclos repetidos, mudanças síncronas, recarga, retorno de políticas e Avançar. A suíte do receptor verifica também atualização do SW, transferência e reabertura offline.

Pendente em aparelhos: Android (Chrome, Edge, Samsung Internet e navegador/PWA compatível), iOS (Safari e navegadores utilizados pelo usuário, aba e instalação), gesto/botão físico de Voltar, teclado aberto, biometria real e seletores nativos. Repetir a tabela, alternar Voltar e botões do app rapidamente, bloquear com modal aberto e testar saída no Início. A execução em Edge não equivale à validação desses sistemas.

App, boot, footer e SW em 2.0.1; cache `funtime-v2-0-1`. DATA_VERSION 9 e políticas/aceite 1.0.1 preservados. `transition.json` mantém o anúncio 2.0.0 já publicado; só atualizar o marcador após verificar uma publicação autorizada.
