import { Book } from "../types";

// Tiny promise wrapper around IndexedDB.
//
// Store "books":   book metadata + chapter text + quizzes (keyPath: id).
// Store "audio":   downloaded audiobook MP3s for offline listening,
//                  keyed `${bookId}:${chapterId}` (covers are `${bookId}:cover`).
// Store "pending": chapter downloads that failed and should be retried by the
//                  service worker's Background Sync handler once the network
//                  returns. Keyed `${bookId}:${chapterId}`.
//
// Bumping DB_VERSION only ADDS stores — existing books and audio are untouched.
const DB_NAME = "aubibook-db";
const DB_VERSION = 2;

/** Shape of a queued retry, shared with the service worker. */
export interface PendingDownload {
  key: string; // `${bookId}:${chapterId}`
  bookId: string;
  chapterId: number;
  url: string;
  title: string;
  queuedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("audio")) {
        db.createObjectStore("audio");
      }
      if (!db.objectStoreNames.contains("pending")) {
        db.createObjectStore("pending", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAllBooks(): Promise<Book[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("books", "readonly").objectStore("books").getAll();
    req.onsuccess = () => resolve(req.result as Book[]);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(book: Book): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("books", "readwrite");
  tx.objectStore("books").put(book);
  await txDone(tx);
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("books", "readwrite");
  tx.objectStore("books").delete(bookId);
  await txDone(tx);
  // Remove any downloaded chapter audio along with the book
  const audioTx = db.transaction("audio", "readwrite");
  audioTx.objectStore("audio").delete(IDBKeyRange.bound(`${bookId}:`, `${bookId}:￿`));
  await txDone(audioTx);
}

export function audioKey(bookId: string, chapterId: number): string {
  return `${bookId}:${chapterId}`;
}

export async function getAudio(bookId: string, chapterId: number): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("audio", "readonly").objectStore("audio").get(audioKey(bookId, chapterId));
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudio(bookId: string, chapterId: number, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("audio", "readwrite");
  tx.objectStore("audio").put(blob, audioKey(bookId, chapterId));
  await txDone(tx);
}

// ---- Background Sync retry queue ----

/** Remember a chapter whose download failed, so the SW can finish it later. */
export async function queuePendingDownload(entry: Omit<PendingDownload, "key" | "queuedAt">): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("pending", "readwrite");
  tx.objectStore("pending").put({
    ...entry,
    key: audioKey(entry.bookId, entry.chapterId),
    queuedAt: Date.now(),
  } satisfies PendingDownload);
  await txDone(tx);
}

export async function getPendingDownloads(): Promise<PendingDownload[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("pending", "readonly").objectStore("pending").getAll();
    req.onsuccess = () => resolve(req.result as PendingDownload[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removePendingDownload(bookId: string, chapterId: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("pending", "readwrite");
  tx.objectStore("pending").delete(audioKey(bookId, chapterId));
  await txDone(tx);
}

export async function deleteAudio(bookId: string, chapterId: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("audio", "readwrite");
  tx.objectStore("audio").delete(audioKey(bookId, chapterId));
  await txDone(tx);
}

// Cover art lives in the same blob store under `${bookId}:cover`, which the
// deleteBook prefix range (`${bookId}:` … `${bookId}:￿`) already cleans up.
export async function saveCover(bookId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("audio", "readwrite");
  tx.objectStore("audio").put(blob, `${bookId}:cover`);
  await txDone(tx);
}

export async function getCover(bookId: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("audio", "readonly").objectStore("audio").get(`${bookId}:cover`);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}
