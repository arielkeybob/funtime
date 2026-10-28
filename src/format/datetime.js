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

export function formatDate(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp));
}

// Data da agenda de eventos: "sáb 17/10 · 21:23". O ano só aparece quando não é o corrente,
// e a abreviação do dia da semana vem sem o ponto que o pt-BR acrescenta ("sáb.").
export function formatAgendaDateTime(timestamp, now = Date.now()) {
  const parts = agendaDateParts(timestamp, now);
  return `${parts.weekday} ${parts.date} · ${parts.time}`;
}

// As mesmas partes, separadas para o bloquinho de data e a linha do tempo dos eventos:
// { weekday: "sáb", day: "17", date: "17/10", time: "21:23" }.
export function agendaDateParts(timestamp, now = Date.now()) {
  const date = new Date(timestamp);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear() === new Date(now).getFullYear() ? "" : `/${String(date.getFullYear()).slice(-2)}`;
  return { weekday, day, date: `${day}/${month}${year}`, time: formatClock(timestamp) };
}

// Dias de calendário entre duas datas locais: 0 no mesmo dia, 1 quando termina no dia seguinte.
export function calendarDaysBetween(start, end) {
  const midnight = (timestamp) => { const date = new Date(timestamp); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
  return Math.round((midnight(end) - midnight(start)) / 86400000);
}

// "Foi que horas?" do Anotar dose. Sem data escolhida, a hora vale para hoje e, se ainda não
// chegou, para ontem (01:00 agora e 23:00 na roleta = ontem 23:00). Com data ("AAAA-MM-DD"),
// ela manda e `isFuture` avisa quando a combinação ainda não aconteceu. Ver docs/specs/0030.
export function resolveLogTimestamp({ hour, minute, date = null, now = Date.now() }) {
  const today = new Date(now);
  const [year, month, day] = date ? date.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const moment = new Date(year, month - 1, day, Number(hour) || 0, Number(minute) || 0);
  if (!date && moment.getTime() > now) moment.setDate(moment.getDate() - 1);
  const timestamp = moment.getTime();
  return { timestamp, daysAgo: calendarDaysBetween(timestamp, now), isFuture: timestamp > now };
}

// Linha de data do Anotar dose: "Hoje · qua 28/10", "(ontem) ter 27/10" ou "sáb 12/09".
export function formatLogDay(timestamp, now = Date.now()) {
  const { weekday, date } = agendaDateParts(timestamp, now);
  const daysAgo = calendarDaysBetween(timestamp, now);
  if (daysAgo === 0) return `Hoje · ${weekday} ${date}`;
  if (daysAgo === 1) return `(ontem) ${weekday} ${date}`;
  return `${weekday} ${date}`;
}

// Duração de um evento: "45 min", "15 h 49 min" ou, a partir de um dia, "2 dias 5 h".
export function formatEventDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  if (totalMinutes < 24 * 60) return formatInterval(totalMinutes);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  return `${days} ${days === 1 ? "dia" : "dias"}` + (hours ? ` ${hours} h` : "");
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
