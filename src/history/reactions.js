export const REACTIONS = [
  { id: "terrible", icon: "🤢", label: "Péssimo" },
  { id: "sad", icon: "😢", label: "Triste" },
  { id: "meh", icon: "🙄", label: "Indiferente" },
  { id: "liked", icon: "🙂", label: "Gostei" },
  { id: "great", icon: "🤩", label: "Ótimo" },
];

// "disliked" (😕 "Não gostei") saiu do seletor, substituída por "sad"/"meh" -
// mas um registro antigo pode ter esse id salvo. Nunca remova uma entrada
// daqui: só pare de oferecê-la em REACTIONS (o seletor). Mantém o id válido
// (normalizeReaction) e exibível (getReactionById) para não perder a reação
// de quem já tinha escolhido antes da mudança.
const LEGACY_REACTIONS = [
  { id: "disliked", icon: "😕", label: "Não gostei" },
];

const ALL_REACTIONS = [...REACTIONS, ...LEGACY_REACTIONS];

export const REACTION_IDS = new Set(ALL_REACTIONS.map((reaction) => reaction.id));

export function normalizeReaction(value) {
  return typeof value === "string" && REACTION_IDS.has(value) ? value : null;
}

export function getReactionById(id) {
  return ALL_REACTIONS.find((reaction) => reaction.id === id) || null;
}

// Selo do histórico quando o registro ainda não tem reação - traço fino, sem cor
// (herda "currentColor"), carinha com um "+" no canto, no espírito de ícones como
// o "add reaction" do Material Symbols. Emoji não serviria aqui: são glifos
// coloridos que ignoram "color"/"font-weight" do CSS.
export const ADD_REACTION_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.73 9.93 A8 8 0 1 1 13.07 4.27" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="7.6" cy="11" r="1.3" fill="currentColor"/><circle cx="13.4" cy="11" r="1.3" fill="currentColor"/><path d="M7 15c1 1.3 2.3 2 3.5 2s2.5-.7 3.5-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M18 2.2v7.6M14.2 6h7.6" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`;
