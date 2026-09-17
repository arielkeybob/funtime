// Resumo de consumo de uma ocasião. `identify` é injetado porque quem vê um evento
// compartilhado não tem o cadastro de bebidas de quem compartilhou — desse lado a
// identidade vem do nome e do ícone gravados na própria dose.
export function summarizeOccasionDoses(records, identify) {
  const list = Array.isArray(records) ? records : [];
  const totals = new Map();

  for (const record of list) {
    const { name, icon } = identify(record);
    const current = totals.get(name);
    if (current) current.count += 1;
    else totals.set(name, { name, icon, count: 1 });
  }

  return { count: list.length, totals: [...totals.values()] };
}
