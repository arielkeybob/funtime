# FunTime — releases v2

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
