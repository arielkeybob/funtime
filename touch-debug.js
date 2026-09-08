// Diagnóstico opt-in, somente em memória. Não lê dados, campos ou armazenamento.
(() => {
  const toggle = document.querySelector('#touch-debug-enabled');
  const status = document.querySelector('#touch-debug-status');
  const exportButton = document.querySelector('#export-touch-debug');
  const clearButton = document.querySelector('#clear-touch-debug');
  const limit = 1500;
  let enabled = false, started = 0, entries = [], timer = null, lastMove = 0;
  const update = () => {
    toggle.checked = enabled;
    exportButton.disabled = !entries.length;
    clearButton.disabled = !entries.length;
    status.textContent = `${enabled ? 'Gravando' : 'Desativado'} · ${entries.length} eventos${entries.length === limit ? ' · limite atingido' : ''}`;
  };
  const stop = () => { enabled = false; clearTimeout(timer); update(); };
  const record = (stage, event = {}, reason = '', distance) => {
    if (!enabled) return;
    const now = performance.now();
    if (stage.endsWith('-move') && now - lastMove < 40) return;
    if (stage.endsWith('-move')) lastMove = now;
    const entry = { ms: Math.round(now - started), stage, event: event?.type || '', reason };
    if (event?.pointerType) entry.pointerType = event.pointerType;
    if (typeof event?.cancelable === 'boolean') entry.cancelable = event.cancelable;
    for (const [key, value] of Object.entries({ width: event?.width, height: event?.height, pressure: event?.pressure, distance })) {
      if (Number.isFinite(value)) entry[key] = Math.round(value * 100) / 100;
    }
    entries.push(entry);
    if (entries.length >= limit) stop(); else update();
  };
  toggle.addEventListener('change', () => {
    if (!toggle.checked) { stop(); return; }
    entries = []; started = performance.now(); lastMove = 0; enabled = true;
    clearTimeout(timer);
    timer = setTimeout(stop, 10 * 60 * 1000);
    record('session-start');
  });
  clearButton.addEventListener('click', () => { stop(); entries = []; update(); });
  exportButton.addEventListener('click', () => {
    try {
      const report = { type: 'funtime-touch-debug', formatVersion: 1, gestureRevision: 'touch-events-1',
        appVersion: document.querySelector('.app-footer-meta').textContent.match(/v([\d.]+)/)?.[1],
        environment: { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight,
          pixelRatio: devicePixelRatio, maxTouchPoints: navigator.maxTouchPoints },
        events: entries.map(entry => ({ ...entry })) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `FunTime-Diagnostico-Toque-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { status.textContent = 'Não foi possível exportar. O registro foi mantido; tente novamente.'; }
  });
  globalThis.FunTimeTouchDebug = Object.freeze({ record });
  update();
})();
