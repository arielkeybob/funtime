# Preparação FunTime 2.0

## Estado

- Branch de trabalho: `codex/funtime-v2`; base: v1.16.0, commit `7c75410` em main.
- Versão de desenvolvimento: `2.0.0-dev.1`. App, boot, SW e footers alinhados; DATA_VERSION 9 e termos 1.0.1.
- Ícones novos integrados no HTML, página de políticas, manifesto e pré-cache. Arquivos antigos permanecem disponíveis para compatibilidade e comparação, sem referências na interface atual.
- Manifesto com id `/funtime/`. Start URL e escopo relativos devem resolver para `/funtime/` no deployment final. Shell v2 não remove caches da ponte v1.
- A prévia mostra o novo ícone e bloqueia a inicialização antes de qualquer acesso a dados ou registro de SW. O fluxo v1 ainda presente no boot é material de migração, não o receptor final.
- Publicação da prévia autorizada para teste no celular: repositório `arielkeybob/funtime`, Pages em `/funtime/`, branch publicada `main`. A ponte `arielkeybob/intervalo` permanece na v1.16. Nenhum marcador `transition.json` pronto é incluído.

## Arte

Ferramenta: geração de imagens integrada, com o anexo do usuário como referência. Mestre salvo em `icons/funtime-master-v2.png`. Exportações: favicon 32, Apple 180, PWA 192 e 512, maskable 512 com margem adicional. O desenho ocupa a imagem normal; a variante maskable reduz a composição para preservar folhas, canudo e relógio no recorte circular. Inspecionar no launcher real antes do lançamento.

Prompt utilizado:

> Use case: stylized-concept. Create the final square raster master app icon for FunTime 2.0, using the attached image as concept reference. Faithfully retain the golden faceted pineapple, green leaf crown, black sunglasses with violet reflections, pink-and-white bent straw and prominent cream analog clock on the pineapple front. Polished playful 3D render, vibrant gold, lime, magenta and electric blue lighting. Dark navy-purple-blue gradient background must fill the ENTIRE square to all four corners: NO rounded tile, NO black outside corners, NO lettering, NO watermark. Center the entire pineapple including leaves and straw with generous breathing room, all important silhouette within the central 70 percent of the square for small app-icon readability and launcher masking. Clear, bold clock hands and four simple hour marks. Deliver one 1024x1024 or larger square PNG master suitable for deterministic size exports.

Reexportação local: `node scripts/export-icons.cjs`, com Sharp acessível pelo NODE_PATH do runtime de desenvolvimento. A exportação não faz geração artística e não é necessária para executar o app.

Variante maskable gerada separadamente pela mesma ferramenta e salva em `icons/funtime-maskable-master-v2.png`. Prompt: “Edit this exact FunTime pineapple-clock icon to create its Android MASKABLE variant. Keep the pineapple design, sunglasses, clock, straw, colors and 3D styling. Scale the ENTIRE subject down so all leaves, straw and pineapple fit inside a centered circle of diameter 65% of the square canvas. Seamlessly extend the navy purple electric blue background to ALL edges, with NO inset square, NO frame, NO visible image boundary, NO rounded corners. The subject must be substantially smaller than the supplied image, with generous continuous gradient space all around it. One square PNG, no text.”

Validação desta etapa: 50 testes existentes de dados/interface e 2 testes da prévia aprovados; sintaxe de app.js, sw.js, boot.js e exportador verificada. PNGs e dimensões conferidos; inspeção visual dos dois desenhos. Testes de migração entre instalações reais, launcher Android/iOS e receptor v2 ainda pendentes. Nenhum armazenamento real foi acessado.

## Próxima etapa funcional

1. Implementar receptor real seguindo TRANSITION-V2.md: confirmar ponte ativa, obter o lock compartilhado, validar/reler dados e proteção, gravar/verificar posse antes de escritas incompatíveis.
2. Distinguir instalação nova, armazenamento compartilhado e armazenamento isolado; oferecer restauração com prévia quando necessário, sem confirmar uma migração vazia.
3. Consumir pendências de compartilhamento do endereço antigo, com prévia e confirmação; preservar sessão/segurança conforme o contexto real.
4. Substituir o fluxo v1 do boot, retirar o bloqueio da prévia e testar os dois apps reais sob a mesma origem, inclusive falhas e retorno offline.
5. Preparar repositório/deployment funtime mantendo a ponte intervalo; validar Android/iOS e só então publicar o marcador ready.

O usuário autorizou commit, push e disponibilização da prévia para testar no celular. Esta fase não equivale ao lançamento funcional da v2: a tela continua informando que a instalação e transferência não estão disponíveis.
