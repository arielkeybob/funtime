// Celular deitado: o FunTime funciona só em pé. O manifest pede "portrait" e, onde o sistema
// deixa (app instalado no Android), a tela é travada de verdade. Onde não deixa (iPhone, aba do
// navegador), <html> ganha .is-landscape-phone e o app fica escondido atrás de um aviso até o
// aparelho voltar a ficar em pé (styles.css). Tablet e computador continuam girando livres.

// Lado curto da tela abaixo disto é celular (iPhone Pro Max: 440; iPad mini: 744).
export const PHONE_MAX_SHORT_SIDE = 600;

// Precisa da janela mais larga que alta e também do aparelho deitado: com o teclado aberto, a
// janela de alguns celulares fica mais larga que alta sem que ninguém tenha deitado o aparelho.
export function isLandscapePhone({ coarsePointer, screenWidth, screenHeight, orientationType, legacyAngle, viewportLandscape }) {
  if (!coarsePointer || !viewportLandscape || !(Math.min(screenWidth, screenHeight) < PHONE_MAX_SHORT_SIDE)) return false;
  if (typeof orientationType === "string") return orientationType.startsWith("landscape");
  if (typeof legacyAngle === "number") return Math.abs(legacyAngle) === 90;
  return true;
}

export function initializeOrientationLock(win = globalThis) {
  const orientation = win.screen?.orientation;
  const coarse = win.matchMedia("(pointer: coarse)");
  const landscape = win.matchMedia("(orientation: landscape)");
  const update = () => win.document.documentElement.classList.toggle("is-landscape-phone", isLandscapePhone({
    coarsePointer: coarse.matches,
    screenWidth: win.screen.width,
    screenHeight: win.screen.height,
    orientationType: orientation?.type,
    legacyAngle: win.orientation,
    viewportLandscape: landscape.matches,
  }));
  // Fora do app instalado/tela cheia o navegador recusa a trava; aí fica só o aviso.
  try { orientation?.lock?.("portrait")?.catch(() => {}); } catch { /* sem suporte */ }
  orientation?.addEventListener?.("change", update);
  win.addEventListener("orientationchange", update);
  win.addEventListener("resize", update);
  update();
}
