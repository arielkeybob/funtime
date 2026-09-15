# Specs do refactor FunTime

Cada extração de módulo relevante do monólito `app.js` (ou mudança estrutural
equivalente) ganha uma spec curta aqui **antes** de ser implementada, seguindo
`TEMPLATE.md`. O objetivo é alinhar contrato, casos de borda e plano de teste com o
usuário antes de mexer no código — não é um processo burocrático, é um documento de
1 página por módulo.

Contexto geral do refactor: ver o plano aprovado em
`C:\Users\Ariel Souza\.claude\plans\eu-fiz-esse-app-refactored-lampson.md`.

## Índice

| # | Título | Status |
|---|--------|--------|
| [0001](0001-format-datetime.md) | Extrair formatters puros de data/hora para `src/format/datetime.js` | implementada |
| [0002](0002-counting-mode.md) | Extrair núcleo puro de `effectiveCountingMode` para `src/format/counting-mode.js` | implementada |
| [0003](0003-webauthn-signature.md) | Extrair `derEcdsaSignatureToRaw` para `src/security/webauthn-signature.js` | implementada |
| [0004](0004-pin-crypto.md) | Extrair `derivePinHash`/`PIN_PBKDF2_ITERATIONS` para `src/security/pin-crypto.js` | implementada |

Status possíveis: `proposta` (escrita, aguardando aprovação) · `aprovada` (pode
implementar) · `implementada` (já no código, commit referenciado).
