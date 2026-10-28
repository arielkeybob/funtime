# 0029 — Padrões de Eventos no resto do app

Status: em andamento (C na v2.26.0, D na v2.26.1)

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
| 3 | A — `window.confirm` (apagar nuvem, desfazer amizade, parar com todos) → confirmação compacta; tom neutro para confirmações que não apagam | a fazer |
| 4 | B — Escolhas curtas em janela compacta: cancelar contagem, excluir bebida, meia/inteira, como desbloquear, restaurar backup, convite | a fazer |
| 5 | G — Detalhe do amigo: selo, ▶, cartão-resumo; sem "Fechar" repetido; Sobre volta ao amigo | a fazer |
| 6 | H — Compartilhar doses e Convidados: nome do evento no título, botão diz o efeito | a fazer |
| 7 | I — Configurações num componente único de linhas | a fazer |
| 8 | J — Backup e conta: selo de estado, ações discretas | a fazer |
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
