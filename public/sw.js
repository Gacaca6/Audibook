const CACHE_NAME = 'audibook-cache-v10';
const SHARE_CACHE = 'audibook-share';
const SHARE_KEY = '/__shared-book';

// Keep the install step SMALL. Everything listed here must download before the
// worker can activate, and a worker stuck in `installing` counts as "no service
// worker" to store-readiness scanners (and delays offline readiness for real
// users). Only the documents needed to boot offline are precached; icons and the
// hashed JS/CSS bundles are picked up by the runtime handler below on first
// render, which happens moments later anyway.
const ASSETS_TO_CACHE = [
  './',
  './manifest.json',
  './icons/icon-192.png'
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

// ---------------------------------------------------------------------------
// IndexedDB access (the SW can't import the app's TypeScript db module, so it
// speaks to the same database directly). Schema must match src/lib/db.ts.
// ---------------------------------------------------------------------------
const DB_NAME = 'aubibook-db';
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}

/**
 * Background Sync: finish chapter downloads that failed while offline.
 * The page queues them in the "pending" store; we drain it here, which the
 * browser will retry on our behalf until it succeeds.
 */
async function drainPendingDownloads() {
  const db = await openDb();
  const queued = await idbRequest(db.transaction('pending', 'readonly').objectStore('pending').getAll());
  if (!queued.length) return;

  for (const item of queued) {
    try {
      const response = await fetch(item.url);
      if (!response.ok) continue; // leave queued; a later sync retries
      const blob = await response.blob();
      if (!blob.size) continue;

      const writeDb = await openDb();
      const tx = writeDb.transaction(['audio', 'pending'], 'readwrite');
      tx.objectStore('audio').put(blob, item.key);
      tx.objectStore('pending').delete(item.key);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

      await notifyClients({
        type: 'download-finished',
        bookId: item.bookId,
        chapterId: item.chapterId,
        title: item.title
      });

      // Only surface a notification if the user already granted permission
      if (Notification.permission === 'granted') {
        await self.registration.showNotification('Chapter ready offline', {
          body: `"${item.title}" finished downloading.`,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: `audibook-dl-${item.key}`,
          data: { url: './?tab=books' }
        });
      }
    } catch (err) {
      // Still offline or the fetch failed — keep it queued for the next sync
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'audibook-downloads') {
    event.waitUntil(drainPendingDownloads());
  }
});

/**
 * Periodic Background Sync: keep the cached shell fresh so an offline launch
 * shows the current build, and opportunistically finish queued downloads.
 */
async function refreshShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(
    ['./', './manifest.json'].map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (response && response.ok) await cache.put(url, response);
    })
  );
  await drainPendingDownloads();
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'audibook-refresh') {
    event.waitUntil(refreshShell());
  }
});

/**
 * Push notifications. Audibook has no server of its own, so nothing is being
 * broadcast today — this handler is what makes the app able to receive a push
 * the moment a sender exists, and it is already used locally by the download
 * queue above.
 */
self.addEventListener('push', (event) => {
  const payload = {
    title: 'Audibook',
    body: 'Your next chapter is ready to listen.',
    url: './'
  };
  if (event.data) {
    try {
      Object.assign(payload, event.data.json());
    } catch (err) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: payload.tag || 'audibook-push',
      data: { url: payload.url || './' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          if (client.navigate) await client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
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
