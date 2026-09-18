// QR do pareamento: gerar (quem convida) e ler pela câmera (quem entra). As duas
// bibliotecas ficam em src/vendor, vão no pré-cache e só são carregadas na primeira
// vez que o diálogo de pareamento precisa delas. Nada da imagem da câmera sai do
// aparelho nem é gravado.

let generatorPromise = null;
let jsqrPromise = null;

function loadGenerator() {
  generatorPromise ??= import("../vendor/qrcode-generator.js").then((module) => module.default);
  return generatorPromise;
}

// jsQR é UMD (não há build ES): o script clássico publica `jsQR` em globalThis.
function loadJsQR() {
  jsqrPromise ??= new Promise((resolve, reject) => {
    if (globalThis.jsQR) { resolve(globalThis.jsQR); return; }
    const script = document.createElement("script");
    script.src = new URL("../vendor/jsqr.js", import.meta.url).href;
    script.onload = () => (globalThis.jsQR ? resolve(globalThis.jsQR) : reject(new Error("jsQR ausente")));
    script.onerror = () => reject(new Error("Falha ao carregar jsQR"));
    document.head.append(script);
  }).catch((falha) => { jsqrPromise = null; throw falha; });
  return jsqrPromise;
}

// Data URL de uma imagem GIF do QR (correção de erro M). O módulo de margem (quiet
// zone) vem do próprio gerador; o fundo é sempre claro para o contraste da leitura.
export async function renderQrDataUrl(text, cellSize = 6) {
  const qrcode = await loadGenerator();
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cellSize, 4);
}

export function cameraAvailable() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
}

// Liga a câmera traseira no <video> e chama `onText` a cada QR decodificado (a mesma
// leitura pode repetir; quem chama decide quando parar). Devolve `stop()`, que
// encerra as trilhas — a câmera precisa apagar ao cancelar, ler ou fechar o diálogo.
export async function startScanner(video, onText) {
  const jsQR = await loadJsQR();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });

  let active = true;
  let frame = 0;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  video.srcObject = stream;
  video.setAttribute("playsinline", "");
  video.muted = true;
  try { await video.play(); } catch { /* o autoplay já cobre */ }

  let last = 0;
  function tick(time) {
    if (!active) return;
    frame = requestAnimationFrame(tick);
    if (time - last < 100 || video.readyState < 2 || !video.videoWidth) return;
    last = time;

    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
    if (found?.data) onText(found.data);
  }
  frame = requestAnimationFrame(tick);

  return function stop() {
    active = false;
    cancelAnimationFrame(frame);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
}

// Só para testes: decodifica um ImageData já pronto com a mesma biblioteca.
export async function decodeImageData(data, width, height) {
  const jsQR = await loadJsQR();
  return jsQR(data, width, height)?.data ?? null;
}
