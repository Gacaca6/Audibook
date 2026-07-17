// Storage-quota guard rails. Phones have hard per-site storage limits
// (Safari is the strictest), and hitting them mid-write is how apps break.
// Every big write should check headroom first and fail with a friendly
// message instead of a crash.

export interface StorageInfo {
  usedMB: number;
  quotaMB: number;
  freeMB: number;
  percentUsed: number;
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    const usedMB = Math.round(usage / 1048576);
    const quotaMB = Math.round(quota / 1048576);
    return {
      usedMB,
      quotaMB,
      freeMB: Math.max(0, quotaMB - usedMB),
      percentUsed: Math.min(100, Math.round((usage / quota) * 100)),
    };
  } catch {
    return null;
  }
}

/**
 * Is there room for a write of roughly `sizeMB`? Requires 1.5x the size plus
 * a 30MB floor of headroom — browsers misbehave near the quota edge, so we
 * never aim to fill it completely.
 */
export async function hasSpaceFor(sizeMB: number): Promise<boolean> {
  const info = await getStorageInfo();
  if (!info) return true; // no estimate API — let the write itself decide
  return info.freeMB >= sizeMB * 1.5 + 30;
}

/** True when an exception is the browser saying "storage is full". */
export function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export const STORAGE_FULL_MESSAGE =
  "Your device storage for Audibook is full. Remove some downloaded chapters or books, then try again.";
