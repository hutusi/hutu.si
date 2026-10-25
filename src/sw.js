// The service worker: keeps a copy of the card (the page and its fingerprinted assets) so return
// visits show it at once, even offline or on a slow network. A deploy that changes the card
// changes this file (VERSION and PRECACHE are written by the build), browsers notice on the next
// visit, install the new copy in the background, and the visit after that shows it.
// Registered by boot.js only once the page has loaded and gone idle. See docs/decisions.md §18.

// The kill switch. Set to false and deploy: on their next visit every browser fetches this file
// afresh (no cache stands in its way), deletes the cached card, unregisters this worker and
// reloads the page from the network. boot.js then stops registering it. docs/operations.md.
const ENABLED = true;

const VERSION = '{{version}}';
const PRECACHE = ['{{precache}}']; // "/" and every file under /assets/
const CACHE = `hutusi-${VERSION}`;
const ours = (key) => key.startsWith('hutusi-');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (ENABLED) {
        // All or nothing: one failed fetch fails the install, so a half copy is never used. The
        // page is revalidated; the assets never change, so the HTTP cache may supply them.
        // Always into a new cache, even when this version had one (a rollback): caches are listed
        // in the order they were created, which activate relies on to find the previous version.
        // (The build makes the version change whenever sw.js does, so this is never the live one.)
        await caches.delete(CACHE);
        const cache = await caches.open(CACHE);
        await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: url === '/' ? 'no-cache' : 'default' })));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter(ours);
      if (!ENABLED) {
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.clients.claim();
        await self.registration.unregister();
        for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url).catch(() => {});
        return;
      }
      // Keep this version and the newest complete one before it: a page still open on the old
      // version can then still load its lazy assets (the QR code) after a deploy. A failed
      // install leaves an empty cache (addAll stores all or nothing), never the one to keep.
      let kept = false;
      for (const key of keys.filter((key) => key !== CACHE).reverse()) {
        if (!kept && (await (await caches.open(key)).keys()).length) kept = true;
        else await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// Only the card is served from the cache: navigations to "/" (whatever the query, e.g. ?seed=)
// and its assets: this version's, or the previous version's for a page still open on it (they
// are fingerprinted, so a cached copy is always right). Everything else, including the
// short-link paths /a /w /t, /cdn-cgi/ (analytics), other origins and anything but GET, is left
// to the network untouched.
self.addEventListener('fetch', (event) => {
  if (!ENABLED) return;
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const page = url.pathname === '/';
  if (!page && !url.pathname.startsWith('/assets/')) return;
  event.respondWith(
    (async () => {
      const key = page ? '/' : request;
      const own = await (await caches.open(CACHE)).match(key);
      return own ?? (await caches.match(key)) ?? fetch(request); // the previous version's copy, then the network
    })(),
  );
});
