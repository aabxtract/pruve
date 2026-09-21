/**
 * Pruve wallet service worker.
 *
 * Network-first for everything it handles, so a demo never gets served stale
 * code after a redeploy or a tunnel URL change. The cache exists only as an
 * offline fallback for the app shell.
 *
 * Deliberately does NOT touch:
 *   - non-GET requests (credential issuance, proof presentation)
 *   - cross-origin requests (the issuer and verifier APIs)
 * Caching either of those would put credential traffic in a disk cache and
 * could replay a stale verification result.
 */
const CACHE = "pruve-shell-v5";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"]).catch(() => {
        // A failed precache must not block activation.
      })
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        // Only cache complete, same-origin successes.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      })
  );
});
