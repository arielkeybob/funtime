export const REACTIONS = [
  { id: "terrible", icon: "🤢", label: "Péssimo" },
  { id: "disliked", icon: "😕", label: "Não gostei" },
  { id: "liked", icon: "🙂", label: "Gostei" },
  { id: "great", icon: "🤩", label: "Ótimo" },
];

export const REACTION_IDS = new Set(REACTIONS.map((reaction) => reaction.id));

export function normalizeReaction(value) {
  return typeof value === "string" && REACTION_IDS.has(value) ? value : null;
}

export function getReactionById(id) {
  return REACTIONS.find((reaction) => reaction.id === id) || null;
}
