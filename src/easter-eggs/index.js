// Easter eggs locais: nenhum dado persistido ou gesto nativo é alterado.
export function initEasterEggs({ state, homeHeader, homeView, toast, updateToast, refreshDataViews }) {
  const BACKGROUND_VIDEO_SOURCE = 'local';
  const BACKGROUND_VIDEO_CACHE_NAME = 'funtime-bg-v1';
  const localBackgroundVideos = [
    './bg/Bg1.mp4', './bg/Bg2.mp4', './bg/Bg3.mp4', './bg/Bg4.mp4',
    './bg/Bg5.mp4', './bg/Bg6.mp4', './bg/Bg8-1.mp4'
  ];
  const youtubeBackgroundVideoIds = [
    'Q6SzupOIkrs', 'Kjc3Q3Z1a-M', 'RtDRL2DMujw',
    '0Tq9yS-OBSE', 'O2kjyld_fX8', 'DdkAqgDWzvk'
  ];
  let taps = [];
  let contact = null;
  let balloon = null;
  let cleanupTimer;
  let holdTimer;
  let videoLayer = null;
  let videoTimer;
  let videoLoadTimer;
  let videoRevealTimer;
  let activeObjectUrl = null;
  let lastBackgroundChoice = null;
  let upsideLayer = null;
  let upsideTimer;
  let upsideMarquee = null;
  const upsidePhrases = [
    'Se tudo parece normal, você já estava do outro lado.',
    'Demogorgon pediu sua localização. Ignore.',
    'Até o relógio resolveu andar ao contrário?',
    'Seu eu do mundo invertido mandou você beber água.',
    'Aqui, o depois vem antes. Deixe para ontem.',
    'Não adianta tentar ficar de cabeça pra baixo.',
    'Cuidado com o Demogorgon.',
    'Você está sóbrio ou tudo ficou invertido?',
    'Tente falar seu nome ao contrário.',
    'Bem-vindo ao mundo invertido, baby.',
    'E se tocar essa música ao contrário?'
  ];
  const upsideRapidPhrases = [
    'Parece que você gostou de ficar fazendo isso.',
    'Porra, viciou em visitar o mundo invertido?',
    'Sério, para com esses vícios estranhos.',
    'Porque você não vai dançar e me deixa em paz?',
    '!'
  ];
  const UPSIDE_CYCLE_OPENING_PHRASE = 'Você está sóbrio ou tudo ficou invertido?';
  const UPSIDE_RAPID_GAP_MS = 45000;
  let upsidePhraseBag = [];
  let lastUpsideStartedAt = null;
  let rapidUpsideCount = 0;
  const shuffledUpsidePhrases = () => {
    const hasOpeningPhrase = upsidePhrases.includes(UPSIDE_CYCLE_OPENING_PHRASE);
    const phrases = upsidePhrases.filter(phrase => phrase !== UPSIDE_CYCLE_OPENING_PHRASE);
    for (let index = phrases.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [phrases[index], phrases[swapIndex]] = [phrases[swapIndex], phrases[index]];
    }
    // A fila é consumida com pop(), então a abertura fica no fim do array.
    if (hasOpeningPhrase) phrases.push(UPSIDE_CYCLE_OPENING_PHRASE);
    return phrases;
  };
  const nextStandardUpsidePhrase = () => {
    if (!upsidePhraseBag.length) upsidePhraseBag = shuffledUpsidePhrases();
    return upsidePhraseBag.pop();
  };
  const nextUpsidePhrase = now => {
    rapidUpsideCount = lastUpsideStartedAt !== null && now - lastUpsideStartedAt <= UPSIDE_RAPID_GAP_MS
      ? rapidUpsideCount + 1
      : 1;
    lastUpsideStartedAt = now;
    const rapidPhrase = upsideRapidPhrases[rapidUpsideCount - 10];
    return rapidPhrase ?? nextStandardUpsidePhrase();
  };
  const headerBrand = homeHeader.querySelector('.home-header-eyebrow');
  const headerTitle = homeHeader.querySelector('h1');
  const bottomNav = document.querySelector('.bottom-nav');
  const reverseBottomNavigation = () => bottomNav.append(...[...bottomNav.children].reverse());
  const endUpsideDown = () => {
    const wasActive = state.upsideDownActive;
    state.upsideDownActive = false;
    clearTimeout(upsideTimer);
    upsideMarquee?.remove();
    upsideMarquee = null;
    upsideLayer?.remove();
    upsideLayer = null;
    document.body.classList.remove('upside-down-active');
    headerBrand.textContent = 'FunTime';
    headerTitle.textContent = 'Início';
    if (wasActive) {
      reverseBottomNavigation();
      refreshDataViews();
    }
  };
  const startUpsideDown = () => {
    if (!available()) return;
    reset();
    clearBalloon();
    upsideLayer = document.createElement('div');
    upsideLayer.className = 'upside-down-world';
    upsideLayer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 24; i++) {
      const spore = document.createElement('i');
      spore.style.setProperty('--x', `${(i * 43) % 100}%`);
      spore.style.setProperty('--y', `${(i * 29) % 100}%`);
      spore.style.setProperty('--delay', `${-i * .73}s`);
      upsideLayer.append(spore);
    }
    document.body.append(upsideLayer);
    headerBrand.textContent = 'TimeFun';
    headerTitle.textContent = 'Final';
    upsideMarquee = document.createElement('div');
    upsideMarquee.className = 'upside-marquee';
    const phrase = document.createElement('span');
    phrase.textContent = nextUpsidePhrase(Date.now());
    upsideMarquee.append(phrase);
    homeHeader.append(upsideMarquee);
    state.upsideDownActive = true;
    document.body.classList.add('upside-down-active');
    reverseBottomNavigation();
    refreshDataViews();
    upsideTimer = setTimeout(endUpsideDown, 20000);
  };
  // Inclui margens vazias do topo, sem capturar cards ou controles.
  const headerTarget = event => {
    if (!(event.target instanceof Element) || event.target.closest('button, a, input, select, textarea, dialog')) return false;
    if (homeHeader.contains(event.target)) return true;
    if (!event.target.matches('body, #app-shell, #home-view')) return false;
    const header = homeHeader.getBoundingClientRect();
    const view = homeView.getBoundingClientRect();
    return event.clientY >= 0 && event.clientY < view.top &&
      event.clientX >= header.left && event.clientX <= header.right;
  };
  const available = () => !document.hidden && !homeView.hidden &&
    !document.body.matches('.app-locked, .security-booting, .boot-pending, .terms-pending, .browser-mode, .youtube-easter-egg-active, .upside-down-active') &&
    !document.querySelector('dialog[open]') && toast.hidden && updateToast.hidden;
  const emptyTarget = target => target instanceof Element &&
    target.matches('body, #app-shell, #home-view, #drink-list, #home-add-zone, #empty-state, #home-header, .notice');
  const reset = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    taps = [];
    contact = null;
  };
  const clearBalloon = () => {
    clearTimeout(cleanupTimer);
    balloon?.remove();
    balloon = null;
  };
  const cancel = () => { reset(); clearBalloon(); };
  const cacheLocalBackgroundVideo = async sourceUrl => {
    if (!globalThis.caches) return;
    try {
      const cache = await caches.open(BACKGROUND_VIDEO_CACHE_NAME);
      if (await cache.match(sourceUrl)) return;
      const response = await fetch(sourceUrl, { cache: 'force-cache' });
      if (!response.ok || response.status !== 200 || await cache.match(sourceUrl)) return;
      await cache.put(sourceUrl, response);
    } catch (error) {
      console.warn('Não foi possível guardar o vídeo de fundo para uso offline.', error);
    }
  };
  const endBackgroundVideo = () => {
    clearTimeout(videoTimer);
    clearTimeout(videoLoadTimer);
    clearTimeout(videoRevealTimer);
    if (!videoLayer) return;
    const layer = videoLayer;
    const objectUrl = activeObjectUrl;
    const cacheUrl = layer.dataset.cacheUrl;
    videoLayer = null;
    activeObjectUrl = null;
    layer.classList.add('is-ending');
    layer.classList.remove('is-visible');
    if (cacheUrl) cacheLocalBackgroundVideo(cacheUrl);
    setTimeout(() => {
      layer.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      document.body.classList.remove('youtube-easter-egg-active');
    }, 2000);
  };
  const revealBackgroundMedia = (layer, delay = 0) => {
    clearTimeout(videoLoadTimer);
    videoRevealTimer = setTimeout(() => {
      if (videoLayer !== layer) return;
      layer.classList.add('is-visible');
      videoTimer = setTimeout(endBackgroundVideo, 20000);
    }, delay);
  };
  const loadLocalBackgroundVideo = async (layer, source) => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.controls = false;
    video.disablePictureInPicture = true;
    layer.append(video);
    try {
      const sourceUrl = new URL(source, location.href).href;
      const cache = globalThis.caches ? await caches.open(BACKGROUND_VIDEO_CACHE_NAME) : null;
      const cachedResponse = cache ? await cache.match(sourceUrl) : null;
      video.addEventListener('canplay', () => {
        if (videoLayer !== layer) return;
        video.play().catch(() => {});
        revealBackgroundMedia(layer);
        // Evita disputar a conexão com o streaming; a cópia integral começa ao fim do efeito.
        if (!cachedResponse && cache) layer.dataset.cacheUrl = sourceUrl;
      }, { once: true });
      video.addEventListener('error', endBackgroundVideo, { once: true });
      if (cachedResponse) {
        activeObjectUrl = URL.createObjectURL(await cachedResponse.blob());
        if (videoLayer !== layer) {
          URL.revokeObjectURL(activeObjectUrl);
          activeObjectUrl = null;
          return;
        }
        video.src = activeObjectUrl;
      } else {
        video.src = sourceUrl;
      }
    } catch (error) {
      console.warn('Não foi possível carregar o vídeo de fundo local.', error);
      endBackgroundVideo();
    }
  };
  const loadYouTubeBackgroundVideo = (layer, videoId) => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Efeito visual temporário reproduzido pelo YouTube';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&playsinline=1&rel=0`;
    layer.append(iframe);
    iframe.addEventListener('load', () => revealBackgroundMedia(layer, 1200), { once: true });
  };
  const startBackgroundVideo = () => {
    if (videoLayer || !available()) return;
    const sources = BACKGROUND_VIDEO_SOURCE === 'local' ? localBackgroundVideos : youtubeBackgroundVideoIds;
    const choices = sources.filter(source => source !== lastBackgroundChoice);
    const source = choices[Math.floor(Math.random() * choices.length)];
    lastBackgroundChoice = source;
    reset();
    clearBalloon();
    const layer = document.createElement('div');
    layer.className = `youtube-easter-egg ${BACKGROUND_VIDEO_SOURCE === 'local' ? 'local-background' : 'youtube-background'}`;
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.source = source;
    videoLayer = layer;
    document.body.append(layer);
    document.body.classList.add('youtube-easter-egg-active');
    try {
      navigator.vibrate?.(1200);
    } catch (error) {}
    if (BACKGROUND_VIDEO_SOURCE === 'local') loadLocalBackgroundVideo(layer, source);
    else loadYouTubeBackgroundVideo(layer, source);
    // Se o player nem carregar, o app volta sozinho em vez de permanecer preto.
    videoLoadTimer = setTimeout(endBackgroundVideo, BACKGROUND_VIDEO_SOURCE === 'local' ? 30000 : 10000);
  };

  document.addEventListener('pointerdown', event => {
    const header = headerTarget(event);
    if (contact || !event.isPrimary || event.button !== 0 || !available() || (!header && !emptyTarget(event.target))) {
      reset();
      return;
    }
    const notice = Boolean(event.target.closest('.notice'));
    contact = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, target: event.target, notice, header };
    if (notice || header) {
      const pointerId = event.pointerId;
      holdTimer = setTimeout(() => {
        if (contact?.id === pointerId) header ? startUpsideDown() : startBackgroundVideo();
      }, 1500);
    }
  }, { passive: true });
  document.addEventListener('pointermove', event => {
    if (contact?.id === event.pointerId && Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 12) reset();
  }, { passive: true });
  document.addEventListener('pointercancel', reset, { passive: true });
  document.addEventListener('pointerup', event => {
    const tap = contact;
    contact = null;
    clearTimeout(holdTimer);
    holdTimer = null;
    if (!tap || tap.header || tap.id !== event.pointerId || !available() || event.target !== tap.target ||
        event.timeStamp - tap.time > 350 || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) {
      reset();
      return;
    }
    // 30–300 BPM; pausas ou toques muito próximos iniciam outra sequência.
    const gap = tap.time - (taps.at(-1)?.time ?? 0);
    if (taps.length && (gap < 200 || gap > 2000)) taps = [];
    taps.push({ time: tap.time, notice: tap.notice });
    // Primeiro palpite com 4 toques; se a sequência continuar até 8 seguidos,
    // um segundo palpite mais refinado (média dos 8) reinicia a contagem.
    if (taps.length !== 4 && taps.length !== 8) return;
    const bpm = Math.round(60000 * (taps.length - 1) / (taps.at(-1).time - taps[0].time));
    if (taps.length === 8) taps = [];
    clearBalloon();
    balloon = document.createElement('div');
    balloon.className = 'tap-bpm-balloon';
    balloon.setAttribute('aria-hidden', 'true');
    balloon.textContent = `${bpm} BPM`;
    document.body.append(balloon);
    cleanupTimer = setTimeout(clearBalloon, 2200);
  }, { passive: true });
  document.addEventListener('scroll', cancel, { passive: true, capture: true });
  document.addEventListener('visibilitychange', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endUpsideDown(); });
  window.addEventListener('pagehide', endUpsideDown);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') endUpsideDown(); });
  document.addEventListener('contextmenu', event => {
    if (headerTarget(event) || (event.target instanceof Element && event.target.closest('.notice'))) event.preventDefault();
  });
  window.addEventListener('blur', cancel);
  // Mudanças de tela, bloqueio e avisos encerram também uma sequência parcial.
  const observer = new MutationObserver(() => {
    if (!available()) cancel();
    if (upsideLayer && document.body.matches('.app-locked, .security-booting, .boot-pending, .terms-pending')) endUpsideDown();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  [homeView, toast, updateToast, ...document.querySelectorAll('dialog')].forEach(element =>
    observer.observe(element, { attributes: true, attributeFilter: ['hidden', 'open'] }));
}
