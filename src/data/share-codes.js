// Código de pareamento: mostrado por quem convida, digitado por quem entra. Curto de
// propósito — é lido em voz alta ou de uma tela para outra, muitas vezes num lugar
// barulhento. A segurança vem da validade de 5 minutos e do aceite dos dois lados,
// não do comprimento.

export const PAIRING_CODE_LENGTH = 6;
// Sem 0 O 1 I L U Q: glifos que as pessoas confundem ao copiar de uma tela.
export const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKMNPRSTVWXYZ";

const defaultRandomBytes = (size) => globalThis.crypto.getRandomValues(new Uint8Array(size));

export function generatePairingCode(randomBytes = defaultRandomBytes) {
  // Descarta os bytes altos em vez de usar resto direto: `byte % 29` deixaria os
  // primeiros símbolos do alfabeto mais prováveis que os últimos.
  const limit = Math.floor(256 / PAIRING_CODE_ALPHABET.length) * PAIRING_CODE_ALPHABET.length;
  let code = "";

  while (code.length < PAIRING_CODE_LENGTH) {
    for (const byte of randomBytes(PAIRING_CODE_LENGTH)) {
      if (byte >= limit) continue;
      code += PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length];
      if (code.length === PAIRING_CODE_LENGTH) break;
    }
  }

  return code;
}

export function formatPairingCode(code) {
  const clean = String(code || "");
  return clean.length === PAIRING_CODE_LENGTH ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

// Devolve null (e não lança) quando não dá para aproveitar o que foi digitado: quem
// chama mostra o erro de digitação na tela.
export function normalizePairingCode(input) {
  const clean = String(input ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (clean.length !== PAIRING_CODE_LENGTH) return null;
  if (![...clean].every((character) => PAIRING_CODE_ALPHABET.includes(character))) return null;
  return clean;
}

// Reformata o que a pessoa está digitando, tecla a tecla: maiúsculas, descarta o que
// não pertence ao alfabeto, corta em 6 e insere o traço sozinho depois dos 3
// primeiros — assim nunca fica a dúvida de "precisa do traço ou não" na hora de
// digitar, o campo já mostra o formato certo.
export function liveFormatPairingCode(input) {
  const clean = [...String(input ?? "").toUpperCase()]
    .filter((character) => PAIRING_CODE_ALPHABET.includes(character))
    .slice(0, PAIRING_CODE_LENGTH)
    .join("");
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

// Determinístico e independente de ordem: um par de pessoas tem um documento só, e
// os dois lados calculam o mesmo id sem combinar nada.
export function buildPairId(uidA, uidB) {
  return [String(uidA), String(uidB)].sort().join("_");
}

export function otherUidOf(uids, myUid) {
  return (Array.isArray(uids) ? uids : []).find((uid) => uid !== myUid) ?? null;
}
