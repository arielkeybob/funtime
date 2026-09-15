# 0002 — Extrair núcleo puro de `effectiveCountingMode` para `src/format/counting-mode.js`

Status: implementada

## Contexto

`effectiveCountingMode()` (app.js:1967-1970, após a extração da spec 0001) decide
se o app mostra contagem normal ou regressiva, combinando duas leituras de
`state`:

```js
function effectiveCountingMode() {
  const normal = state.preferences.countingMode === "normal";
  return (state.upsideDownActive ? !normal : normal) ? "normal" : "countdown";
}
```

A lógica em si (a tabela normal/invertido) é pura — só depende dos dois valores
booleanos/string que recebe. O único motivo de não ser testável isoladamente
hoje é ler `state` diretamente em vez de receber os valores por parâmetro. É
usada só dentro de `app.js`, em `formatActivityCounter` (linha 1973) e
`formatHistoryCounter` (linha 1981) — confirmei que nenhum outro arquivo a
referencia.

Hoje ela só é testada indiretamente: `tests/audit.test.cjs` (teste "contadores
usam timestamps e intervalo histórico...") usa `extract('effectiveCountingMode')`
para fatiar seu texto de dentro de `app.js` e rodar num `vm.createContext` com um
`state` fake.

## Decisão

Extrai-se só a tabela de decisão pura para `src/format/counting-mode.js`:

```js
export function resolveCountingMode(preferenceMode, upsideDownActive) {
  const normal = preferenceMode === "normal";
  return (upsideDownActive ? !normal : normal) ? "normal" : "countdown";
}
```

`effectiveCountingMode()` **continua existindo em `app.js`**, com o mesmo nome e
a mesma assinatura (sem parâmetros) — os dois call sites (`formatActivityCounter`,
`formatHistoryCounter`) não mudam nem uma letra. Ela vira um adaptador de uma
linha:

```js
function effectiveCountingMode() {
  return resolveCountingMode(state.preferences.countingMode, state.upsideDownActive);
}
```

`resolveCountingMode` é importada e publicada em `globalThis` por
`src/bootstrap/legacy-bridge.js`, junto com as quatro funções da spec 0001 — o
bridge cresce uma linha, como previsto.

**O que não muda:** o nome/assinatura de `effectiveCountingMode` (continua lendo
`state` diretamente, só que por dentro chama a função pura), o valor de retorno
para qualquer combinação de entradas, o formato de dados salvo.

## Contrato do módulo

```js
// src/format/counting-mode.js
export function resolveCountingMode(preferenceMode, upsideDownActive) { … } // → "normal" | "countdown"
```

Sem dependências, sem efeitos colaterais.

## Casos de borda preservados

As 4 combinações de `preferenceMode` (`"normal"` | qualquer outro valor,
tratado como não-normal) × `upsideDownActive` (`true`/`false`) precisam
continuar retornando exatamente o mesmo valor de hoje — cobertas uma a uma no
novo teste direto.

## Impacto em testes existentes

`tests/audit.test.cjs`, teste "contadores usam timestamps e intervalo
histórico...": o `extract('effectiveCountingMode')` passa a fatiar o novo corpo
de uma linha, que referencia `resolveCountingMode` como identificador livre —
o `vm.createContext` desse teste precisa ganhar `resolveCountingMode` (importado
de `src/format/counting-mode.js`) na mesma injeção que já faz para `formatTime`/
`formatHistoryElapsed` (spec 0001). Nenhuma asserção muda de valor esperado.

## Plano de teste

- `node --check` em `src/format/counting-mode.js`, `src/bootstrap/legacy-bridge.js` e `app.js`.
- Novo `tests/format-counting-mode.test.cjs`: as 4 combinações de entrada de `resolveCountingMode`.
- Atualizar a injeção de contexto em `tests/audit.test.cjs` conforme "Impacto em testes existentes".
- Rodar a suíte completa (`npm test`); baseline atual (pós spec 0001) é 112/114, com as 2 falhas conhecidas em `receiver-browser.test.cjs`, não relacionadas.
- Sem teste manual necessário — mudança é comportamentalmente transparente e já validada pelos testes de navegador existentes que exercitam a Home/histórico (onde `effectiveCountingMode` é usada indiretamente).
- Fora desta rodada: `formatActivityCounter`, `formatHistoryCounter` continuam em `app.js` (dependem de mais contexto além do counting mode).
