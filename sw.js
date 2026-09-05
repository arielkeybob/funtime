const CACHE_NAME = "intervalo-v1-8-7";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192-v164.png",
  "./icons/icon-512-v164.png",
  "./icons/apple-touch-icon-v164.png",
  "./icons/favicon-32-v164.png"
];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    APP_SHELL.map(async (relativeUrl) => {
      const absoluteUrl = new URL(relativeUrl, self.registration.scope);
      const request = new Request(absoluteUrl, { cache: "reload" });
      const response = await fetch(request);

      if (!response.ok) {
        throw new Error(`Falha ao armazenar ${relativeUrl}: ${response.status}`);
      }

      await cache.put(relativeUrl, response);
    })
  );
}

self.addEventListener("install", (event) => {
  // Não usamos skipWaiting() aqui. Uma versão nova fica em estado WAITING
  // até o usuário tocar em "Atualizar" dentro do app.
  event.waitUntil(precacheAppShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("intervalo-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      // Para navegações dentro do escopo, o index em cache é o fallback offline.
      if (request.mode === "navigate") {
        const cachedIndex = await caches.match("./index.html");
        if (cachedIndex) return cachedIndex;
      }

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        throw error;
      }
    })
  );
});
