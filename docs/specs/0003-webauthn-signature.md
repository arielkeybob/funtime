# 0003 — Extrair `derEcdsaSignatureToRaw` para `src/security/webauthn-signature.js`

Status: implementada

## Contexto

`derEcdsaSignatureToRaw(signature, coordinateLength = 32)` (app.js:720-749) é um
parser puro de bytes: converte a assinatura ECDSA no formato DER (que o
WebAuthn/`navigator.credentials.get()` devolve) para o formato raw
concatenado (`R ++ S`) que outras APIs esperam. Não acessa `state`, DOM, nem
nenhuma API do navegador além de `Uint8Array`/`Error` — é matemática de bytes
pura. Usada uma única vez, em `verifyDeviceCredential()` (app.js:839).

**Zero cobertura de teste hoje** — confirmei com busca em todo o repositório.
É exatamente o tipo de código "fiddly" (parsing de formato binário, múltiplos
ramos de erro, casos de borda de padding) que mais se beneficia de teste
unitário direto e que os testes de integração (que dependem de WebAuthn real
via Playwright) nunca exercitam de fato — o AUDIT.md já apontava esse gap.

## Decisão

Corta-cola a função, sem alterar uma linha de lógica, para
`src/security/webauthn-signature.js`. `app.js` perde a definição; o único call
site (linha 839, dentro de `verifyDeviceCredential`) não muda nada, porque já
referencia `derEcdsaSignatureToRaw` como identificador solto — continua
funcionando via o valor publicado em `globalThis` pelo bridge.

`src/bootstrap/legacy-bridge.js` ganha mais uma importação/publicação.

**O que não muda:** as três mensagens de erro exatas (`"Assinatura ECDSA
inválida."`, `"Assinatura ECDSA sem R."`, `"Assinatura ECDSA sem S."`, e a
implícita `"Assinatura ECDSA fora do tamanho esperado."`), o atalho para
assinatura já em formato raw (`bytes.length === coordinateLength*2 &&
bytes[0] !== 0x30`), e a lógica de remover bytes `0x00` de padding de R/S.

## Contrato do módulo

```js
// src/security/webauthn-signature.js
export function derEcdsaSignatureToRaw(signature, coordinateLength = 32) { … } // → Uint8Array(coordinateLength*2)
```

## Casos de borda preservados (validados manualmente antes desta spec)

Construí e testei os 6 vetores abaixo contra a implementação atual antes de
propor esta extração, para garantir que os valores esperados do novo teste
estão corretos:

1. DER com R e S de 32 bytes cada, sem padding — resultado = `R ++ S` (64 bytes).
2. DER com R de 33 bytes (byte `0x00` de padding porque o valor real tem o bit
   alto ligado) — resultado remove o padding e devolve R de 32 bytes ++ S.
3. Entrada já em formato raw (64 bytes, primeiro byte ≠ `0x30`) — devolvida
   sem modificação (atalho da primeira linha da função).
4. Bytes inválidos (nem DER, nem tamanho raw correto) — lança "Assinatura
   ECDSA inválida.".
5. DER sem marcador `0x02` de R — lança "Assinatura ECDSA sem R.".
6. R com 33 bytes sem padding removível (nenhum byte líder é `0x00`) — lança
   "Assinatura ECDSA fora do tamanho esperado.".

## Plano de teste

- `node --check src/security/webauthn-signature.js`, `node --check src/bootstrap/legacy-bridge.js`, `node --check app.js`.
- Novo `tests/security-webauthn-signature.test.cjs`: os 6 vetores acima, cobertura que não existia.
- Nenhum teste existente referencia esta função — nada para migrar/ajustar.
- Rodar a suíte completa; baseline atual (pós Fase 1.2) é 113/115, com as 2 falhas conhecidas em `receiver-browser.test.cjs`.
- Sem teste manual necessário — WebAuthn real não é testável neste ambiente (já era assim antes); a extração não muda esse fato.
- Fora desta rodada: `createDeviceCredential`/`verifyDeviceCredential` continuam em `app.js` (dependem de `state`, `navigator.credentials`, diálogos).
