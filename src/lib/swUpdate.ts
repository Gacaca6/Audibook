// Service worker registration + update flow.
//
// The worker no longer calls skipWaiting() on install, so a new version parks
// in "waiting" until the user accepts. That means an audiobook playing right
// now is never swapped out mid-chapter — the user chooses the moment.

let waitingWorker: ServiceWorker | null = null;
let onUpdate: (() => void) | null = null;
let reloading = false;
// Only reload when the user actually accepted an update. On a first visit the
// freshly installed worker calls clients.claim(), which fires controllerchange
// too — reloading there would double-load the app and, worse, discard one-shot
// launch parameters (?share=1, ?find=, ?tab=) before the app can act on them.
let updateAccepted = false;

export function onUpdateReady(callback: () => void): void {
  onUpdate = callback;
  if (waitingWorker) callback();
}

/** Activate the waiting worker and reload once it takes control. */
export function applyUpdate(): void {
  updateAccepted = true;
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

function trackWaiting(registration: ServiceWorkerRegistration): void {
  const notify = (worker: ServiceWorker | null) => {
    // Only prompt when an existing version is already controlling the page;
    // the very first install is not an "update".
    if (!worker || !navigator.serviceWorker.controller) return;
    waitingWorker = worker;
    onUpdate?.();
  };

  if (registration.waiting) notify(registration.waiting);

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") notify(registration.waiting || installing);
    });
  });
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  // Register immediately rather than waiting for the `load` event. Deferring
  // to `load` means crawlers and store-readiness scanners that snapshot the
  // page early see no registration at all and report the app as having no
  // service worker. Registration is cheap and does not block rendering.
  const swUrl = new URL("sw.js", window.location.href).pathname;
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      trackWaiting(registration);
      // Catch updates published while the app is open
      setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    })
    .catch((err) => {
      console.error("ServiceWorker registration failed:", err);
    });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateAccepted || reloading) return;
    reloading = true;
    window.location.reload();
  });
}
