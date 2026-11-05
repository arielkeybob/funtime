// Gesto secreto das opções de teste (docs/specs/0036): toques seguidos num ponto da tela, como
// tocar 7 vezes no número da versão do Android. Só conta; quem chama decide o que liberar.
// Um toque mais de `maxGapMs` depois do anterior recomeça a contagem.
export function createSecretTaps({ needed = 7, maxGapMs = 1500, progressFrom = 4, now = () => Date.now(), onProgress, onUnlock }) {
  let count = 0;
  let last = -Infinity;

  return {
    tap() {
      const time = now();
      count = time - last > maxGapMs ? 1 : count + 1;
      last = time;
      if (count >= needed) {
        count = 0;
        last = -Infinity;
        onUnlock?.();
        return;
      }
      if (count >= progressFrom) onProgress?.(needed - count);
    },
  };
}
