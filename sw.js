const APP_VERSION = "2.8.0";
const CACHE_NAME = "funtime-v2-8-0";
const BACKGROUND_CACHE_NAME = "funtime-bg-v1";
const SHARE_IMPORT_CACHE_NAME = "funtime-share-target-v1";
const SHARE_IMPORT_REQUEST_PATH = "./__shared-drinks-import__";
const SHARE_TARGET_MAX_BYTES = 1500000;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./src/format/datetime.js",
  "./src/format/counting-mode.js",
  "./src/security/webauthn-signature.js",
  "./src/security/pin-crypto.js",
  "./src/security/config.js",
  "./src/security/lock.js",
  "./src/data/store.js",
  "./src/data/sync-merge.js",
  "./src/data/firestore-db.js",
  "./src/data/share-codes.js",
  "./src/data/share-payload.js",
  "./src/data/share-writer.js",
  "./src/data/shared-view.js",
  "./src/sharing/share-ui.js",
  "./src/sharing/qr.js",
  "./src/vendor/qrcode-generator.js",
  "./src/vendor/jsqr.js",
  "./src/occasions/summary.js",
  "./src/data/firestore-sync.js",
  "./src/data/firestore-config.js",
  "./src/auth/firebase-auth.js",
  "./src/ui/dialogs.js",
  "./src/ui/wheel-picker.js",
  "./src/ui/field-errors.js",
  "./src/ui/drink-reorder.js",
  "./src/ui/icon-reorder.js",
  "./src/ui/icon-catalog.js",
  "./src/easter-eggs/index.js",
  "./src/drinks/validate.js",
  "./src/history/event-dialog.js",
  "./src/drinks/interactions.js",
  "./app.js",
  "./occasions.js",
  "./occasions-ui.js",
  "./touch-debug.js",
  "./boot.js",
  "./emoji-data.js",
  "./ui.js",
  "./reset.js",
  "./navigation.js",
  "./policies.js",
  "./policies.html",
  "./manifest.webmanifest",
  "./icons/icon-192-v2.png",
  "./icons/icon-512-v2.png",
  "./icons/icon-maskable-512-v2.png?rev=2",
  "./icons/apple-touch-icon-v2.png",
  "./icons/favicon-32-v2.png"
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
  // Uma versão nova fica em WAITING até o usuário confirmar no app.
  event.waitUntil(precacheAppShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => /^funtime-v2-/.test(key) && key !== CACHE_NAME)
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
  if (event.data?.type === "FUNTIME_PREPARE") {
    event.waitUntil(prepareBootClients().then(
      () => event.ports[0]?.postMessage({ ready: true, protocol: 2 }),
      () => event.ports[0]?.postMessage({ ready: false })
    ));
  }
});

function isAppWindow(client) {
  const url = new URL(client.url), scope = new URL(self.registration.scope);
  return url.origin === scope.origin && (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`);
}

function hasCurrentBoot(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 1500);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.protocol === 2); };
    client.postMessage({ type: "FUNTIME_BOOT_CHECK" }, [channel.port2]);
  });
}

async function prepareBootClients() {
  // Nenhuma janela pode ficar rodando o script antigo antes de liberar uma atualização.
  const clients = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(isAppWindow);
  await Promise.all(clients.map(async client => {
    if (await hasCurrentBoot(client)) return;
    const updated = await client.navigate(client.url);
    if (!updated && await self.clients.get(client.id)) throw new Error("Não foi possível atualizar a janela.");
    if (updated && !(await hasCurrentBoot(updated))) throw new Error("Janela ainda não atualizada.");
  }));
}

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
          "X-FunTime-Filename": encodeURIComponent(file.name || "FunTime-Bebidas.json"),
          "X-FunTime-Shared-At": String(Date.now())
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
    url.pathname === new URL("./share-target", self.registration.scope).pathname
  ) {
    event.respondWith(handleShareTargetRequest(request));
    return;
  }

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  // Nunca responder por recursos fora do próprio escopo (ex.: outro app na mesma origem).
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  const backgroundPath = new URL("./bg/", self.registration.scope).pathname;
  if (url.pathname.startsWith(backgroundPath)) {
    event.respondWith(
      caches.open(BACKGROUND_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(url.href);
        if (cached) return cached;
        // Requisições parciais do elemento video não devem contaminar o cache.
        if (request.headers.has("range")) return fetch(request);
        const response = await fetch(request);
        if (response.ok && response.status === 200) await cache.put(url.href, response.clone());
        return response;
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      // Para navegações dentro do escopo, o index em cache é o fallback offline.
      if (request.mode === "navigate") {
        const cachedIndex = await cache.match("./index.html");
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
          const fallback = await cache.match("./index.html");
          if (fallback) return fallback;
        }
        throw error;
      }
    })
  );
});
