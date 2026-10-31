// Fundo das telas neutras, escolhido em Aparência (specs 0031 e 0034): a imagem padrão do app, uma
// imagem do usuário ou uma cor sólida. Este módulo só prepara e lê a escolha; quem grava no aparelho
// é app.js (convenção de src/: módulos não tocam localStorage).

// Uma foto de celular reduzida a 1600 px e regravada em JPEG fica em ~150–400 KB. O teto protege o
// espaço do localStorage, que é dividido com bebidas e histórico.
export const BACKGROUND_MAX_CHARS = 1_500_000;
const ENCODE_STEPS = [[1600, 0.8], [1280, 0.72], [1024, 0.65]];

export const DEFAULT_BACKGROUND_IMAGE = "./images/fundo-padrao.webp";
export const DEFAULT_BACKGROUND_COLOR = "#09090b";
export const BACKGROUND_MODES = ["default", "image", "color"];

// Cores prontas da Cor sólida: todas escuras o bastante para o texto cinza (--muted) ficar legível.
export const BACKGROUND_COLORS = [
  { name: "Preto", color: DEFAULT_BACKGROUND_COLOR },
  { name: "Grafite", color: "#1f1f24" },
  { name: "Azul-noite", color: "#0f1a2e" },
  { name: "Petróleo", color: "#0c2427" },
  { name: "Verde-musgo", color: "#142016" },
  { name: "Vinho", color: "#2a0f17" },
  { name: "Café", color: "#241812" }
];

// Luminância máxima do fundo: com ela, --muted (#a1a1aa) fica em 4,5:1 e o texto branco bem acima.
export const MAX_BACKGROUND_LUMINANCE = 0.04;

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(typeof hex === "string" ? hex.trim() : "");
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Cor clara demais é escurecida mantendo o tom (escala os três canais juntos) até o texto continuar
// legível. Cor inválida vira o preto padrão.
export function legibleBackgroundColor(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return { color: DEFAULT_BACKGROUND_COLOR, adjusted: false };
  const original = toHex(rgb);
  if (relativeLuminance(original) <= MAX_BACKGROUND_LUMINANCE) return { color: original, adjusted: false };
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (relativeLuminance(toHex(rgb.map((v) => v * mid))) <= MAX_BACKGROUND_LUMINANCE) low = mid; else high = mid;
  }
  return { color: toHex(rgb.map((v) => v * low)), adjusted: true };
}

export function defaultBackgroundSetting() {
  return { mode: "default", image: null, color: null };
}

// Cabe a imagem num quadrado de `maxSide`, sem aumentar.
export function fitWithin(width, height, maxSide) {
  if (!(width > 0) || !(height > 0)) throw new Error("Imagem sem tamanho.");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const isStoredImage = (image) => typeof image === "string" && image.startsWith("data:image/");

// Guarda o modo e, juntos, a imagem e a cor do usuário: trocar de modo não apaga nenhuma das duas.
export function serializeBackground(setting, now = Date.now()) {
  return JSON.stringify({
    version: 2,
    mode: setting.mode,
    image: isStoredImage(setting.image) ? setting.image : null,
    color: parseHex(setting.color) ? setting.color.toLowerCase() : null,
    updatedAt: now
  });
}

// Lê a escolha guardada. Versão 1 (spec 0031) só tinha a imagem e vira "Minha imagem". Ausente,
// inválido ou de outro formato vira o padrão, nunca erro. Modo sem o que precisa também vira padrão.
export function parseStoredBackground(raw) {
  const fallback = defaultBackgroundSetting();
  if (typeof raw !== "string" || !raw) return fallback;
  let data;
  try { data = JSON.parse(raw); } catch { return fallback; }
  if (data?.version === 1) return isStoredImage(data.image) ? { mode: "image", image: data.image, color: null } : fallback;
  if (data?.version !== 2) return fallback;
  const image = isStoredImage(data.image) ? data.image : null;
  const color = parseHex(data.color) ? data.color.toLowerCase() : null;
  let mode = BACKGROUND_MODES.includes(data.mode) ? data.mode : "default";
  if (mode === "image" && !image) mode = "default";
  return { mode, image, color };
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
