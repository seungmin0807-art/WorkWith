const CACHE_VERSION = "workwith-ios-pwa-v23";
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./tuning.js",
  "./manifest.json",
  "./data/session-data.js",
  "./data/session-data.json",
  "./data/user-overlay-analysis.js",
  "./data/user-overlay-analysis.json",
  "./icons/icon.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-home.png",
  "./icons/icon-splash.png",
  "./media/exercises/01-barbell-back-squat.png",
  "./media/exercises/02-conventional-deadlift.png",
  "./media/exercises/03-forward-lunge.png",
  "./media/exercises/04-overhead-press.png",
  "./media/exercises/05-bodybuilding-front-pose.png",
  "./media/voice/hip-hinge.mp3",
  "./media/voice/knee-drive.mp3",
  "./media/voice/balance.mp3",
  "./media/voice/heel-pressure.mp3",
  "./media/voice/posterior-chain.mp3",
  "./media/voice/default.mp3"
];

function shouldBypassCache(url) {
  return (
    url.pathname.endsWith(".mp4") ||
    url.pathname.endsWith(".bvh") ||
    url.pathname.includes("/media/frames/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("workwith-") && ![CORE_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (shouldBypassCache(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CORE_CACHE).then((cache) => cache.put("./index.html", clone));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
