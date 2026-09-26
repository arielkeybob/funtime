// Visualizador de tutoriais (spec 0026): uma folha de slides usada pela introdução do primeiro
// acesso e pelos tópicos de Configurações → Como usar. Não toca localStorage nem `state`:
// quem chama (app.js) decide quando abrir e guarda a flag de "já vi".

export function clampIndex(index, total) {
  if (!Number.isInteger(total) || total < 1) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

// A introdução é só para quem chega sem nada: quem já tem dados (uso anterior ou backup
// restaurado) descobre os tutoriais em Configurações.
export function shouldShowIntro({ seen, hasData }) {
  return !seen && !hasData;
}

const SWIPE_MIN_PX = 48;
const MESSAGES = {
  mediaError: "Não foi possível carregar esta mídia. Conecte-se e abra de novo.",
  play: "Reproduzir animação",
};

const defaultReducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const defaultSaveData = () => globalThis.navigator?.connection?.saveData === true;
const defaultOnline = () => globalThis.navigator?.onLine !== false;

export function createTutorialViewer({
  dialog,
  tutorials,
  onClose = () => {},
  prefersReducedMotion = defaultReducedMotion,
  saveData = defaultSaveData,
  isOnline = defaultOnline,
  fetchMedia = (url) => globalThis.fetch(url),
}) {
  const $ = (selector) => dialog.querySelector(selector);
  const stage = $("#tutorial-stage");
  const caption = $("#tutorial-caption");
  const counter = $("#tutorial-counter");
  const dots = $("#tutorial-dots");
  const title = $("#tutorial-title");
  const eyebrow = $("#tutorial-eyebrow");
  const prev = $("#tutorial-prev");
  const next = $("#tutorial-next");
  const skip = $("#tutorial-skip");
  const closeButton = $("#tutorial-close");

  let tutorial = null;
  let index = 0;
  let intro = false;
  let reachedEnd = false;
  let video = null;
  let videoWanted = false;
  const prefetched = new Set();

  const total = () => tutorial?.passos.length ?? 0;

  function releaseVideo() {
    if (!video) return;
    video.pause();
    // Solta o arquivo: sem isto o navegador segue baixando o vídeo do slide que já saiu.
    video.removeAttribute("src");
    video.load();
    video = null;
    videoWanted = false;
  }

  function showMediaError(message) {
    stage.replaceChildren();
    const note = document.createElement("p");
    note.className = "tutorial-media-error";
    note.setAttribute("role", "status");
    note.textContent = message;
    stage.append(note);
  }

  function buildVideo(step) {
    const element = document.createElement("video");
    element.className = "tutorial-media";
    element.muted = true;
    element.setAttribute("muted", "");
    element.loop = true;
    element.playsInline = true;
    element.preload = "metadata";
    if (step.poster) element.poster = step.poster;
    element.setAttribute("aria-label", step.alt);
    element.src = step.src;
    element.addEventListener("error", () => { if (element.isConnected) showMediaError(MESSAGES.mediaError); });
    video = element;
    const still = prefersReducedMotion() || saveData();
    if (still) {
      const play = document.createElement("button");
      play.type = "button";
      play.className = "secondary-button tutorial-play";
      play.textContent = MESSAGES.play;
      play.addEventListener("click", () => {
        videoWanted = true;
        play.remove();
        element.play().catch(() => {});
      });
      return [element, play];
    }
    videoWanted = true;
    return [element];
  }

  function buildImage(step) {
    const element = document.createElement("img");
    element.className = "tutorial-media";
    element.alt = step.alt;
    element.decoding = "async";
    element.draggable = false;
    element.addEventListener("error", () => { if (element.isConnected) showMediaError(MESSAGES.mediaError); });
    element.src = step.src;
    return [element];
  }

  // Ao abrir um tópico, baixa em segundo plano toda a mídia dele (poucas centenas de KB): assim ele
  // segue inteiro mesmo que a conexão caia no meio. O Service Worker guarda o que chega. Não roda
  // sem conexão nem com economia de dados; se um download falha, a próxima abertura tenta de novo.
  function prefetchTutorial(item) {
    if (prefetched.has(item.id) || saveData() || !isOnline()) return;
    prefetched.add(item.id);
    for (const step of item.passos) {
      for (const url of [step.src, step.poster]) {
        if (!url) continue;
        Promise.resolve().then(() => fetchMedia(url)).then((response) => response.arrayBuffer())
          .catch(() => { prefetched.delete(item.id); });
      }
    }
  }

  function render() {
    const count = total();
    const step = tutorial.passos[index];
    releaseVideo();
    stage.replaceChildren(...(step.tipo === "video" ? buildVideo(step) : buildImage(step)));
    // Só depois de estar na página: tocar um <video> solto não é confiável em todos os navegadores.
    if (video && videoWanted) video.play().catch(() => { /* Sem autoplay permitido: fica o pôster. */ });
    title.textContent = tutorial.titulo;
    eyebrow.textContent = intro ? "Primeiros passos" : "Como usar";
    caption.textContent = step.legenda;
    counter.textContent = `${index + 1} de ${count}`;
    dots.replaceChildren(...tutorial.passos.map((_, i) => {
      const dot = document.createElement("span");
      if (i === index) dot.dataset.active = "true";
      return dot;
    }));
    const last = index === count - 1;
    if (last) reachedEnd = true;
    prev.disabled = index === 0;
    next.textContent = last ? "Concluir" : "Próximo";
    // Na introdução o "Pular" some no último slide (o próprio "Concluir" encerra); nos tópicos
    // o × fica sempre disponível.
    skip.hidden = !intro || last;
    closeButton.hidden = intro;
  }

  function go(target) {
    if (!tutorial || !dialog.open) return;
    const clamped = clampIndex(target, total());
    if (clamped === index) return;
    index = clamped;
    render();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => (index >= total() - 1 ? close() : go(index + 1)));
  skip.addEventListener("click", close);
  closeButton.addEventListener("click", close);

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "ArrowLeft") go(index - 1);
  });

  // Deslizar na horizontal troca de slide; a rolagem vertical continua livre (touch-action: pan-y).
  let swipe = null;
  stage.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    swipe = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener("pointercancel", () => { swipe = null; });
  stage.addEventListener("pointerup", (event) => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? index + 1 : index - 1);
  });

  document.addEventListener("visibilitychange", () => {
    if (!video || !dialog.open) return;
    if (document.hidden) video.pause();
    else if (videoWanted) video.play().catch(() => {});
  });

  dialog.addEventListener("close", () => {
    const finished = { id: tutorial?.id ?? null, intro, reachedEnd };
    releaseVideo();
    stage.replaceChildren();
    tutorial = null;
    onClose(finished);
  });

  return {
    open(id, { intro: asIntro = false } = {}) {
      const found = tutorials.find((item) => item.id === id);
      if (!found || !found.passos.length) return false;
      tutorial = found;
      intro = asIntro;
      index = 0;
      reachedEnd = false;
      render();
      if (!dialog.open) dialog.showModal();
      next.focus({ preventScroll: true });
      prefetchTutorial(found);
      return true;
    },
    close,
    isOpen: () => dialog.open,
  };
}
