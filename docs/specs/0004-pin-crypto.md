# 0004 — Extrair `derivePinHash`/`PIN_PBKDF2_ITERATIONS` para `src/security/pin-crypto.js`

Status: proposta

## Contexto

`derivePinHash(pin, saltBytes, iterations = PIN_PBKDF2_ITERATIONS)`
(app.js:681-696) deriva o hash do PIN via PBKDF2-SHA256 usando `crypto.subtle`
— não acessa `state` nem DOM, só a API Web Crypto (ambiente global, disponível
tanto no navegador quanto em teste via `require('node:crypto').webcrypto`,
padrão já usado em `tests/audit.test.cjs`/`tests/migration.test.cjs`).
`PIN_PBKDF2_ITERATIONS` (app.js:300, valor `210000`) é a constante de
iterações padrão.

Usada em 3 pontos de `app.js`: linha 552 (fallback ao ler config de segurança
legada), 948 (criar PIN) e 1068 (verificar PIN). Hoje só é exercitada
indiretamente, através do fluxo completo de PIN nos testes de
`reset.test.cjs`/`navigation-browser.test.cjs` — nenhum teste isola a função
de derivação em si (mesmo gap que a spec 0003, apontado no AUDIT.md).

**Ponto de atenção verificado:** `tests/navigation-browser.test.cjs:79-89` faz
algo incomum — dentro de `page.evaluate()`, reatribui a variável global
`derivePinHash` em tempo de execução real do navegador (`derivePinHash = () =>
new Promise(...)`) para simular uma verificação de PIN lenta, depois restaura
o valor original. Isso funciona hoje porque uma `function` declarada no
topo de um script clássico vira uma propriedade gravável do objeto global, e
qualquer chamada a `derivePinHash(...)` dentro de `app.js` faz a busca do
identificador em tempo de chamada (não captura uma referência fixa). Depois da
extração, `derivePinHash` continua sendo uma propriedade gravável comum de
`globalThis` (publicada por `Object.assign` no lugar de por `function`
declaration) — o mecanismo de reatribuição do teste continua funcionando pelo
mesmo motivo. Vou confirmar isso rodando esse teste especificamente, não só
supondo.

## Decisão

Corta-cola `derivePinHash` e `PIN_PBKDF2_ITERATIONS` para
`src/security/pin-crypto.js`, sem alterar lógica. `app.js` perde as duas
definições (linha 300 e 681-696); os três call sites não mudam — continuam
referenciando os dois identificadores soltos, agora vindos do `globalThis`
publicado pelo bridge.

`src/bootstrap/legacy-bridge.js` ganha mais uma importação/publicação (a
quarta desta fase).

**O que não muda:** o algoritmo (PBKDF2/SHA-256), o valor de
`PIN_PBKDF2_ITERATIONS`, o comportamento de reatribuição usado pelo teste de
navegação.

## Contrato do módulo

```js
// src/security/pin-crypto.js
export const PIN_PBKDF2_ITERATIONS = 210000;
export async function derivePinHash(pin, saltBytes, iterations = PIN_PBKDF2_ITERATIONS) { … } // → Promise<Uint8Array(32)>
```

## Casos de borda preservados

- Mesmo `pin`+`salt`+`iterations` → mesmo hash (determinístico).
- `salt` diferente → hash diferente.
- `iterations` diferente → hash diferente.
- Omitir `iterations` usa exatamente `PIN_PBKDF2_ITERATIONS` (210000) — hash
  idêntico ao de chamar explicitamente com esse valor.
- Saída sempre 32 bytes (digest SHA-256).
- `tests/navigation-browser.test.cjs:79-89` continua passando sem
  modificação (verificado na validação, não só previsto).

## Plano de teste

- `node --check src/security/pin-crypto.js`, `node --check src/bootstrap/legacy-bridge.js`, `node --check app.js`.
- Novo `tests/security-pin-crypto.test.cjs`: os casos de borda acima, usando `require('node:crypto').webcrypto` como `globalThis.crypto` (mesmo padrão dos testes existentes).
- Rodar a suíte completa, com atenção especial a `tests/navigation-browser.test.cjs` e `tests/reset.test.cjs` (fluxo de PIN de ponta a ponta) — confirmar que continuam passando sem alteração.
- Sem teste manual adicional além do smoke check de navegador já usado nas fases anteriores.
- Fora desta rodada: `createDeviceCredential`, `verifyDeviceCredential`, `verifyPin` e o restante do fluxo de segurança de alto nível continuam em `app.js` (dependem de `state`, diálogos, `navigator.credentials`).
