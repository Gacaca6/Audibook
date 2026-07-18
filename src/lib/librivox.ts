import { Book, Chapter } from "../types";

// Free, ready-made audiobooks: LibriVox recordings (public domain, volunteer
// narrated) hosted on the Internet Archive. Both endpoints used here are
// CORS-open and need no API key:
//   - archive.org/advancedsearch.php  -> search the librivoxaudio collection
//   - archive.org/metadata/{id}       -> chapter MP3 list for one audiobook
// MP3s at archive.org/download/{id}/{file} stream directly into <audio> and
// can be fetched as blobs for offline listening.

export interface AudiobookSearchResult {
  identifier: string;
  title: string;
  creator: string;
  downloads: number;
  coverUrl: string;
}

export function coverUrl(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

export async function searchAudiobooks(query: string): Promise<AudiobookSearchResult[]> {
  const cleaned = query.trim().replace(/[()"\\]/g, " ");
  if (!cleaned) return [];
  const q = encodeURIComponent(`collection:librivoxaudio AND (title:(${cleaned}) OR creator:(${cleaned}))`);
  const url =
    `https://archive.org/advancedsearch.php?q=${q}` +
    `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=downloads` +
    `&sort[]=downloads+desc&rows=20&page=1&output=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Search is unavailable right now. Please try again.");
  const json = await res.json();

  return (json.response?.docs || []).map((doc: any) => ({
    identifier: doc.identifier,
    title: String(doc.title || doc.identifier),
    creator: Array.isArray(doc.creator) ? doc.creator.join(", ") : String(doc.creator || "Unknown"),
    downloads: Number(doc.downloads || 0),
    coverUrl: coverUrl(doc.identifier),
  }));
}

/** "284.21" (seconds) or "4:44" / "1:02:33" -> whole seconds. */
function parseLength(value: unknown): number {
  const s = String(value ?? "").trim();
  if (!s) return 0;
  if (s.includes(":")) {
    return s
      .split(":")
      .map(Number)
      .reduce((acc, part) => acc * 60 + (isNaN(part) ? 0 : part), 0);
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n);
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

/** Fetch one LibriVox audiobook and shape it as a shelf Book with streamable chapters. */
export async function getAudiobook(identifier: string): Promise<Book> {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  if (!res.ok) throw new Error("Couldn't load this audiobook's details. Please try again.");
  const meta = await res.json();

  const files: any[] = meta.files || [];

  // Prefer the smaller 64kbps derivatives (about half the size on a phone);
  // fall back to the original VBR MP3s.
  const lowBitrate = files.filter((f) => f.format === "64Kbps MP3");
  const originals = files.filter(
    (f) => typeof f.name === "string" && f.name.endsWith(".mp3") && f.source === "original"
  );
  const mp3s = (lowBitrate.length >= originals.length && lowBitrate.length > 0 ? lowBitrate : originals)
    .slice()
    .sort((a, b) => {
      const ta = parseInt(a.track, 10);
      const tb = parseInt(b.track, 10);
      if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
      return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
    });

  if (mp3s.length === 0) throw new Error("This recording has no playable audio files.");

  const chapters: Chapter[] = mp3s.map((f, idx) => ({
    id: idx + 1,
    title: (f.title && String(f.title).trim()) || `Part ${idx + 1}`,
    text: "",
    duration: parseLength(f.length),
    summary: "",
    quiz: [],
    audioUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`,
    audioSizeMB: f.size ? Math.round((Number(f.size) / 1048576) * 10) / 10 : undefined,
    downloaded: false,
  }));

  // Cover art: prefer the item's real JPEG over the tiny tile, and use the
  // /download/ path — unlike /services/img/ it sends CORS headers, so the
  // image can also be fetched as a blob and stored for offline.
  const imageFile =
    files.find((f) => f.format === "JPEG") ||
    files.find((f) => f.format === "Item Tile") ||
    files.find((f) => typeof f.name === "string" && /\.(jpe?g|png)$/i.test(f.name) && !/spectrogram/i.test(f.name));
  const cover = imageFile
    ? `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(imageFile.name)}`
    : coverUrl(identifier);

  const m = meta.metadata || {};
  return {
    id: `lv-${identifier}`,
    title: String(m.title || identifier),
    author: Array.isArray(m.creator) ? m.creator.join(", ") : String(m.creator || "Unknown"),
    fileName: identifier,
    uploadDate: new Date().toISOString(),
    chaptersCount: chapters.length,
    totalWords: 0,
    status: "ready",
    chapters,
    xpReward: Math.min(1000, chapters.length * 50),
    source: "librivox",
    coverUrl: cover,
    description: m.description ? stripHtml(String(m.description)).slice(0, 500) : undefined,
    runtime: m.runtime ? String(m.runtime) : undefined,
  };
}

/** Download one chapter's MP3 with progress, for offline listening. */
export async function downloadChapterAudio(
  chapter: Chapter,
  onProgress: (percent: number) => void
): Promise<Blob> {
  if (!chapter.audioUrl) throw new Error("This chapter has no audio file.");
  const res = await fetch(chapter.audioUrl);
  if (!res.ok || !res.body) throw new Error("Download failed. Check your connection and try again.");

  const total = Number(res.headers.get("Content-Length") || 0);
  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.byteLength;
    if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)));
  }
  onProgress(100);
  return new Blob(parts, { type: "audio/mpeg" });
}
