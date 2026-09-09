// Regras puras: ocasiões organizam doses, nunca reiniciam os intervalos.
(function (root) {
  const contains = (occasion, timestamp) => timestamp >= occasion.startedAt && (occasion.endedAt === null || timestamp <= occasion.endedAt);
  function normalize(data) {
    const fail = () => { throw new Error('Os eventos contêm datas ou vínculos incompatíveis. Nenhum registro foi descartado.'); };
    if (data.occasions !== undefined && !Array.isArray(data.occasions)) fail();
    if ((data.occasions || []).length > 10000) fail();
    const ids = new Set();
    const occasions = (data.occasions || []).map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200 || ids.has(item.id) ||
          typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 ||
          !Number.isFinite(item.startedAt) || !Number.isFinite(new Date(item.startedAt).getTime()) ||
          (item.endedAt !== null && (!Number.isFinite(item.endedAt) || !Number.isFinite(new Date(item.endedAt).getTime()) || item.endedAt < item.startedAt))) fail();
      ids.add(item.id);
      return { id: item.id, name: item.name.trim(), startedAt: item.startedAt, endedAt: item.endedAt };
    });
    const sorted = [...occasions].sort((a, b) => a.startedAt - b.startedAt);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1].endedAt === null || sorted[i].startedAt < sorted[i - 1].endedAt) fail();
    }
    const byId = new Map(occasions.map(item => [item.id, item]));
    for (const record of data.events || []) {
      if (record.occasionId == null) continue;
      if (typeof record.occasionId !== 'string' || !byId.has(record.occasionId) || !contains(byId.get(record.occasionId), record.consumedAt)) fail();
    }
    return occasions;
  }
  function includeUnassigned(records, occasion) {
    return records.map(record => !record.occasionId && contains(occasion, record.consumedAt)
      ? { ...record, occasionId: occasion.id } : record);
  }
  const api = { normalize, contains, includeUnassigned, active: occasions => (occasions || []).find(item => item.endedAt === null) || null };
  root.FunTimeOccasions = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
