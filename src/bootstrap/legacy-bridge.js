// Ponte temporária: publica em globalThis o que os scripts clássicos (app.js e
// os demais arquivos da raiz, ainda não convertidos para módulo ES) esperam
// encontrar como identificador solto. Cresce uma linha a cada extração; some
// quando o último consumidor virar módulo (ver docs/specs/).
import { formatTime, formatClock, formatHistoryElapsed, formatInterval } from "../format/datetime.js";
import { resolveCountingMode } from "../format/counting-mode.js";
import { derEcdsaSignatureToRaw } from "../security/webauthn-signature.js";
import { derivePinHash, PIN_PBKDF2_ITERATIONS } from "../security/pin-crypto.js";
import { commit } from "../data/store.js";
import { wireDialogDismissal } from "../ui/dialogs.js";
import { createDurationPicker } from "../ui/wheel-picker.js";
import { createFieldErrorController, createFormErrorController } from "../ui/field-errors.js";
import { createDrinkReorderController } from "../ui/drink-reorder.js";
import { createIconReorderController } from "../ui/icon-reorder.js";

Object.assign(globalThis, {
  formatTime, formatClock, formatHistoryElapsed, formatInterval, resolveCountingMode,
  derEcdsaSignatureToRaw,
  derivePinHash, PIN_PBKDF2_ITERATIONS,
  commitAppData: commit,
  wireDialogDismissal,
  createDurationPicker,
  createFieldErrorController, createFormErrorController,
  createDrinkReorderController, createIconReorderController,
});
