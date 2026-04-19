/* ================================================
   Workin · Squat Coach — Service Worker
   Caches the app shell for offline / fast reload
   ================================================ */

const CACHE_NAME = "workin-v1";

// Files to cache on install (app shell)
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-180.png",
  "/data/analysis.json",
];

// ── Install: pre-cache app shell ─────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        // Non-fatal: some assets might not exist yet
        console.warn("[SW] Pre-cache partial failure:", err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ───────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first, fall back to cache ─────
self.addEventListener("fetch", (event) => {
  // Only handle GET requests for same origin
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a clone of the fresh response
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request).then(
          (cached) => cached || new Response("Offline", { status: 503 })
        );
      })
  );
});
