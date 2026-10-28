// Imagem de fundo escolhida pelo usuário em Aparência (spec 0031). Este módulo só prepara e lê a
// imagem; quem grava no aparelho é app.js (convenção de src/: módulos não tocam localStorage).

// Uma foto de celular reduzida a 1600 px e regravada em JPEG fica em ~150–400 KB. O teto protege o
// espaço do localStorage, que é dividido com bebidas e histórico.
export const BACKGROUND_MAX_CHARS = 1_500_000;
const ENCODE_STEPS = [[1600, 0.8], [1280, 0.72], [1024, 0.65]];

// Cabe a imagem num quadrado de `maxSide`, sem aumentar.
export function fitWithin(width, height, maxSide) {
  if (!(width > 0) || !(height > 0)) throw new Error("Imagem sem tamanho.");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function serializeBackground(image, now = Date.now()) {
  return JSON.stringify({ version: 1, image, updatedAt: now });
}

// Valor guardado inválido ou de outro formato vira "sem imagem", nunca erro.
export function parseStoredBackground(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.version === 1 && typeof data.image === "string" && data.image.startsWith("data:image/") ? data.image : null;
  } catch {
    return null;
  }
}

// Lê o arquivo, reduz e regrava em JPEG, cada tentativa menor que a anterior até caber.
// Arquivo sem tipo (alguns HEIC no Android) ainda é tentado; o navegador decide se abre.
export async function encodeBackgroundImage(file, { createBitmap = globalThis.createImageBitmap, documentRef = globalThis.document } = {}) {
  if (!file || (file.type && !file.type.startsWith("image/"))) throw new Error("Escolha um arquivo de imagem.");
  let bitmap;
  try {
    bitmap = await createBitmap(file);
  } catch {
    throw new Error("Não foi possível abrir esta imagem. Tente outra.");
  }
  try {
    for (const [maxSide, quality] of ENCODE_STEPS) {
      const size = fitWithin(bitmap.width, bitmap.height, maxSide);
      const canvas = documentRef.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, size.width, size.height);
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= BACKGROUND_MAX_CHARS) return url;
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error("Imagem grande demais. Tente outra.");
}
