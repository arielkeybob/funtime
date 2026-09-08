# FunTime — releases v2

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
