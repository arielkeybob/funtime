// Ponte temporária: publica em globalThis o que os scripts clássicos (app.js e
// os demais arquivos da raiz, ainda não convertidos para módulo ES) esperam
// encontrar como identificador solto. Cresce uma linha a cada extração; some
// quando o último consumidor virar módulo (ver docs/specs/).
import { formatTime, formatClock, formatHistoryElapsed, formatInterval } from "../format/datetime.js";

Object.assign(globalThis, { formatTime, formatClock, formatHistoryElapsed, formatInterval });
