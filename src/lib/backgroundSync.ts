import { Chapter } from "../types";
import { queuePendingDownload } from "./db";

// Page-side half of the service worker's Background Sync handlers.
//
// When a chapter download fails because the network dropped, we record it and
// hand the retry to the browser: it will wake the service worker and finish the
// download once connectivity returns, even if Audibook is closed.

const DOWNLOAD_TAG = "audibook-downloads";
const REFRESH_TAG = "audibook-refresh";

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register(tag: string): Promise<void> };
  periodicSync?: {
    register(tag: string, options?: { minInterval: number }): Promise<void>;
    getTags?(): Promise<string[]>;
  };
};

export function isBackgroundSyncSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window;
}

/**
 * Queue a chapter for retry and ask the browser to sync when back online.
 * Returns true when the retry was accepted, so the UI can say so honestly.
 */
export async function queueDownloadForRetry(bookId: string, chapter: Chapter): Promise<boolean> {
  if (!chapter.audioUrl) return false;
  try {
    await queuePendingDownload({
      bookId,
      chapterId: chapter.id,
      url: chapter.audioUrl,
      title: chapter.title,
    });
  } catch {
    return false; // storage unavailable — nothing we can promise
  }

  if (!isBackgroundSyncSupported()) return false;
  try {
    const registration = (await navigator.serviceWorker.ready) as SyncRegistration;
    if (!registration.sync) return false;
    await registration.sync.register(DOWNLOAD_TAG);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask for Periodic Background Sync so the cached shell stays current between
 * launches. Only granted to installed apps the user engages with, and silently
 * unavailable elsewhere — so treat failure as normal, never surface an error.
 */
export async function registerPeriodicRefresh(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = (await navigator.serviceWorker.ready) as SyncRegistration;
    if (!registration.periodicSync) return;

    const status = await navigator.permissions
      ?.query({ name: "periodic-background-sync" as PermissionName })
      .catch(() => null);
    if (status && status.state !== "granted") return;

    const tags = (await registration.periodicSync.getTags?.()) ?? [];
    if (tags.includes(REFRESH_TAG)) return;

    await registration.periodicSync.register(REFRESH_TAG, {
      minInterval: 24 * 60 * 60 * 1000, // at most once a day
    });
  } catch {
    // Not supported or not permitted — the app works exactly the same without it
  }
}

/** Notified by the service worker when a queued download finally lands. */
export function onQueuedDownloadFinished(
  handler: (bookId: string, chapterId: number, title: string) => void
): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  const listener = (event: MessageEvent) => {
    if (event.data?.type === "download-finished") {
      handler(event.data.bookId, event.data.chapterId, event.data.title);
    }
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
