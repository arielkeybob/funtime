# 0028 — Eventos: módulo lilás, lista com bloquinho de data, linha do tempo e rodapé com ícones

Status: implementada (v2.25.0)

## Contexto

O usuário achou a parte de Eventos confusa e pouco amigável no celular (27/10/2026):

- O detalhe (`openOccasionDetails`, `occasions-ui.js`) empilhava até sete botões do mesmo
  tamanho: Ver registros, Editar, Reabrir, Sair do evento e Excluir evento, mais Encerrar e Voltar.
- O cabeçalho dizia "Evento" e o nome vinha logo abaixo. O ✕ e o **Voltar** faziam a mesma coisa.
- O período era uma linha só ("18/10/26, 01:30 — 18/10/26, 17:19"). Quando o início efetivo
  diferia do planejado, vinha também uma frase explicando a diferença.
- A linha da lista mostrava só o início, sem dizer se era início ou fim.

As opções foram comparadas numa galeria HTML com as telas reais. O usuário escolheu:

- lilás médio;
- card L1 (bloquinho de data);
- período P3 (linha do tempo);
- ações em ícones no rodapé;
- início ▶ verde e fim ■ vermelho.

Também trocou dois rótulos:

- "Sair do evento" virou **Deixar de participar**. A ação só existe para convidados e não é "voltar".
- "Encerrar evento" virou **O evento acabou**.

## Decisão

- **Módulo à parte**:
  - `setCurrentView` (`app.js`) grava `data-view` no `<html>` e troca o `theme-color`.
  - Em `styles.css`, `:root[data-view="occasion"]` e a classe `.event-scope` redefinem
    `--bg/--surface/--surface-2/--border/--muted` para o lilás escuro (`#130e1c` / `#1d1728`).
  - A classe `.event-scope` fica nos diálogos do módulo: novo/editar, detalhe, convidados, convite e
    compartilhar doses. Assim o detalhe aberto pela Home também fica lilás.
- **Lista**:
  - Cada linha tem o bloquinho com dia da semana e dia, o nome, o início ▶ e o fim ■, e o
    selo + meta. O fim mostra só a hora no mesmo dia, o dia da semana e a hora no dia seguinte
    ("seg 01:08") e a data quando passa disso. Até a v2.25.1, o dia seguinte aparecia como "+1".
  - Marcador vazado indica o que ainda não aconteceu: agendado ou fim programado.
  - A data completa vai num texto só para leitores de tela.
  - Abas **Passados | Próximos**.
- **Detalhe**:
  - O nome vira o título, com o selo de situação acima e "de Fulano" abaixo para convidado.
  - O período é uma linha do tempo vertical com a duração no meio ("previsto" quando ainda não
    aconteceu), só com o período efetivo.
  - Os registros viram um cartão tocável (`aria-label="Ver registros"`) com a contagem por bebida
    e o ícone de cada uma.
  - Convidados, Compartilhar doses e Manter app desbloqueado ficam num bloco único.
  - Cancelar agendamento e Deixar de participar são linhas discretas no fim do conteúdo.
- **Rodapé** `#occasion-detail-actions`:
  - Lápis (`Editar evento`) e lixeira (`Excluir evento`) à esquerda.
  - A ação principal ocupa o resto: O evento acabou, Iniciar agora, Reabrir, ou Reagendar
    (cancelado/expirado, sem lápis).
  - O **Voltar** saiu: o ✕ e o gesto de voltar fecham.
- **Novo evento**: o nome vem antes de "Quando começar?".
- **Menos texto**: explicações viram `clean-optional` e só aparecem com a interface detalhada.
  São elas: a ajuda do desbloqueio, "Os registros anteriores são preservados…" e o motivo do
  encerramento automático. A frase "Início planejado… O período acima mostra o início efetivo" saiu.
  Avisos (`active-warning`) e o fuso continuam visíveis.
- **Vocabulário de situação alinhado**:
  - O detalhe passa a dizer **Agendado**, **Inicia sozinho** e **Precisa de revisão**. Antes dizia
    "Início manual", "Início automático" e "Aguardando revisão".
  - Na lista, o encerrado automaticamente vira o selo **Automático**.

**Não muda:** dados, `DATA_VERSION` (11), regras de agenda/encerramento, confirmações (os
textos de Encerrar e Sair foram reescritos com os rótulos novos) e o formato do backup.

## Contrato

- `src/format/datetime.js` ganha `agendaDateParts`, `calendarDaysBetween` e
  `formatEventDuration`, publicados em `globalThis` por `app.js` para `occasions-ui.js`.
  `formatAgendaDateTime` passa a usar `agendaDateParts`, com a mesma saída.
- Ícones do módulo: mapa `OCCASION_ICONS` em `occasions-ui.js` (SVG 24px, traço 1.8). Ele vai
  para um módulo comum quando o padrão chegar ao resto do app.

## Padrões para levar ao resto do app (próximas rodadas, uma tela de cada vez)

- **Rodapé de ações**: lápis e lixeira à esquerda e a ação principal à direita. Excluir sempre confirma.
  Candidatos: Editar bebida ("Excluir bebida" no meio do formulário) e Editar registro
  ("Excluir este registro").
- **Selo de situação** (`.status-chip`): cor + texto curto, nunca só cor.
- **Linhas agrupadas** com ícone à esquerda e valor + › à direita, como o menu de Configurações.
- **Menos texto**: frase na tela só quando muda uma decisão. O resto vai para os tutoriais ou
  para `clean-optional`.

## Corrigido depois (v2.25.1)

- Ao editar um evento e mudar só convidados/compartilhamento, o "Salvar alterações" não
  aparecia, porque as escolhas ficavam fora dos campos do formulário. Agora elas também vão para
  dois campos ocultos (`#occasion-invite-draft`, `#occasion-share-draft`) que o rascunho do
  formulário (`ui.js`, `updateFormDraft`) compara. Evento encerrado não mostra mais Convidados
  no editor.
- "Ver registros" levava ao Histórico sem caminho de volta ao evento. Agora
  `state.historyReturnOccasionId` guarda o evento e `setHistoryReturnOccasion` (`app.js`) põe
  "Registros do evento" e o nome dele no cabeçalho. `leaveHistoryView` faz o ← e o Voltar do
  aparelho (`navigation.js`) voltarem ao detalhe. Trocar o filtro para outra coisa desfaz isso.
- **Deixar de participar desligado** (`OCCASION_LEAVE_ENABLED = false` em `occasions-ui.js`), a
  pedido do usuário: sair da lista do amigo mantendo o evento na agenda ainda confunde quem está
  aprendendo os conceitos. O convidado continua podendo sair por Cancelar agendamento (antes do
  evento) e Excluir evento (a qualquer momento): os dois chamam `releaseSharedEvent`, que retira
  a presença. Num evento já encerrado, sair só tirava o nome da lista "Quem vai" e não tinha
  volta. O link, a confirmação e `leaveSharedEvent` continuam no código para religar depois.

## Ajustes da v2.25.2

- **Reabrir só nas 24h depois do encerramento** (`OCCASION_REOPEN_WINDOW_MS`). Conta do mais tarde
  entre `endedAt` e `closedAt`, para o encerramento automático (que grava um fim anterior ao
  momento em que o app encerrou) não tirar a opção antes de a pessoa ver. Depois disso, o lápis
  continua corrigindo as datas.
- **Confirmação compacta** (`.compact-dialog` em `#app-confirm-dialog`): no celular, a confirmação
  vira uma janela pequena centralizada (`height: fit-content`; com `height: auto` o diálogo modal
  esticava até a altura máxima), sem o rodapé fixo das folhas. Vale para tudo que usa
  `showAppConfirmation`. Diálogos de sim/não que hoje são folhas próprias (ex.: excluir bebida,
  cancelar contagem) podem adotar a mesma classe depois.

## Plano de teste

- `node --input-type=module --check` de `app.js` e `occasions-ui.js`; `node --check sw.js`.
- `tests/format-datetime.test.cjs`: os três helpers novos.
- `tests/occasions-browser.test.cjs`, `tests/eventos-tela-browser.test.cjs` e
  `tests/invite-ui-browser.test.cjs` atualizados para Passados, Editar evento, O evento acabou,
  Deixar de participar e o nome no cabeçalho.
- **Afeta algum tutorial?** Sim:
  - `eventos`: o passo 8 toca `#occasion-detail-actions .primary-button`, com a legenda nova
    "O evento acabou".
  - `evento-compartilhado`: só a marcação e as imagens.
  - Os dois foram regerados na 2.25.0.
