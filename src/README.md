# src/ — módulos ES do FunTime

Código novo, extraído do monólito `app.js` (e dos demais scripts clássicos da raiz)
durante o refactor descrito em
`docs/specs/` (ver índice em `docs/specs/README.md`). Contexto completo do plano:
`C:\Users\Ariel Souza\.claude\plans\eu-fiz-esse-app-refactored-lampson.md`.

## Por que isto é ES Module e o resto do app não é

`src/package.json` (`{"type":"module"}`) escopa a interpretação de módulo ES **só**
para esta subárvore. Desde a spec 0017, `app.js` importa diretamente daqui (é
`<script type="module">` no navegador) — mas continua fisicamente na raiz, e o
`package.json` da raiz continua `"type": "commonjs"` de propósito, porque os testes em
`tests/*.test.cjs` leem `app.js` via `fs.readFileSync` + `extract()`/`vm.runInContext`
(nunca via `require()` direto), e os demais arquivos da raiz (`occasions.js`,
`reset.js`, etc.) continuam scripts clássicos/CommonJS-compatíveis de verdade,
`require()`áveis. Por isso `app.js` precisa ser checado com
`node --input-type=module --check < app.js` (via stdin, sem argumento de arquivo) em
vez do `node --check app.js` comum — o `package.json` da raiz não pode declarar
`"type": "module"` sem quebrar o `require()` dos outros arquivos. **Não crie um
`package.json` na raiz com `"type": "module"`** — isso reintroduziria exatamente o
problema que este isolamento resolve.

## Convenções desta pasta

- **Exports nomeados sempre**, nunca `export default` — mantém os `import {...}` dos
  consumidores (bridge ou outros módulos) explícitos sobre o que estão usando.
- **Módulos aqui não tocam `state` global nem `localStorage` diretamente**, exceto
  `src/data/store.js` (a única camada de persistência) — os demais recebem dados por
  parâmetro e devolvem resultado, sem efeito colateral escondido. Isso é o que os
  torna testáveis com `node:test` puro, sem mockar DOM.
- **`querySelector` como convenção de DOM** (não `getElementById`) para qualquer
  módulo em `src/ui/` que precise consultar o documento — é o padrão já dominante no
  app.
- Nome de arquivo em `kebab-case.js`; uma responsabilidade por arquivo.
- Cada módulo novo tem teste correspondente em `tests/` (ver `docs/specs/TEMPLATE.md`,
  seção "Plano de teste") e, quando substitui lógica hoje coberta por
  `extract()`/`vm.runInContext` em `tests/audit.test.cjs`/`tests/ui.test.cjs`/
  `tests/migration.test.cjs`, remove a entrada equivalente desses testes na mesma PR.

## Como os scripts clássicos ainda consomem isto

`app.js` importa diretamente daqui (spec 0017) e, no final do próprio arquivo,
publica em `globalThis` (`Object.assign(globalThis, {...})`) o que `occasions-ui.js`,
`reset.js`, `navigation.js` e `ui.js` ainda leem como identificador solto — esses
quatro continuam scripts clássicos. Não existe mais um arquivo de ponte separado
(`legacy-bridge.js` foi removido); ver docs/specs/0017-app-js-module.md.
