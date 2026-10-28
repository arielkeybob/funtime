# 0029 — Padrões de Eventos no resto do app

Status: em andamento (C na v2.26.0, D na v2.26.1, A na v2.26.2, B na v2.26.3, G na v2.26.4, H na v2.26.5, I na v2.26.6, J na v2.26.7)

## Contexto

A spec 0028 criou, no módulo Eventos, padrões de interface que servem ao app inteiro:
- rodapé com lápis/lixeira e uma ação principal;
- confirmação compacta;
- selo de situação;
- marcadores ▶/■;
- bloquinho de data;
- linha do tempo;
- linhas agrupadas;
- cartão-resumo;
- ação discreta;
- regras de texto (nome no título, sem fechar repetido, um botão principal, voltar para onde veio, menos texto, rótulo que diz o efeito).

Em 27/10/2026 foi feito um levantamento de todas as telas, só lendo o código. A partir dele, a galeria de
simulações (artifact "Redesenho de Eventos", etapa 2) mostrou antes e depois de cada tela
candidata, e o usuário escolheu a ordem. Cada pacote é uma rodada própria, com testes,
tutoriais e versão.

## Ordem escolhida

| # | Pacote | Situação |
|---|---|---|
| 1 | C — Rodapé com lixeira nos editores (Editar bebida, Editar registro) | feito (v2.26.0) |
| 2 | D — Menu ⋮ da bebida em linhas, numa janela compacta; fechar o menu depois de editar | feito (v2.26.1) |
| 3 | A — `window.confirm` (apagar nuvem, desfazer amizade, parar com todos) → confirmação compacta; tom neutro para confirmações que não apagam | feito (v2.26.2) |
| 4 | B — Escolhas curtas em janela compacta: cancelar contagem, excluir bebida, meia/inteira, como desbloquear, restaurar backup, convite | feito (v2.26.3) |
| 5 | G — Detalhe do amigo: selo, ▶, cartão-resumo; sem "Fechar" repetido; Sobre volta ao amigo | feito (v2.26.4) |
| 6 | H — Compartilhar doses e Convidados: nome do evento no título, botão diz o efeito | feito (v2.26.5) |
| 7 | I — Configurações num componente único de linhas | feito (v2.26.6) |
| 8 | J — Backup e conta: selo de estado, ações discretas | feito (v2.26.7) |
| 9 | K — Anotar dose ("Anotar às 20:10") e aviso de intervalo | a fazer |
| 10 | L — Importar bebidas, Criar PIN e Redefinir: botão diz o efeito | a fazer |
| 11 | M — Botões de perigo unificados | a fazer |
| 12 | N — Correções (erros de conta como erro, voltar para Amigos, textos do tutorial, DEVELOPMENT.md) | a fazer |
| 13 | E (parcial) — Só o lembrete de evento na Home (bloquinho, ▶ vazado, sem "Deseja iniciar agora?"). A faixa do evento em andamento **não** muda. | a fazer |
| 14 | F (parcial) — Cartão-resumo no Histórico **só quando filtrado por um evento**; evento não se repete nas linhas; datas do seletor como "sáb 13/06" | a fazer |

## Decisões do usuário

1. O aviso de segurança do detalhe do amigo e o consentimento em Convidados continuam como estão (`clean-optional`).
2. "Sobre o amigo": a tela fica, só mais limpa (opção A).
3. "Já consumi — anotar" passa a botão **neutro**.
4. "Sair e parar de sincronizar" pede confirmação **quando houver compartilhamento ativo**.
5. Histórico: tirar o "em 18/10/26" repetido das linhas dentro do grupo do dia.

Fora, porque não vale aplicar: tela de bloqueio, termos, visualizador de tutoriais, Como usar,
reações, chip de tempo do Histórico, ▶/■ nos cards de bebida, Criar PIN como janela compacta e
Redefinir em uma etapa só.

## Pacote C (v2.26.0)

- **Editar bebida:**
  - "Excluir bebida" sai do meio do formulário (`.editor-danger-zone`, removida) e vira a lixeira
    no rodapé (`#delete-drink-from-editor`, mesmo id, `aria-label="Excluir bebida"`).
  - O Cancelar (`#cancel-dialog`) saiu; o ✕ e o Voltar fecham.
  - O título da edição ganhou o ícone.
  - No cadastro sem mudança, o rodapé some (`:has()`, nada visível).
- **Editar registro:** "Excluir este registro" vira a lixeira no rodapé (`#delete-event`, mesmo id,
  `aria-label="Excluir registro"`). O Cancelar (`#cancel-event-dialog`) saiu.
- **CSS:**
  - Removidos `.editor-danger-zone`, `.editor-delete-button` e `.delete-event-button`.
  - Os editores reaproveitam `.occasion-icon-action.is-danger` do módulo Eventos.
  - O SVG da lixeira está escrito direto no `index.html`, como os demais ícones fixos.
  - O mapa `OCCASION_ICONS` vai para um módulo comum quando um pacote precisar de ícones montados
    por script fora de Eventos.
- **Tutoriais:** 01 (texto alternativo) e 03 (legenda e texto alternativo, sem o "Desfazer" que não
  existe) foram regravados, com 00 e 01 por causa da marcação de `#drink-dialog`.

## Pacote D (v2.26.1)

- `#drink-menu-dialog` ganhou `.compact-dialog` e as opções viraram `.occasion-menu`, com linhas
  `.occasion-menu-row`. Ids mantidos: `#drink-menu-other-time`, `#drink-menu-stop` (com `.danger`) e
  `#drink-menu-edit`.
- Saíram o rótulo "Bebida" e os títulos de seção.
- `#drink-menu-remaining` mostra o tempo que falta e é atualizado no mesmo ciclo de
  `updateDrinkMenuCountdown`. `#drink-menu-interval` mostra o intervalo.
- Salvar a edição aberta pelo menu fecha o menu também.
- Janela compacta sem rodapé ganhou padding inferior (`form.app-dialog-no-footer`).
- Teste novo: `tests/drink-menu-browser.test.cjs`.

## Pacote A (v2.26.2)

- `showAppConfirmation` (`ui.js`) ganhou `tone`: `danger` (padrão, botão vermelho) ou `primary` (botão
  branco). O tom é definido a cada chamada, para não passar de uma confirmação para outra.
- Usam `primary`: "O evento acabou" e "Reabrir" (`changeOccasion`) e "Ativar eventos?" (aceitar convite).
- Os três `window.confirm` foram trocados pela confirmação do app: apagar dados na nuvem (`app.js`),
  desfazer amizade e parar com todos (`share-ui.js`, por `globalThis.showAppConfirmation`).
- Teste novo: `tests/confirmacoes-browser.test.cjs`. Ele falha se aparecer qualquer caixa nativa do navegador.
- A decisão 3 ("Já consumi — anotar" neutro) fica para o pacote K, que trata o aviso de intervalo.

## Pacote B (v2.26.3)

- `.compact-dialog` em `#dose-size-dialog`, `#stop-countdown-dialog`, `#delete-drink-dialog`,
  `#security-method-dialog`, `#backup-restore-dialog` e `#invite-sheet-dialog`. Ids mantidos.
- **Cancelar contagem:** um parágrafo só, e o botão `#confirm-stop-countdown` vira `.danger-button` "Remover dose".
- **Excluir bebida:** rótulos com a contagem (`openDeleteDrinkDialog`); a ajuda passa a `clean-optional`; o Cancelar vai para
  o fim (`order`).
- **Restaurar backup:** sem `#cancel-backup-restore` (botão e listener removidos); confirmar usa `.danger-button`.
- **Convite:** `renderFolha` usa `globalThis.occasionTimelineElement` e `globalThis.fillOccasionStatusChip`,
  publicados por `occasions-ui.js`. Sem eles (teste isolado), fica o período em texto.

## Tutoriais: regerar tudo no fim da série

A partir do pacote G, a pedido do usuário, os tutoriais não são mais regerados a cada pacote. Várias
telas mudam de novo em pacotes seguintes. Em cada pacote:
- roda `tutorials:check` para anotar os tópicos desatualizados;
- só mexe num roteiro se um seletor quebrar.

Na última etapa, regera todos de uma vez e confere o diff das imagens. Até lá, "Como usar" pode
mostrar telas antigas.

Pendentes:
- desde G: `amigos`.
- desde H: `evento-compartilhado`.
- desde I: `privacidade`.
- desde J: `backup-e-bebidas`.

## Pacote G (v2.26.4)

- **Vendo** (`renderVendoEvento`):
  - o título leva o selo `.status-chip` no lugar de "(Em andamento)" / "(Encerrado às…)";
  - "Começou hoje às…" ficou visível, com o marcador ▶ (`.share-vendo-start`);
  - os totais viram um cartão `.occasion-records` (`.share-vendo-resumo`) com o total real
    (`view.eventCount`) e pílulas por bebida.
- **Compartilhando:** o subtítulo vira selo ("Ao vivo" / "Encerrado · visível até sáb 13/06 22:30").
- **Sem "Fechar" duplicado:** `#shared-detail-close`, `#friend-info-close` e `#pairing-done` saíram. Em
  "Quem vai" (convidado), o Cancelar fica escondido e o rodapé some: regra global
  `.app-dialog-actions` sem botão visível.
- **Sobre o amigo:**
  - `openFriendInfo` não fecha mais o detalhe, então o ✕ volta ao amigo;
  - "Amigos desde" fica numa linha `.occasion-menu`;
  - `#friend-info-unfriend` virou `.occasion-link.is-danger`.
- **Decisões aplicadas:** 1 (aviso e consentimento continuam como estão) e 2 (a tela fica).

## Pacote H (v2.26.5)

- `#share-occasion-title` e `#event-invite-title` mostram o nome do evento ("Evento novo" no formulário). O rótulo de cima
  (`.eyebrow`) diz "Compartilhar doses", "Convidados" ou "Quem vai".
- Dica: `#share-occasion-hint` com uma frase e `#share-occasion-hint-more` (`clean-optional`) com o prazo.
- `rotuloConfirmar()` (`share-ui.js`): "Compartilhar com N" ou "Parar de compartilhar" quando a seleção muda o que está ao
  vivo; "Confirmar" no agendado e no formulário. Em Convidados, `openInviteDialog({ applyNow })`, que o detalhe do
  evento passa, mostra "Enviar convites".
- Regra global: rodapé com um só botão visível usa uma coluna.
- "Parar com todos" continua como botão de texto ao lado: é claro e raro, e o ícone não ganharia nada.

## Pacote I (v2.26.6)

- Páginas usam o bloco `.occasion-menu` / `.occasion-menu-row` do evento:
  - Privacidade: `#change-security-method`, com `#security-method-label` dentro;
  - Redefinir: `[data-reset]` mantido.
- Aparência: `.occasion-menu-icon` em cada `.settings-toggle-row` e explicações em `clean-optional`.
- `#lock-now` virou `.occasion-link` com ícone de cadeado.
- Sobre: o cartão de políticas foi unido ao da versão.
- Nomes: menu "Redefinir dados" (igual à página) e título do reset "Apagar tudo deste aparelho" (`reset.js`).
- O menu principal de Configurações continua com `.settings-nav-row` (ícone de 40px e resumo embaixo): muitos testes e
  tutoriais dependem dessas classes, e o visual já é o mesmo padrão. Unificar as classes fica como limpeza futura,
  sem mudança visual.

## Pacote J (v2.26.7)

- Ids mantidos: `#export-drinks`, `#import-drinks`, `#create-backup`, `#restore-backup` (agora `.occasion-menu-row`),
  `#sync-sign-out` e `#sync-delete-cloud` (`.occasion-link`, este com `.is-danger`).
- `#sync-status-row` virou um bloco `.occasion-menu` com o e-mail (`#sync-account-label`) e o selo
  `.status-chip.is-live.is-steady` ("Conectada", sem pulso).
- `#sync-state-note` continua para "sem conta", "desconectada" e "sem internet", porque é um aviso.
- **Decisão 4:** o handler de `#sync-sign-out` pede `showAppConfirmation` quando `latestShares` não está vazio.
  Teste em `tests/confirmacoes-browser.test.cjs`.
