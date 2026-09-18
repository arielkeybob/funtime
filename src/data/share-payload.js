import { summarizeOccasionDoses } from "../occasions/summary.js";

// Este módulo é onde mora a minimização de dados: é a única coisa que decide o que sai
// do aparelho de quem compartilha. Tudo que não estiver montado aqui, não sai.

export const SHARE_MAX_EVENTS = 1200;
export const SHARE_GRACE_MS = 24 * 60 * 60 * 1000;
const OCCASION_MAX_MS = 48 * 60 * 60 * 1000;

const finite = (value) => typeof value === "number" && Number.isFinite(value);

// (fim ?? fim programado ?? início + 48h) + 24h. As 48h espelham o encerramento
// forçado da própria ocasião, então uma ocasião esquecida aberta não vira acesso
// eterno.
export function shareExpiresAtMs(occasion, now = Date.now()) {
  const base = finite(occasion?.endedAt) ? occasion.endedAt
    : finite(occasion?.scheduledEndAt) ? occasion.scheduledEndAt
    : finite(occasion?.startedAt) ? occasion.startedAt + OCCASION_MAX_MS
    : now + OCCASION_MAX_MS;

  return base + SHARE_GRACE_MS;
}

// Só os campos listados aqui atravessam. `drinkId` e `occasionId` ficam de fora de
// propósito: o primeiro só faria sentido com o cadastro de bebidas de quem
// compartilhou, e o segundo é redundante — o documento inteiro já é um evento só.
function minimalDose(record) {
  const dose = {
    id: String(record.id),
    drinkName: String(record.drinkName ?? ""),
    drinkIcon: String(record.drinkIcon ?? ""),
    consumedAt: Number(record.consumedAt),
    intervalMinutes: finite(record.intervalMinutes) ? record.intervalMinutes : null,
    doseSize: finite(record.doseSize) ? record.doseSize : null,
  };

  if (finite(record.countingStoppedAt)) dose.countingStoppedAt = record.countingStoppedAt;
  return dose;
}

export function buildSharePayload({
  occasion, events, ownerUid, viewerUid, ownerAlias,
  now = Date.now(), maxEvents = SHARE_MAX_EVENTS,
}) {
  const doses = (Array.isArray(events) ? events : [])
    .filter((record) => record?.id && record.occasionId === occasion.id && finite(Number(record.consumedAt)))
    .sort((first, second) => Number(first.consumedAt) - Number(second.consumedAt));

  // Cortar não pode ser silencioso: manda as mais recentes, mas diz quantas existem.
  const kept = doses.length > maxEvents ? doses.slice(doses.length - maxEvents) : doses;
  const minimal = kept.map(minimalDose);
  const { totals } = summarizeOccasionDoses(minimal, (dose) => ({ name: dose.drinkName, icon: dose.drinkIcon }));

  return {
    schemaVersion: 1,
    ownerUid: String(ownerUid),
    viewerUid: String(viewerUid),
    ownerAlias: String(ownerAlias ?? ""),
    // Sem o id da ocasião: quem recebe identifica o evento pelo próprio
    // compartilhamento e não tem uso para o identificador de quem compartilhou.
    occasion: {
      name: String(occasion.name ?? ""),
      startedAt: finite(occasion.startedAt) ? occasion.startedAt : null,
      endedAt: finite(occasion.endedAt) ? occasion.endedAt : null,
    },
    events: minimal,
    totals,
    eventCount: doses.length,
    truncated: doses.length > minimal.length,
    lastEventAt: minimal.length ? minimal[minimal.length - 1].consumedAt : null,
    expiresAtMs: shareExpiresAtMs(occasion, now),
  };
}

// Falha fechada: qualquer coisa fora do formato vira recusa, nunca uma tela montada
// pela metade. Quem recebe não controla o que chega, então nada aqui confia no dado.
export function readSharePayload(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "malformed" };

  const expiresAtMs = typeof raw.expiresAt?.toMillis === "function" ? raw.expiresAt.toMillis() : raw.expiresAtMs;
  if (!finite(expiresAtMs)) return { ok: false, reason: "malformed" };
  if (expiresAtMs <= now) return { ok: false, reason: "expired" };

  // Carimbo de servidor, não o relógio de quem lê: uma tela "ao vivo" que confia no
  // próprio horário para se dizer atualizada pode mentir se o aparelho estiver
  // errado ou o dado vier do cache offline.
  const updatedAtMs = typeof raw.updatedAt?.toMillis === "function" ? raw.updatedAt.toMillis() : null;

  if (!raw.occasion || typeof raw.occasion !== "object") return { ok: false, reason: "malformed" };
  if (!Array.isArray(raw.events)) return { ok: false, reason: "malformed" };

  const events = raw.events
    .filter((dose) => dose?.id && finite(Number(dose.consumedAt)))
    .map(minimalDose);

  return {
    ok: true,
    view: {
      ownerAlias: String(raw.ownerAlias ?? ""),
      occasion: {
        name: String(raw.occasion.name ?? ""),
        startedAt: finite(raw.occasion.startedAt) ? raw.occasion.startedAt : null,
        endedAt: finite(raw.occasion.endedAt) ? raw.occasion.endedAt : null,
      },
      events,
      totals: summarizeOccasionDoses(events, (dose) => ({ name: dose.drinkName, icon: dose.drinkIcon })).totals,
      eventCount: finite(raw.eventCount) ? raw.eventCount : events.length,
      truncated: raw.truncated === true,
      expiresAtMs,
      updatedAtMs,
    },
  };
}
