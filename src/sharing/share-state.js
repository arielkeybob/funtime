// Vocabulário único do compartilhamento, nas duas direções: cor = estado, seta =
// direção, ausência = nada. Puro (sem DOM) para valer igual em todo lugar do app.
//   live  — o evento está em andamento (verde ao receber, azul ao enviar)
//   grace — o evento terminou mas o acesso segue por até 24h (cinza)
//   none  — não há compartilhamento, foi revogado ou o prazo passou (sem selo)

export const SHARE_STATES = ["live", "grace", "none"];

export function shareState({ endedAt, expiresAtMs }, now = Date.now()) {
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) return "none";
  return endedAt == null ? "live" : "grace";
}

// Vários eventos da mesma pessoa viram um selo só: o melhor estado entre eles.
export function bestState(states) {
  if (states.includes("live")) return "live";
  if (states.includes("grace")) return "grace";
  return "none";
}
