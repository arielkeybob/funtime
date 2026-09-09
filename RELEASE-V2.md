# FunTime — releases v2

## V2.0.9 — cancelar contagem atual

Após confirmação, remove somente a dose da contagem ativa, sem adicionar marcador ao histórico. Registros anteriores preservados; leitura dos marcadores da v2.0.8 mantida por compatibilidade. Ícone da bebida exibido na exclusão e confirmação de cancelamento. App/boot/SW/footers 2.0.9, cache `funtime-v2-0-9`, DATA_VERSION 9 e aceite preservados. Commit e push solicitados.

Validação funcional: 23 testes aprovados em audit, countdown-menu-browser e navigation-browser; sintaxe app.js/sw.js aprovada. Dados fictícios em perfil isolado; celular real não testado.

## V2.0.8 — contagem e formulários

Menu da bebida separado em Dose e Cadastro. Desfazer contagem atual aparece somente com contador ativo, pede confirmação e encerra apenas o contador: dose, horário e intervalo original permanecem no histórico, com a indicação Contagem desfeita. Confirmações antigas são revalidadas e falha de gravação mantém a contagem. O marcador opcional countingStoppedAt é preservado em backup/restauração; dados antigos continuam válidos, sem migração de schema (DATA_VERSION 9). Horário do registro usa seletores de hora e minuto dentro do formulário, evitando o relógio nativo cortado. Contagem do intervalo usa o mesmo componente visual de Bloquear novamente. Exclusão passa a dizer Excluir bebida e histórico.

App/boot/SW/footers 2.0.8, cache `funtime-v2-0-8`; aceite preservado. Commit e push solicitados pelo usuário. Layout inspecionado no Edge em viewport móvel e campos verificados em larguras de 320 e 390px; celular real e atualização da PWA instalada no aparelho não testados.

Validação: 46 testes aprovados em audit, countdown-menu-browser, icon-reorder-browser, navigation-browser, receiver-browser, release, reset, touch-debug e ui; sintaxe de app.js/sw.js/boot.js/navigation.js e diff sem erros. Inclui confirmação cancelada/obsoleta, falha de gravação, persistência e backup do encerramento, novo consumo, edição de horário, atualização para 2.0.8 e reabertura offline em perfis isolados, sem alterar armazenamento real.

## V2.0.7 — ocultar diagnóstico na interface limpa

Solicitados ajuste, commit e push. Diagnóstico usa `clean-optional`; Interface limpa o oculta e desativar a preferência o revela. Voltar ignora seções ocultas. App/boot/SW/footers 2.0.7, cache `funtime-v2-0-7`; DATA_VERSION 9 e aceite preservados. A melhora do toque da v2.0.6 foi confirmada pelo usuário e pelo relatório da sessão, sem generalizar para outros aparelhos.

Validação: sintaxe app.js/sw.js/boot.js/navigation.js, diff sem erros e quatro testes aprovados nas suítes icon-reorder-browser, navigation-browser e touch-debug, incluindo visibilidade conforme preferência, gestos, navegação e exportação. Perfil isolado no Edge; sem alteração do armazenamento real. Esta versão não foi testada em aparelho real nem em atualização da PWA instalada.

## V2.0.6 — estabilidade e diagnóstico de toque

Toque passa a acompanhar Touch Events por contato, com tolerância de 18px na espera, preservando cancelamento real e rolagem. Mouse/caneta mantêm Pointer Events. Diagnóstico opt-in nas Configurações, somente em memória, com exportação de relatório técnico sem dados do catálogo ou histórico. App/boot/SW/footers 2.0.6 e cache `funtime-v2-0-6` preparados. DATA_VERSION 9 e aceite preservados. Publicação em continuidade à melhoria autorizada; validação do usuário no celular pendente.

Validação: sintaxe app.js/sw.js/boot.js/touch-debug.js/navigation.js e diff sem erros. 44 cenários aprovados em audit, icon-reorder-browser, touch-debug, navigation-browser, reset, ui, release e receiver-browser; navegação e gestos repetidos após ajustar a seleção da seção de redefinição no teste para coexistir com diagnóstico. Cobertura adicional: contato largo/pressão variável, oscilação de 12px na espera, pointercancel que não encerra Touch Events, rolagem após movimento pequeno, relatório exportado sem nomes/emojis, desativação após recarga, limites de tempo/memória, atualização e offline. Perfis isolados, sem armazenamento real. Confirmar o comportamento no celular com diagnóstico ligado/desligado; não se afirma que o relato está resolvido sem essa confirmação.

## V2.0.5 — segurar para organizar e soltar na lixeira para excluir

Implementação e commit/push autorizados após validação. Pressão de 500ms ativa arraste animado; deslize antecipado mantém rolagem. Soltar na grade salva ordem; soltar na lixeira vermelha exclui apenas a opção do catálogo, com Desfazer. Caneta ativa somente × vermelhos; arraste desativado nesse modo. Teclado: Alt + setas/Home/End. Sem menu/alças. App, boot, SW e footers 2.0.5; cache `funtime-v2-0-5`; DATA_VERSION 9, aceite e marcador preservados.

Testes com dados fictícios em perfil isolado, sem modificar armazenamento real. Validação em celular real e leitor de tela permanece pendente; conferir deployment após o push.

Validação final: sintaxe app.js/sw.js/boot.js/navigation.js e `git diff --check`; 42 testes aprovados nas suítes audit, icon-reorder-browser, navigation-browser, receiver-browser, release, reset e ui. Edge em 390×844: toque rápido, pressão longa sem movimento, deslize antecipado, prévia sem gravação, mouse e toque/CDP, reordenar, lixeira, cancelamento, Desfazer, falha de gravação, modo de exclusão sem arraste, persistência, rolagem nativa e nas bordas com 100 ícones, catálogo vazio e movimento reduzido. Capturas da lixeira e do modo de exclusão inspecionadas. Atualização para 2.0.5 e reabertura offline aprovadas no perfil isolado.

## V2.0.4 — edição compacta e arraste animado

Commit e push solicitados pelo usuário. A caneta abre Reordenar ícones / Excluir ícones; modos exclusivos com alça ou × no canto, sem aumentar os cards. Arraste com cópia seguindo o ponteiro, vaga e deslocamento animado dos demais ícones. Salva ao soltar e oferece Desfazer; cancelamento e falha preservam a ordem anterior. Menu e modos integrados ao Voltar. App, boot, SW e footers 2.0.4; cache `funtime-v2-0-4`; DATA_VERSION 9, aceite e marcador de descoberta preservados.

Validação visual no Edge em 390×844, com dados fictícios. Testes incluem prévia sem gravação, modos exclusivos, mouse/toque simulado, teclado, cancelamento, falha, Desfazer, persistência, catálogo vazio, ícone fora do catálogo, rolagem com 100 ícones, movimento reduzido e navegação. Validação em celular real e leitor de tela permanece pendente. Conferir deployment após o push.

Verificações finais: sintaxe de app.js, sw.js, boot.js e navigation.js; `git diff --check`. Suítes icon-reorder-browser, navigation-browser, audit, reset, ui, release e receiver-browser: 42 cenários aprovados após atualizar a expectativa antiga 2.0.2 do teste de atualização e repetir esse cenário para 2.0.4. A atualização pelo botão e a reabertura offline preservaram os dados e a posse no perfil isolado.

## V2.0.3 — reordenar ícones

Commit e push autorizados em 08/09/2026. Alças de arraste aparecem somente no modo de edição da caneta, junto com a exclusão. Inclui teclado, cancelamento e persistência imediata da ordem no catálogo e backup. App, boot, SW e footers 2.0.3; cache `funtime-v2-0-3`. DATA_VERSION 9, aceite e marcador de descoberta preservados.

Validação da funcionalidade: 36 testes aprovados, incluindo Edge com mouse e toque simulado, teclado, cancelamento, falha de armazenamento, recarga e navegação. Layout conferido em 390×844. Celular real, leitor de tela, catálogo longo nas bordas e atualização da PWA instalada ainda não testados. Deployment deve ser conferido após o push.

## V2.0.2 — instalação

Publicação autorizada em 08/09/2026. App, boot, SW e footers 2.0.2; cache `funtime-v2-0-2`. Tela confirma instalação por evento ou detecção, remove convite contraditório e descarta respostas atrasadas. Dados, identidade e aceite preservados. O marcador de descoberta existente permanece válido e preservado. A ponte recebe manutenção própria v1.16.1 no repositório Intervalo.

Validação: sintaxe app.js/sw.js/boot.js, 23 testes Node e cenários integrados do receptor/instalação/atualização no Edge. Instalação real no launcher do celular não executada pelo agente. Confirmar deployment após o push; os registros seguintes documentam a estabilização inicial.

# FunTime 2.0.0

## Entrega estável

- Repositório principal: https://github.com/arielkeybob/funtime
- Aplicação: https://arielkeybob.github.io/funtime/
- Ponte anterior: https://arielkeybob.github.io/intervalo/ (v1.16, commit 7c75410).
- App, boot, SW e footers: 2.0.0. Cache: funtime-v2-0-0. DATA_VERSION 9 e TERMS_VERSION 1.0.1.
- Quem já usa dev.2 atualiza pelo botão Atualizar, mantendo posse, dados, preferências e identidade instalada. Quem usa v1 instala a v2 e confirma a transferência, ou restaura backup quando o armazenamento for separado.

## Validação

O usuário informou “Tudo testado e funcionando” após a lista de conferência: bebidas/histórico/preferências, proteção quando utilizada, reabertura/offline e orientação pelo ícone antigo. Registro por relato do usuário; modelo do aparelho, sistema e método de proteção não foram especificados. Não equivale a certificação universal de Android/iOS ou de todos os métodos biométricos.

Os testes automatizados cobrem migração cumulativa, falhas de gravação, exclusividade entre janelas, PIN, restauração, compartilhamento e atualização da dev.2 para a versão estável. Perfis temporários e dados fictícios; o agente não altera armazenamento real para validar.

Nesta estabilização: 65 testes Node e quatro cenários integrados no Edge aprovados, incluindo a atualização dev.2 → 2.0.0 pelo botão Atualizar e recarga offline. `node --check app.js`, `node --check sw.js` e `git diff --check` aprovados.

## Referências de marca

Nome e ícones atuais usam FunTime. Referências balada/intervalo remanescentes no código são adaptadores para chaves antigas, formatos de arquivo, cabeçalhos e recebimentos no endereço anterior. A palavra intervalo em contadores é funcional. Histórico Git/documental é preservado; removê-lo não faz parte da migração de marca.

## Ordem de publicação

1. Publicar 2.0.0 no repositório funtime e verificar Pages, shell e nova versão.
2. Somente depois, adicionar transition.json com status ready, versão 2.0.0, caminho /funtime/, protocolos compatíveis e timestamp real de ativação.
3. Confirmar a leitura do marcador pela ponte v1.16 e a manutenção de /intervalo/. O convite aparece quando a v1.16 é aberta com conexão e recebe um marcador válido; não força instalação nem transferência.

O registro de posse é distinto do marcador público. O app v1 só deixa de escrever depois que a v2 valida e assume os dados; a publicação do convite sozinha não desativa a versão anterior.

## Ativação do convite

Deployment estável confirmado no commit `a5409dd`: Pages built, index/boot/SW em 2.0.0 e ponte /intervalo/ ainda em 1.16. Marcador ready preparado após essa confirmação, com publishedAt 1788833191000. O parser da ponte original valida o mesmo arquivo publicado. Não há bump adicional do shell para adicionar esse anúncio remoto.

Validação da publicação 2.0.9: sete cenários aprovados em countdown-menu-browser, release e receiver-browser, incluindo atualização para 2.0.9 e reabertura offline. Sintaxe app.js/sw.js/boot.js e diff verificados.
