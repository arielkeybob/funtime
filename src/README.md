# src/ — módulos ES do FunTime

Código novo, extraído do monólito `app.js` (e dos demais scripts clássicos da raiz)
durante o refactor descrito em
`docs/specs/` (ver índice em `docs/specs/README.md`). Contexto completo do plano:
`C:\Users\Ariel Souza\.claude\plans\eu-fiz-esse-app-refactored-lampson.md`.

## Por que isto é ES Module e o resto do app não é

`src/package.json` (`{"type":"module"}`) escopa a interpretação de módulo ES **só**
para esta subárvore. Os arquivos `.js` na raiz do projeto (`app.js`, `occasions.js`,
etc.) continuam scripts clássicos/CommonJS-compatíveis — o `package.json` da raiz é
`"type": "commonjs"` de propósito, para não quebrar o `require()` que os testes em
`tests/*.test.cjs` já fazem deles. **Não mova arquivos para dentro de `src/` sem
converter seu conteúdo para `import`/`export`, e não crie um `package.json` na raiz
com `"type": "module"`** — isso reintroduziria exatamente o problema que este
isolamento resolve.

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

Enquanto `app.js` e os demais arquivos da raiz não viraram módulos ES eles próprios,
`src/bootstrap/legacy-bridge.js` importa daqui e publica em `globalThis` o que for
necessário. Ver spec de cada extração em `docs/specs/` para o estado atual da ponte.
