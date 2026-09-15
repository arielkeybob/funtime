export const PIN_PBKDF2_ITERATIONS = 210000;

export async function derivePinHash(pin, saltBytes, iterations = PIN_PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: saltBytes,
    iterations,
    hash: "SHA-256",
  }, material, 256);
  return new Uint8Array(bits);
}
