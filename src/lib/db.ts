import { Book } from "../types";

// Tiny promise wrapper around IndexedDB.
//
// Store "books": book metadata + chapter text + quizzes (keyPath: id).
// Store "audio": legacy. It held MP3s from the old in-browser neural TTS, which
// crashed Safari and has been removed. The store is still created so existing
// databases open cleanly, and purgeLegacyAudio() reclaims that space once.
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
}

/** Free the megabytes left behind by the removed neural-TTS experiment. */
export async function purgeLegacyAudio(): Promise<void> {
  const db = await openDb();
  if (!db.objectStoreNames.contains("audio")) return;
  const tx = db.transaction("audio", "readwrite");
  tx.objectStore("audio").clear();
  await txDone(tx);
}
