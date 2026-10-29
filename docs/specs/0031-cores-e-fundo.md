# 0031 — Amigos em ouro e imagem de fundo escolhida pelo usuário

Status: implementada (v2.30.0)

## Contexto

Na v2.29.1, Eventos ganhou o lilás com brilho violeta (`#130e1c` / `#1d1728` / `#9668ff`) para ficar
visualmente separado do resto, e o usuário aprovou. Amigos também é um módulo à parte. Numa galeria com
telas reais, o usuário comparou cinco cores: mostarda, ouro, lima, laranja e ciano. Os tons frios
(ciano, azul) ficaram perto demais do roxo, e ele escolheu **Ouro**: `#16130b` / `#221d10` / `#f2c94c`.

Ele também pediu que as telas neutras (fundo preto) aceitem uma **imagem de fundo** escolhida em
Configurações > Aparência. A imagem vale para todo o app, Configurações inclusive, menos Eventos e Amigos,
e leva um véu preto por cima para dar contraste.

Não há manual de marca. As únicas restrições de cor são as que o app já usa para dizer alguma coisa:
- roxo: Eventos;
- verde: início ▶, "Em andamento" e "Vendo";
- vermelho: perigo, fim ■ e bebida em intervalo;
- laranja `--warning`: avisos;
- azul `--info`: "Compartilhando".

O ouro fica no lado oposto do roxo. Ele é o vizinho mais claro do laranja dos avisos, mas avisos quase
não aparecem em Amigos.

## Decisão

- **Amigos em ouro** (`styles.css`):
  - Bloco `:root[data-view="shared"], .friends-scope` com o mesmo esquema de Eventos.
  - Botões em ouro levam texto escuro (`--accent-text: #1a1300`), porque branco sobre ouro não tem
    contraste.
  - `friends-scope` vai em `shared-detail-dialog`, `friend-info-dialog` e `pairing-dialog`.
  - **A cor segue a tela de onde o diálogo abriu.** Convidados, Compartilhar doses e o convite abrem a
    partir de um evento e continuam lilás.
  - `setCurrentView` (`app.js`) troca o `theme-color` por `MODULE_THEME_COLORS`.
- **Imagem de fundo**:
  - Em Aparência, o cartão **Imagem de fundo** tem prévia, "Escolher imagem"/"Trocar imagem" e "Remover".
  - `src/ui/app-background.js` (`encodeBackgroundImage`) reduz a foto a no máximo 1600 px e a regrava
    em JPEG. Se passar de ~1,1 MB, tenta 1280 px e 1024 px, com qualidade menor. Arquivo que não é
    imagem, que não abre ou que não cabe vira erro, com mensagem.
  - Guardada em chave própria, `funtime-background-v1` (`{ version: 1, image, updatedAt }`):
    - fora dos dados: `DATA_VERSION` continua 11;
    - fora do backup: é do aparelho, como a proteção local, e pesaria em cada arquivo;
    - "Apagar tudo deste aparelho" remove (`clearAppBackground`, `reset.js`).
  - Camada `#app-background` fixa atrás de tudo (`z-index: -1`) com véu `rgb(0 0 0 / .7)`. Só aparece
    quando `:root[data-app-background]` e a tela não é `occasion` nem `shared`. Nessas telas o `body`
    fica transparente.
  - O aviso "App para estudo · não é controle de segurança" do rodapé ganha cor mais clara e sombra
    sobre a imagem, para continuar legível em qualquer foto.
  - Diálogos continuam sólidos: são formulários por cima da tela.

**Não muda:** dados, `DATA_VERSION`, formato do backup e exportação de bebidas.

### Adendo v2.31.3 — entradas na cor do módulo

O usuário pediu que os botões que levam a cada módulo já mostrem a cor dele, fora do módulo também:
- `#home-occasion` (atalho do Início) e `#nav-occasion` (aba Evento) recebem `event-scope`: o atalho
  fica com fundo e borda lilás, e o ícone da aba fica sempre em `--event-glow`.
- `#home-friends-button` recebe `friends-scope`: fundo `--surface-2` dourado escuro e ícone em
  `--friends-glow`.
- A paleta continua definida só nos blocos de escopo; `styles.css` ganha apenas as regras dos dois ícones.

## Plano de teste

- `node --input-type=module --check < app.js`, `node --check sw.js`, `node --check reset.js`.
- `tests/app-background.test.cjs`: redução de tamanho, leitura do valor guardado e tentativas de
  codificação.
- `tests/fundo-browser.test.cjs` (app real):
  - escolher a imagem em Aparência;
  - a imagem aparece em Configurações e no Início e some em Eventos e Amigos;
  - Amigos em `#16130b`, com o `theme-color` acompanhando;
  - fora do backup;
  - sobrevive ao recarregar e sai com "Remover".
- `tests/reset.test.cjs`: "apagar tudo" também remove a imagem.
- **Afeta algum tutorial?** Sim, só nas imagens:
  - `amigos` e `evento-compartilhado` mostram telas de Amigos, agora em ouro;
  - a Aparência ganhou o cartão novo.
  - A pedido do usuário, os tutoriais ficam para a próxima rodada.
