# 0034 — Fundo do app: imagem padrão, minha imagem ou cor sólida

Status: implementada (v2.34.0)

## Contexto

Até a v2.33.0, as telas neutras (Início, Histórico, Configurações) eram pretas (`--bg: #09090b`). Em
Aparência, dava para escolher uma foto, que aparecia escurecida por um véu de 70% (spec 0031). O
usuário pediu três coisas:
- uma **imagem padrão** já de fábrica: uma foto de DJ de frente para a pista;
- poder trocar por **outra imagem** ou por uma **cor sólida**;
- a cor sólida começa no **preto** e pode ser trocada.

A imagem padrão precisa ser muito leve, porque vai junto com o app.

Decisões do usuário:
- O cartão tem **três cartões com miniatura**, e não uma lista.
- **Cor clara é escurecida** só o suficiente para o texto continuar legível. As alternativas
  descartadas eram só cores prontas ou qualquer cor sem ajuste.
- **Quem já usava e nunca escolheu fundo passa a ver a imagem padrão.** Quem tinha uma foto continua
  com ela.

## Decisão

### Cartão "Fundo do app" (Configurações → Aparência)

- **Três opções em miniatura (2:3):**
  - **Padrão**: a própria imagem;
  - **Minha imagem**: a foto da pessoa ou um "+";
  - **Cor sólida**: a cor.
- **Rádios de verdade** num `fieldset` (teclado e leitor de tela). A marcada ganha borda clara e
  rótulo em negrito.
- **A troca aparece na hora**, sem botão Salvar. A tela de Configurações é neutra, então o fundo novo
  aparece atrás do próprio cartão.
- **Sem botão "Voltar ao padrão".** O cartão **Padrão** é a volta ao padrão, a um toque e com o nome
  dizendo isso. Na Cor sólida, o **Preto** vem primeiro, como "Preto (padrão)". "Apagar tudo deste
  aparelho" também volta ao padrão.
- **Minha imagem:**
  - **Sem foto guardada:** tocar abre o seletor de arquivos. A marcação só muda depois que a imagem é
    salva. Se a pessoa cancelar ou der erro, fica o fundo anterior.
  - **Erros:** os mesmos da 0031 (arquivo que não é imagem, que não abre, grande demais, sem espaço),
    em aviso.
  - **Com foto guardada:** um toque aplica a foto. Embaixo aparecem **Trocar imagem** e **Remover**.
  - **Trocar para Padrão ou Cor não apaga a foto.**
  - **Remover** apaga a foto. Se ela estava em uso, volta ao Padrão ("Imagem removida. Voltou para a
    imagem padrão.").
- **Cor sólida:**
  - **Paleta:** 7 cores escuras com nome no `aria-label` (Preto, Grafite, Azul-noite, Petróleo,
    Verde-musgo, Vinho, Café), mais **Outra cor** (`<input type="color">` nativo).
  - **Enquanto arrasta** (`input`) é só prévia. **Ao confirmar** (`change`), salva.
  - **Linha de status:** o nome da cor ou "Outra cor (#hex)".
  - **Cor clara:**
    - é escurecida mantendo o tom, até luminância ≤ 0,04 (`legibleBackgroundColor`);
    - com esse teto, `--muted` (#a1a1aa) fica em 4,5:1 e o branco bem acima;
    - a linha de status ganha "Ajustada para o texto continuar legível.";
    - o que fica guardado é a cor escolhida, e o ajuste é feito na hora de mostrar.
  - **Sem véu:** a cor já é a final.
  - **Barra do sistema** (`theme-color`) nas telas neutras acompanha a cor. Na tela de bloqueio e nos
    módulos, continua como antes.
- **Imagens (padrão e da pessoa):** mesmo véu de 70% e mesma sombra no aviso do rodapé da 0031. Na
  miniatura, o véu é de 45%, para a imagem continuar reconhecível.

### Onde vale

- **Fundo vale:** Início, Histórico e Configurações.
- **Não muda:**
  - Eventos e Amigos (cor e desenhos próprios, specs 0028/0031/0033);
  - tela de bloqueio e primeiro aceite (pretos e opacos);
  - diálogos neutros (sólidos).
- **Tela larga:** `cover` centralizado. Como a imagem é em pé, o computador mostra a pista e o
  público, escurecidos.

### Imagem padrão

- **Arquivo:** `images/fundo-padrao.webp`, 720×1280 (mesma proporção do original de 941×1672),
  **28 KB**. Entra no `APP_SHELL` do `sw.js` para funcionar offline desde a primeira abertura. O PNG
  original (1,9 MB) não vai para o repositório.
- **Como foi gerado:**
  `ffmpeg -i original.png -vf "scale=720:1280:flags=lanczos" -c:v libwebp -quality 50 -compression_level 6 -preset photo images/fundo-padrao.webp`
  Foi usado o `ffmpeg-static` do projeto. Com o véu de 70%, a compressão não aparece.

### Dados

- **Chave:** a mesma, `funtime-background-v1`. Fica só neste aparelho: não entra no backup nem na
  nuvem, e `DATA_VERSION` não muda.
- **Formato v2:** `{ version: 2, mode: "default" | "image" | "color", image, color, updatedAt }`.
  Guarda a foto e a cor juntas, para trocar de modo sem perder nada.
- **Leitura** (`parseStoredBackground`):
  - `version: 1` com imagem (0031) vira `{ mode: "image" }`;
  - ausente, inválido, modo desconhecido ou "image" sem foto viram o padrão;
  - nunca dá erro.
- **Gravação:** se a gravação falhar, o fundo vale até fechar o app, com o aviso "Não foi possível
  salvar esta configuração.". Foto que não cabe dá o erro de espaço e não é aplicada.

### Código

- **`src/ui/app-background.js`:** `DEFAULT_BACKGROUND_IMAGE`, `DEFAULT_BACKGROUND_COLOR`,
  `BACKGROUND_COLORS`, `legibleBackgroundColor`, `relativeLuminance`, `defaultBackgroundSetting`, e
  `parseStoredBackground`/`serializeBackground` no formato v2.
- **`app.js`:**
  - `applyAppBackground(setting)`: `data-app-background` vale `"image"` ou `"color"`; a camada
    `#app-background` recebe a imagem ou a cor.
  - `syncAppBackgroundControls`.
  - `applyViewTheme` usa `neutralThemeColor`.
  - `clearAppBackground` (usado por `reset.js`) volta ao padrão.
- **`styles.css`:** véu e sombra do rodapé só em `[data-app-background="image"]`, mais os estilos
  das opções e das bolinhas de cor.

**Não muda:** dados, backup, exportação de bebidas, regras do Firestore e políticas.

## Plano de teste

- `node --input-type=module --check < app.js`, `node --check sw.js`, `node --check boot.js`.
- **`tests/app-background.test.cjs`:**
  - ida e volta do v2 nos três modos;
  - v1 vira imagem;
  - inválido, modo desconhecido e "image" sem foto viram o padrão;
  - `legibleBackgroundColor` mantém as escuras e escurece as claras até o limite, mantendo o tom;
  - as cores prontas já são legíveis.
- **`tests/fundo-browser.test.cjs`:**
  - de fábrica, imagem padrão com véu no Início, no Histórico e nas Configurações, e nada guardado;
  - o WebP abre (720×1280);
  - Eventos e Amigos sem a camada;
  - Minha imagem sem foto abre o seletor e não troca nada antes de salvar;
  - foto aplicada;
  - Cor sólida começa no preto, sem véu, e a barra acompanha a cor;
  - a foto continua guardada;
  - Vinho;
  - cor clara ajustada, com o aviso, e com a cor original guardada;
  - a foto volta com um toque;
  - fora do backup;
  - recarregar mantém;
  - Remover em uso volta ao padrão, com a cor lembrada;
  - formato v1 continua como imagem.
- **`tests/lock-screen-browser.test.cjs`:** com Cor sólida, o bloqueio fica nas cores neutras e
  desbloquear devolve a cor.
- **Afeta algum tutorial?** Sim, só as imagens e os vídeos, porque quase todo tópico passa pelo
  Início ou pelas Configurações.
  - `tutorials:check --visual` apontou 10 imagens em `introducao`, `cadastrar-bebida`,
    `registrar-dose`, `privacidade`, `eventos`, `amigos` e `backup-e-bebidas`.
  - Todos os 9 tópicos foram regerados, para os vídeos também mostrarem o fundo.
  - Legendas iguais.
  - Nenhum tutorial mostra o cartão "Fundo do app".
