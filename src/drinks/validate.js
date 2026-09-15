export function validateDrinkDraft({ name, icon, hours, minutes }) {
  const fieldErrors = [];
  if (!name) fieldErrors.push("name");
  if (!icon) fieldErrors.push("icon");
  if (fieldErrors.length) return { ok: false, fieldErrors };

  if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
    return { ok: false, message: "Use um valor de horas entre 0 e 24." };
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return { ok: false, message: "Use um valor de minutos entre 0 e 59." };
  }
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes < 1 || totalMinutes > 1440) {
    return { ok: false, message: "O intervalo deve ficar entre 1 minuto e 24 horas." };
  }
  return { ok: true, totalMinutes };
}
