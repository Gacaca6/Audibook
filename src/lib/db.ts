import { Book } from "../types";

// Tiny promise wrapper around IndexedDB.
//
// Store "books": book metadata + chapter text + quizzes (keyPath: id).
// Store "audio": downloaded audiobook MP3s for offline listening,
//                keyed `${bookId}:${chapterId}`.
const DB_NAME = "aubibook-db";
const DB_VERSION = 1;

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
