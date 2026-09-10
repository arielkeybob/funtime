// Modelo puro de eventos e agenda; intervalos das doses continuam globais.
(function (root) {
  const finite = value => typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime());
  const active = items => (items || []).find(item => item.startedAt != null && item.endedAt === null) || null;
  const pending = item => item.startedAt === null && item.closedAt == null;
  const contains = (item, timestamp) => item.startedAt != null && timestamp >= item.startedAt && timestamp <= (item.endedAt ?? item.scheduledEndAt ?? Infinity);
  function normalize(data) {
    const fail = () => { throw new Error('Os eventos contêm datas ou vínculos incompatíveis. Nenhum registro foi descartado.'); };
    if (data.occasions !== undefined && !Array.isArray(data.occasions)) fail();
    if ((data.occasions || []).length > 10000) fail();
    const ids = new Set();
    const items = (data.occasions || []).map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200 || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80) fail();
      if (item.startedAt !== null && !finite(item.startedAt)) fail();
      if (item.endedAt !== null && (!finite(item.endedAt) || item.startedAt === null || item.endedAt < item.startedAt)) fail();
      const value = { id: item.id, name: item.name.trim(), startedAt: item.startedAt, endedAt: item.endedAt };
      for (const key of ['scheduledStartAt', 'scheduledEndAt', 'closedAt']) {
        if (item[key] !== undefined) { if (item[key] !== null && !finite(item[key])) fail(); value[key] = item[key]; }
      }
      if (item.autoStart !== undefined) { if (typeof item.autoStart !== 'boolean') fail(); value.autoStart = item.autoStart; }
      if (item.endReason !== undefined) {
        if (item.endReason !== null && !['manual', 'scheduled', 'recovery48h', 'empty48h', 'expired', 'cancelled'].includes(item.endReason)) fail();
        value.endReason = item.endReason;
      }
      if (item.timeZone !== undefined) {
        try { if (typeof item.timeZone !== 'string') fail(); new Intl.DateTimeFormat('pt-BR', { timeZone: item.timeZone }).format(); } catch { fail(); }
        value.timeZone = item.timeZone;
      }
      if (value.startedAt === null && (!finite(value.scheduledStartAt) || value.endedAt !== null)) fail();
      if (value.scheduledEndAt != null && value.scheduledEndAt <= (value.startedAt ?? value.scheduledStartAt)) fail();
      if (value.startedAt !== null && value.endedAt === null && value.closedAt != null) fail();
      if (value.startedAt === null && value.closedAt != null && !['expired', 'cancelled'].includes(value.endReason)) fail();
      ids.add(value.id); return value;
    });
    const sorted = items.filter(item => item.startedAt !== null).sort((a, b) => a.startedAt - b.startedAt);
    for (let i = 1; i < sorted.length; i++) if (sorted[i - 1].endedAt === null || sorted[i].startedAt < sorted[i - 1].endedAt) fail();
    const byId = new Map(items.map(item => [item.id, item]));
    for (const record of data.events || []) {
      if (record.occasionId == null) continue;
      if (typeof record.occasionId !== 'string' || !byId.has(record.occasionId) || !contains(byId.get(record.occasionId), record.consumedAt)) fail();
    }
    return items;
  }
  function includeUnassigned(records, item) {
    return records.map(record => !record.occasionId && contains(item, record.consumedAt) ? { ...record, occasionId: item.id } : record);
  }
  function reconcileStep(data, now) {
    let items = normalize(data); let records = data.events; const changes = [];
    const replace = item => { items = items.map(old => old.id === item.id ? item : old); };
    const current = active(items);
    if (current) {
      const doses = records.filter(record => record.occasionId === current.id);
      let endedAt = null; let reason = null;
      if (current.scheduledEndAt != null && now >= current.scheduledEndAt) { endedAt = current.scheduledEndAt; reason = 'scheduled'; }
      else if (current.scheduledEndAt == null && now >= current.startedAt + 48 * 3600000) {
        const lastEnd = doses.reduce((last, dose) => Math.max(last, Number.isFinite(dose.countingStoppedAt) ? Math.max(dose.consumedAt, dose.countingStoppedAt) : dose.consumedAt + dose.intervalMinutes * 60000), current.startedAt);
        if (!doses.length) { endedAt = current.startedAt + 48 * 3600000; reason = 'empty48h'; }
        else if (lastEnd <= now) { endedAt = lastEnd; reason = 'recovery48h'; }
      }
      if (endedAt !== null) { replace({ ...current, endedAt, closedAt: now, endReason: reason }); changes.push({ id: current.id, type: 'ended' }); }
    }
    for (const item of [...items].filter(pending).sort((a, b) => a.scheduledStartAt - b.scheduledStartAt || a.id.localeCompare(b.id))) {
      if (item.scheduledStartAt > now) continue;
      if (item.scheduledEndAt != null && item.scheduledEndAt <= now) {
        replace({ ...item, closedAt: now, endReason: 'expired' }); changes.push({ id: item.id, type: 'expired' }); continue;
      }
      if (!item.autoStart || active(items)) continue;
      const started = { ...item, startedAt: item.scheduledStartAt, closedAt: null, endReason: null };
      const candidate = items.map(old => old.id === item.id ? started : old);
      const linked = includeUnassigned(records, started);
      try { normalize({ occasions: candidate, events: linked }); }
      catch { continue; } // Conflito exige início manual em horário revisado.
      items = candidate; records = linked; changes.push({ id: item.id, type: 'started' });
    }
    normalize({ occasions: items, events: records });
    return { occasions: items, events: records, changes };
  }
  function reconcile(data, now = Date.now()) {
    if (data.preferences?.eventsEnabled === false) return { occasions: normalize(data), events: data.events, changes: [] };
    let next = { occasions: data.occasions, events: data.events }; const changes = [];
    for (let i = 0; i <= (data.occasions || []).length; i++) {
      next = reconcileStep(next, now); changes.push(...next.changes);
      if (!next.changes.some(change => change.type === 'started')) break;
    }
    return { occasions: next.occasions, events: next.events, changes };
  }
  function configure(data, enabled, now = Date.now()) {
    const occasions = normalize(data).map(item => {
      if (!enabled && item.startedAt !== null && item.endedAt === null) {
        const end = (data.events || []).filter(record => record.occasionId === item.id).reduce((last, record) => Math.max(last, record.consumedAt), Math.max(now, item.startedAt));
        return { ...item, endedAt: end, closedAt: now, endReason: 'manual' };
      }
      // Agendamentos vencidos durante a suspensão exigem início manual.
      if (enabled && pending(item) && item.scheduledStartAt <= now) return { ...item, autoStart: false };
      return item;
    });
    return { ...data, occasions, preferences: { ...data.preferences, eventsEnabled: enabled } };
  }
  const api = { normalize, contains, includeUnassigned, active, pending, reconcile, configure };
  root.FunTimeOccasions = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
