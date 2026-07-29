const CACHE_NAME = 'audibook-cache-v8';
const SHARE_CACHE = 'audibook-share';
const SHARE_KEY = '/__shared-book';

// Precache the stable app shell; hashed JS/CSS bundles are picked up at
// runtime by the stale-while-revalidate handler below.
const ASSETS_TO_CACHE = [
  './',
  './manifest.json',
  './privacy.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache each asset individually so one failure doesn't abort the install
      return Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url)));
    })
    // NOTE: no skipWaiting() here on purpose. The new worker waits until the
    // user accepts the in-app "Update ready" prompt, so a running audiobook is
    // never swapped out mid-listen.
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== SHARE_CACHE) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// The page asks us to activate once the user accepts the update prompt.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Web Share Target: Android hands us a POSTed book file. Stash it in a cache
// the page can read, then redirect into the app to run the normal import.
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('book');
    if (file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        SHARE_KEY,
        new Response(file, {
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-audibook-filename': encodeURIComponent(file.name || 'shared-book')
          }
        })
      );
      return Response.redirect('./?share=1', 303);
    }
  } catch (err) {
    // fall through to a plain launch
  }
  return Response.redirect('./', 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Share target must be handled before the GET-only guard below
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Navigations (including shortcut URLs like ./?tab=discover) must resolve to
  // the app shell offline, so ignore the query string when matching.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(event.request, { ignoreSearch: true })) ||
            (await cache.match('./')) ||
            new Response('Offline', { status: 503 })
          );
        })
    );
    return;
  }

  // Same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || new Response('Offline: resource not cached yet', { status: 503 }));

      return cachedResponse || networkFetch;
    })
  );
});
