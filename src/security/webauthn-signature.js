export function derEcdsaSignatureToRaw(signature, coordinateLength = 32) {
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
  if (bytes.length === coordinateLength * 2 && bytes[0] !== 0x30) return bytes;
  if (bytes[0] !== 0x30) throw new Error("Assinatura ECDSA inválida.");

  let offset = 1;
  let sequenceLength = bytes[offset++];
  if (sequenceLength & 0x80) {
    const lengthBytes = sequenceLength & 0x7f;
    sequenceLength = 0;
    for (let i = 0; i < lengthBytes; i += 1) sequenceLength = (sequenceLength << 8) | bytes[offset++];
  }

  if (bytes[offset++] !== 0x02) throw new Error("Assinatura ECDSA sem R.");
  let rLength = bytes[offset++];
  let r = bytes.slice(offset, offset + rLength);
  offset += rLength;
  if (bytes[offset++] !== 0x02) throw new Error("Assinatura ECDSA sem S.");
  let sLength = bytes[offset++];
  let s = bytes.slice(offset, offset + sLength);

  while (r.length > coordinateLength && r[0] === 0) r = r.slice(1);
  while (s.length > coordinateLength && s[0] === 0) s = s.slice(1);
  if (r.length > coordinateLength || s.length > coordinateLength) throw new Error("Assinatura ECDSA fora do tamanho esperado.");

  const raw = new Uint8Array(coordinateLength * 2);
  raw.set(r, coordinateLength - r.length);
  raw.set(s, coordinateLength * 2 - s.length);
  return raw;
}
