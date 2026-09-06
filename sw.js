const APP_VERSION = "1.11.3";
const CACHE_NAME = "intervalo-v1-11-3";
const SHARE_IMPORT_CACHE_NAME = "intervalo-share-target-v1";
const SHARE_IMPORT_REQUEST_PATH = "./__shared-drinks-import__";
const SHARE_TARGET_MAX_BYTES = 1500000;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./policies.js",
  "./policies.html",
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
            .filter((key) => key.startsWith("intervalo-") && key !== CACHE_NAME && key !== SHARE_IMPORT_CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_VERSION") {
    event.ports[0]?.postMessage({ version: APP_VERSION });
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function handleShareTargetRequest(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("drinksFile");

    if (!(file instanceof File) || file.size <= 0 || file.size > SHARE_TARGET_MAX_BYTES) {
      return Response.redirect(new URL("./?import-shared=1&share-error=1", self.registration.scope).href, 303);
    }

    const text = await file.text();
    const cache = await caches.open(SHARE_IMPORT_CACHE_NAME);
    const payloadUrl = new URL(SHARE_IMPORT_REQUEST_PATH, self.registration.scope).href;

    await cache.put(
      payloadUrl,
      new Response(text, {
        headers: {
          "Content-Type": "application/json;charset=utf-8",
          "X-Intervalo-Filename": encodeURIComponent(file.name || "Intervalo-Bebidas.json")
        }
      })
    );

    return Response.redirect(new URL("./?import-shared=1", self.registration.scope).href, 303);
  } catch (error) {
    console.error("Falha ao receber arquivo pelo share target.", error);
    return Response.redirect(new URL("./?import-shared=1&share-error=1", self.registration.scope).href, 303);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method === "POST" &&
    url.origin === self.location.origin &&
    url.pathname.endsWith("/share-target")
  ) {
    event.respondWith(handleShareTargetRequest(request));
    return;
  }

  if (request.method !== "GET") return;
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
