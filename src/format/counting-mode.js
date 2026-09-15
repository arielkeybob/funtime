export function resolveCountingMode(preferenceMode, upsideDownActive) {
  const normal = preferenceMode === "normal";
  return (upsideDownActive ? !normal : normal) ? "normal" : "countdown";
}
