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
| [0005](0005-store-core.md) | Criar `src/data/store.js` (núcleo da persistência, sem migrar call sites ainda) | implementada |
| [0006](0006-store-mechanical-sites.md) | Migrar para `commit()` os 4 pontos que já têm try/catch correto | implementada |
| [0007](0007-store-ordering-bug-sites.md) | Corrigir os 5 pontos que mutam `state` antes de gravar | implementada |
| [0008](0008-more-ordering-bug-sites.md) | Mais 3 pontos com o mesmo bug de ordenação | implementada |
| [0009](0009-store-remaining-sites.md) | Fecha a Fase 2: últimos 4 pontos + `saveData()` reduzida a shim de teste | implementada |
| [0010](0010-dialog-dismissal.md) | Extrair `wireDialogDismissal` para `src/ui/dialogs.js` | implementada |
| [0011](0011-duration-picker.md) | Extrair `createDurationPicker` para `src/ui/wheel-picker.js` | implementada |
| [0012](0012-field-errors.md) | Extrair controladores de erro de campo/formulário para `src/ui/field-errors.js` | implementada |
| [0013](0013-drag-reorder-modules.md) | Mover drag-and-drop para módulos próprios, sem unificar | implementada |
| [0014](0014-easter-eggs.md) | Extrair easter eggs para `src/easter-eggs/index.js` | implementada |
| [0015](0015-drink-draft-validation.md) | Extrair `validateDrinkDraft` de `handleDrinkSubmit` | implementada |
| [0016](0016-render-tick-performance.md) | Separar tick (texto) de render estrutural | implementada |
| [0017](0017-app-js-module.md) | `app.js` vira módulo ES; remove `legacy-bridge.js` | implementada |
| [0018](0018-remove-v1-support.md) | Remover suporte à V1 ("Intervalo"): ponte, transferência e coexistência | implementada |
| [0019](0019-remaining-classic-scripts.md) | Converter os scripts clássicos restantes para módulos ES (Fase 8) | implementada |

Status possíveis: `proposta` (escrita, aguardando aprovação) · `aprovada` (pode
implementar) · `implementada` (já no código, commit referenciado).
