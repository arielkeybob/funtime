# 0033 — Desenhos de fundo em Eventos e Amigos

Status: implementada (v2.33.0)

## Contexto

Desde a spec 0028 (Eventos, lilás `#130e1c`) e a 0031 (Amigos, ouro `#16130b`), os dois módulos se
diferenciam do resto do app pela cor de fundo sólida. O usuário pediu um fundo no conceito do fundo de
conversa do WhatsApp, com a mesma cor sólida e desenhos em linha bem sutis por cima, mas mais limpo e
mais espaçado. Os temas:
- **Eventos:** eventos e festas.
- **Amigos:** amizade e relacionamento.

Como os arquivos são baixados junto com o app, eles precisam ser leves.

A escolha foi feita numa galeria com telas simuladas (Artifact do claude.ai), com três estilos por
módulo:
- **A, Sussurro:** espaçado, quase sem giro.
- **B, Presente:** mais denso, girando.
- **C, Dois tons:** acento e cinza alternados.

A galeria tinha controles de intensidade, espaçamento e tamanho, e o usuário podia tirar desenhos. A
escolha colada pelo usuário foi:

```
Eventos: C (Dois tons) · intensidade 1,8× · espaçamento 0,85× · tamanho 1,05×
Amigos: C (Dois tons) · intensidade 1,0× · espaçamento 0,8× · tamanho 1,0× · sem: quebra-cabeça
Diálogos: sem desenho (cor sólida)
```

Durante a implementação, o usuário mudou a parte dos diálogos: "tem que ter os desenhos também no
diálogo". Os diálogos de cada módulo levam o mesmo ladrilho.

## Decisão

- **Desenhos** (grade 24 × 24, só traço, cantos arredondados como os ícones do app). Não há copos,
  garrafas nem brinde: o app acompanha bebidas e o fundo não deve sugerir consumo.
  - **Eventos (16):** calendário, óculos escuros, mesa de DJ, serpentina, globo de luz, brilhos,
    chapéu de festa, balão, ingresso, nota musical, fone de ouvido, caixa de som, microfone, fogos,
    lua e varal de luzes.
  - **Amigos (13):** dois bonequinhos, coração, beijo, soquinho, balão de conversa, toca aqui,
    cartinha, selfie, sorriso, flecha do cupido, infinito, anel e balão de conversa com coração.
    O quebra-cabeça ficou de fora por escolha do usuário.
- **Ladrilhos** `patterns/eventos.svg` (374 px, ~3,9 KB) e `patterns/amigos.svg` (352 px, ~5,0 KB),
  que se repetem pela tela.
  - **Como são gerados:** `scripts/fundos-build.cjs`, o mesmo gerador da galeria. A grade é 4 × 4
    em tijolinho, com lugar e giro sorteados por semente fixa. O que passa da borda é repetido do
    outro lado, para emendar sem costura.
  - **Cores:** a cor de destaque e o `--muted` de cada módulo, alternados, com opacidade embutida
    no SVG.
  - **Eventos:** 0,18 / 0,117.
  - **Amigos:** 0,10 / 0,065.
  - **Para mudar:** editar a escolha em `MODULES` no script e rodar `node scripts/fundos-build.cjs`.
- **CSS** (`styles.css`, depois do bloco de Amigos):
  - Camada `body::before` fixa (`inset: 0; z-index: -1; pointer-events: none`), só em
    `:root[data-view="occasion"]` e `[data-view="shared"]`.
  - Ela não anda com a rolagem e dispensa `background-attachment: fixed`, que o iOS ignora.
  - Como na imagem de fundo da 0031, o `html` mantém a cor do módulo e o `body` fica transparente
    para a camada aparecer.
  - **Tela de bloqueio:** usa `data-view="locked"` (adendo v2.32.1 da 0031), então continua neutra
    sem regra extra.
  - **Diálogos dos módulos:** `.dialog.event-scope` e `.dialog.friends-scope` levam o ladrilho do
    módulo no próprio fundo, por cima da mesma cor. São eles: Novo/Editar evento, detalhe do evento,
    Convidados, Compartilhar doses, convite, Amigos, Sobre o amigo e pareamento.
    - Como quem rola é o conteúdo, os desenhos ficam parados ali também.
    - O rodapé de botões (`--event-foot`/`--friends-foot`) e os campos continuam sólidos.
    - A regra da 0031 vale para o desenho também: Convidados e Compartilhar doses abrem a partir de um
      evento e levam os desenhos de Eventos.
    - Diálogos neutros (bebida, confirmações genéricas) continuam sem desenho.
  - **Barra de baixo, cartões e campos:** não mudam.
  - **Aviso do rodapé:** fica direto sobre os desenhos. Ganha um contorno (`text-shadow`) na cor do
    módulo, que apaga o traço atrás das letras sem mudar a cor nem a opacidade do aviso.
- **Offline:** os dois SVGs entram no `APP_SHELL` do `sw.js` (cache da versão).
  `scripts/dev-server.cjs` passa a servir `.svg` como `image/svg+xml`, sem o qual o navegador não
  desenha o arquivo.

**Não muda:** dados, `DATA_VERSION` (11), backup, exportação de bebidas, regras do Firestore, políticas
e a imagem de fundo escolhida em Aparência (continua valendo só nas telas neutras).

## Plano de teste

- `node --input-type=module --check < app.js`, `node --check sw.js`, `node --check boot.js`,
  `node --check scripts/fundos-build.cjs`.
- `tests/fundo-browser.test.cjs`, teste novo "desenhos de fundo":
  - Início, Histórico e Configurações sem desenho;
  - Eventos com `patterns/eventos.svg` e Amigos com `patterns/amigos.svg`;
  - camada fixa, atrás de tudo e sem receber toques;
  - `body` transparente e a cor no `html`;
  - diálogos de Amigos (Sobre o amigo, pareamento) com o ladrilho de Amigos;
  - diálogos de Eventos (Novo evento, Compartilhar doses) com o de Eventos;
  - diálogo de bebida sem desenho;
  - por baixo dos desenhos, a cor do módulo;
  - os dois SVGs abrem como imagem (374 e 352 px);
  - sair de Amigos tira o desenho.
- `tests/fundo-browser.test.cjs`, teste antigo: a cor de Amigos agora é conferida no `html`.
- `tests/lock-screen-browser.test.cjs`: bloquear a partir de Eventos ou Amigos não mostra desenho, e
  desbloquear devolve o desenho do módulo.
- `tests/audit.test.cjs`: todos os arquivos do `APP_SHELL` existem.
- **Afeta algum tutorial?**
  - **Regerados:** `eventos`, `amigos` e `evento-compartilhado`.
    - Os vídeos passam pelas telas e pelos diálogos dos módulos.
    - Duas imagens mudaram com os desenhos no diálogo: `eventos` passo 7 (Novo evento) e
      `evento-compartilhado` passo 4 (Convidados).
    - Legendas iguais.
  - **Outros tópicos:** nenhum mostra telas ou diálogos dos módulos.
