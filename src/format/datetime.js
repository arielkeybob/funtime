export function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function formatClock(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatHistoryElapsed(timestamp, now = Date.now()) {
  const elapsedMs = Math.max(0, now - Number(timestamp));
  const totalMinutes = Math.floor(elapsedMs / 60000);

  if (totalMinutes < 1) return "menos de 1 min atrás";
  if (totalMinutes < 60) return `${totalMinutes} min atrás`;

  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}h atrás`;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  return `${days} ${days === 1 ? "dia" : "dias"} atrás`;
}

export function formatInterval(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}
