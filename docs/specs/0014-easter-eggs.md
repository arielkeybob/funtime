# 0014 — Extrair easter eggs para `src/easter-eggs/index.js`

Status: implementada

## Contexto

A IIFE de "easter eggs" (app.js:4269-4590, ~320 linhas: modo "mundo
invertido" ao segurar o cabeçalho, vídeo de fundo temporário ao segurar
área vazia da tela, detector de BPM por toques repetidos) já é o item mais
autocontido do arquivo — o próprio comentário original já dizia "nenhum
dado persistido ou gesto nativo é alterado" (app.js:4269).

Lendo o corpo inteiro, a lista completa de dependências externas (tudo que
a IIFE lê de fora dela mesma) é pequena:

- `state` — só `state.upsideDownActive` (lido/escrito)
- `homeHeader`, `homeView`, `toast`, `updateToast` — elementos DOM já
  cacheados no topo de `app.js`
- `refreshDataViews` — função, chamada ao entrar/sair do modo invertido

Nenhuma outra função ou variável de `app.js` é usada — confirmei lendo o
arquivo inteiro linha a linha, não só os trechos citados na análise
original.

## Decisão

```js
// src/easter-eggs/index.js
export function initEasterEggs({ state, homeHeader, homeView, toast, updateToast, refreshDataViews }) {
  // corpo idêntico ao da IIFE de hoje (app.js:4270-4589), sem nenhuma
  // mudança de lógica — só substitui as 6 referências livres pelos
  // parâmetros acima.
}
```

Em `app.js`, a IIFE inteira é substituída por uma chamada:

```js
initEasterEggs({ state, homeHeader, homeView, toast, updateToast, refreshDataViews });
```

`initEasterEggs` é publicada em `globalThis` pelo bridge, como as
extrações anteriores. O comentário original ("Easter eggs locais: nenhum
dado persistido ou gesto nativo é alterado") migra para o topo do novo
arquivo.

**O que não muda:** toda a lógica (mundo invertido, vídeo de fundo, BPM),
frases, IDs de vídeo do YouTube, tempos/temporizadores, `MutationObserver`
e todos os listeners globais continuam exatamente como estão.

## Plano de teste

- `node --check app.js`, `node --check src/easter-eggs/index.js`, `node --check src/bootstrap/legacy-bridge.js`.
- Rodar `npm test` completo; baseline atual (pós Fase 3.4) é 155/158 (2 falhas conhecidas + a flakiness já documentada de `upside-down-browser.test.cjs`).
- Atenção especial a `tests/upside-down-browser.test.cjs` e `tests/tap-bpm-browser.test.cjs`, que já cobrem esta feature de ponta a ponta via Playwright — são a validação real desta spec, não testes unitários novos (a lógica é toda orientada a DOM/tempo real, não vale a pena fakear em `vm.createContext`).
- Smoke check de console limpo na prévia local.
- Sem teste manual adicional necessário — já há cobertura de navegador para os 3 sub-recursos (mundo invertido, vídeo de fundo, BPM).
- Fora desta rodada: Fases 5-9 do plano (núcleo de validação de formulário, performance do render, conversão de `app.js` para módulo).
