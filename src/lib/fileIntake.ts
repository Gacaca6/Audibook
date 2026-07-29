// Books arriving from outside the app.
//
// Two OS-level entry points, both ending in the same import pipeline:
//   1. file_handlers  — "Open with Audibook" on an .epub/.pdf/.txt
//   2. share_target   — sharing a book file into Audibook (the service worker
//                       stashes it in a cache and redirects to ./?share=1)

const SHARE_CACHE = "audibook-share";
const SHARE_KEY = "/__shared-book";

/** Pull a shared file out of the service worker's cache (and clear it). */
async function takeSharedFile(): Promise<File | null> {
  try {
    if (!("caches" in window)) return null;
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_KEY);
    if (!response) return null;

    const blob = await response.blob();
    const rawName = response.headers.get("x-audibook-filename");
    const name = rawName ? decodeURIComponent(rawName) : "shared-book.txt";
    await cache.delete(SHARE_KEY);

    if (blob.size === 0) return null;
    return new File([blob], name, { type: blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

/** Strip one-shot params so a refresh doesn't re-trigger the import. */
function clearParam(param: string): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    window.history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
  } catch {
    // history API unavailable — harmless
  }
}

/**
 * Register the handler that receives books opened or shared from the OS.
 * Safe to call once on mount; returns a cleanup function.
 */
export function listenForIncomingFiles(onFile: (file: File) => void): () => void {
  let cancelled = false;

  // 1. Shared via the Android share sheet
  const params = new URLSearchParams(window.location.search);
  if (params.get("share") === "1") {
    clearParam("share");
    takeSharedFile().then((file) => {
      if (file && !cancelled) onFile(file);
    });
  }

  // 2. Opened from the OS file browser ("Open with")
  const launchQueue = (window as any).launchQueue;
  if (launchQueue && typeof launchQueue.setConsumer === "function") {
    launchQueue.setConsumer(async (launchParams: any) => {
      if (!launchParams?.files?.length || cancelled) return;
      for (const handle of launchParams.files) {
        try {
          const file = await handle.getFile();
          if (file && !cancelled) onFile(file);
        } catch {
          // permission denied or handle expired — skip this file
        }
      }
    });
  }

  return () => {
    cancelled = true;
  };
}

/** Which tab a launcher shortcut asked for, if any. */
export function readShortcutTab(): "discover" | "books" | "continue" | null {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "discover" || tab === "books" || tab === "continue") {
    clearParam("tab");
    return tab;
  }
  return null;
}
