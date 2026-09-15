export function commit(storageKey, current, patch) {
  const next = { ...current, ...patch };
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}
