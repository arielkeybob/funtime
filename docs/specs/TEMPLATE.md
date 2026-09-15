# NNNN — Título do módulo

## Contexto

O que hoje está misturado em `app.js` (ou outro arquivo) e onde, com `arquivo:linha`
exatos. Por que essa extração está sendo feita agora (ordem de execução do plano).

## Decisão

O que muda estruturalmente: novo(s) arquivo(s) em `src/`, tipo de ponte usada
(consumido via `import` direto, ou publicado em `globalThis` pelo
`legacy-bridge.js`/pelo próprio `app.js` para quem ainda é script clássico). O que
explicitamente **não** muda.

## Contrato do módulo

- Exports nomeados e assinaturas de cada função.
- Dependências: o que este módulo importa; o que os arquivos que ainda são scripts
  clássicos continuam lendo via `globalThis` (e por quê, nesta fase).
- Compatibilidade de dados: confirma que o formato salvo em `localStorage`
  (`DATA_STORAGE_KEY`, `SECURITY_STORAGE_KEY`, etc.) não muda.

## Casos de borda preservados

Lista dos comportamentos de erro/mensagens/estados que devem continuar byte-a-byte
iguais, com referência ao teste (unitário ou `*-browser.test.cjs`) que já os cobre
hoje, se houver.

## Plano de teste

- `node --check` dos arquivos tocados.
- Testes `node:test` novos ou que substituem `extract()`/`vm.runInContext` existentes.
- Testes manuais relevantes de `DEVELOPMENT.md` (listar quais).
- O que fica explicitamente fora desta rodada.
