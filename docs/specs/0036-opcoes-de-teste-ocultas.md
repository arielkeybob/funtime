# 0036 — Opções de teste ocultas por gesto secreto

Status: implementada (v2.36.0)

## Contexto

O modo tester avançado (spec 0035, v2.35.0) aparecia para todo mundo em Configurações › Sobre o app.
O usuário pediu que essas ferramentas ficassem escondidas, liberadas por um gesto secreto como os 7
toques no número da versão do Android, e que o mesmo lugar servisse para outras opções no futuro.

Decisões do usuário:
- Ficam ocultos o **modo tester** e o **Diagnóstico de toque**, juntos numa seção "Opções de teste".
- O gesto é **7 toques seguidos em "Versão instalada"**.
- As políticas passam a dizer que a opção fica oculta, sem revelar o gesto: **1.0.11, sem novo aceite**.

## Decisão

- **Seção `#hidden-options`** em Sobre o app, com o atributo `hidden` até ser liberada. Tem o rótulo
  "Opções de teste", os cartões do modo tester e do Diagnóstico de toque, e o botão **Ocultar opções
  de teste**. Uma opção nova de teste entra como mais um cartão dentro dela.
- **O gesto** (`src/ui/secret-taps.js`, puro): cada toque em `#about-version` conta se vier até 1,5 s
  depois do anterior; senão recomeça. Do 4º ao 6º toque, um toast avisa "Faltam N toques…". No 7º, a
  seção aparece, rola até ela e o toast avisa "Opções de teste liberadas". Já liberada, os toques avisam
  "As opções de teste já estão liberadas".
- **Fica liberada neste aparelho** em `funtime-hidden-options-v1` (`{ unlocked, at }`). Não sincroniza e
  fica fora do backup, que só leva `buildCurrentAppData()`.
- **Nada grava escondido:** a seção aparece sempre que estiver liberada **ou** com o modo tester ligado.
  Com o modo ligado, "Ocultar" não esconde e pede para desligar antes. Quem ligou o modo na 2.35.0,
  quando ele aparecia para todos, vira liberação gravada ao abrir.
- **"Apagar tudo deste aparelho"** desliga o modo tester e volta a ocultar (`hideHiddenOptions`).
- **O Diagnóstico de toque** deixou de ser `clean-optional`: dependia de desligar a Interface limpa, que
  vem ligada e é como os testers usam. Agora depende só do gesto.
- `#about-version` não seleciona texto com os toques seguidos.

## Políticas

1.0.11: o item 7 diz que o modo tester "fica oculto em Configurações › Sobre o app". Só muda onde a opção
aparece; nada novo é coletado. Sem novo aceite, a pedido do usuário: a 1.0.10 entrou em
`TERMS_VERSIONS_STILL_VALID`, e `tests/audit.test.cjs` trava a dispensa e o trecho.

## Testes

- `tests/secret-taps.test.cjs` (4): 7 toques liberam e avisam do 4º ao 6º; poucos toques não fazem nada;
  pausa maior que 1,5 s recomeça; depois de liberar, a contagem zera.
- `tests/diagnostics-browser.test.cjs` (app real):
  - oculto por padrão; os toques avisam e liberam; a liberação sobrevive a recarregar; Ocultar esconde;
  - o fluxo do modo tester continua igual, e com ele ligado Ocultar não esconde;
  - o caso da 2.35.0 (modo ligado sem liberação gravada) mostra as opções.
- `tests/icon-reorder-browser.test.cjs`: o Diagnóstico de toque fica oculto até o gesto e aparece com a
  Interface limpa ligada.
- `tests/diagnostics.test.cjs` ganhou um caso: `flush` com o modo desligado não apaga um registro que
  outra abertura acabou de ligar. O teste do caso 2.35.0 achou isso: o `pagehide` da página anterior
  apagava a chave.
- Nenhum tutorial mostra Sobre o app (`npm run tutorials:check` em dia).
