import { useSyncExternalStore } from "react";
import { Book } from "../types";
import * as db from "./db";

// Global audio engine for real (LibriVox) audiobooks. The <audio> element
// lives OUTSIDE the React tree, so playback survives every navigation —
// leaving the player screen, browsing Discover, taking a quiz. The mini
// player and the full player are both just views over this one engine.

export interface NowPlaying {
  book: Book;
  chapterIndex: number;
  fromDevice: boolean; // playing the downloaded copy (works offline)
}

type Snapshot = {
  nowPlaying: NowPlaying | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  error: string | null;
};

class GlobalAudioPlayer {
  private el: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = {
    nowPlaying: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    rate: 1,
    error: null,
  };
  private loadToken = 0; // invalidates stale async loads

  /** Called when a chapter finishes (for XP). Set once by the app shell. */
  onChapterEnd?: (bookId: string, chapterId: number) => void;
  /** Auto-advance failed to start the next chapter (e.g. offline). */
  onAutoAdvanceBlocked?: (message: string) => void;

  private ensureElement(): HTMLAudioElement {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = "metadata";

    el.addEventListener("timeupdate", () => {
      this.update({ currentTime: el.currentTime });
      this.reportPosition();
    });
    el.addEventListener("loadedmetadata", () => {
      if (isFinite(el.duration)) this.update({ duration: el.duration });
    });
    el.addEventListener("play", () => {
      this.update({ isPlaying: true });
      this.setPlaybackState("playing");
    });
    el.addEventListener("pause", () => {
      this.update({ isPlaying: false });
      this.setPlaybackState("paused");
    });
    el.addEventListener("ended", () => {
      const np = this.snapshot.nowPlaying;
      if (!np) return;
      const chapter = np.book.chapters[np.chapterIndex];
      if (chapter) this.onChapterEnd?.(np.book.id, chapter.id);
      // Continuous playback: roll into the next chapter, screen on or off
      if (np.chapterIndex < np.book.chapters.length - 1) {
        void this.playChapter(np.book, np.chapterIndex + 1, true);
      } else {
        this.update({ isPlaying: false, currentTime: 0 });
      }
    });
    el.addEventListener("error", () => {
      if (!this.snapshot.nowPlaying) return;
      const message = navigator.onLine
        ? "This audio couldn't load. Try again or pick another chapter."
        : "You're offline and this chapter isn't downloaded.";
      this.update({ isPlaying: false, error: message });
      this.onAutoAdvanceBlocked?.(message);
    });

    this.el = el;
    return el;
  }

  // ---- store plumbing (useSyncExternalStore) ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- playback API ----

  /**
   * Load a chapter (offline copy first, stream otherwise) and optionally
   * start playing. Reuses the current source when it's already loaded.
   */
  async playChapter(book: Book, chapterIndex: number, autoplay: boolean): Promise<void> {
    const chapter = book.chapters[chapterIndex];
    if (!chapter?.audioUrl) return;

    const np = this.snapshot.nowPlaying;
    const el = this.ensureElement();

    // Same chapter already loaded: just play/refresh book metadata
    if (np && np.book.id === book.id && np.chapterIndex === chapterIndex && el.src) {
      this.update({ nowPlaying: { ...np, book } });
      if (autoplay && el.paused) await el.play().catch(() => {});
      this.setupMediaSession();
      return;
    }

    const token = ++this.loadToken;
    el.pause();
    this.update({
      nowPlaying: { book, chapterIndex, fromDevice: false },
      isPlaying: false,
      currentTime: 0,
      duration: chapter.duration || 0,
      error: null,
    });

    let fromDevice = false;
    let src = chapter.audioUrl;
    try {
      const blob = await db.getAudio(book.id, chapter.id);
      if (token !== this.loadToken) return; // superseded by a newer load
      if (blob) {
        this.releaseObjectUrl();
        this.objectUrl = URL.createObjectURL(blob);
        src = this.objectUrl;
        fromDevice = true;
      }
    } catch {
      // fall through to streaming
    }
    if (token !== this.loadToken) return;

    if (!fromDevice) this.releaseObjectUrl();
    el.src = src;
    this.update({ nowPlaying: { book, chapterIndex, fromDevice } });
    if (!fromDevice && !navigator.onLine) {
      this.update({ error: "This chapter isn't downloaded yet — connect to the internet or download it for offline." });
    }
    this.setupMediaSession();

    if (autoplay) {
      try {
        el.playbackRate = this.snapshot.rate;
        await el.play();
      } catch {
        this.update({ isPlaying: false });
      }
    }
  }

  toggle(): void {
    const el = this.el;
    if (!el || !this.snapshot.nowPlaying) return;
    if (el.paused) {
      el.playbackRate = this.snapshot.rate;
      this.update({ error: null });
      void el.play().catch(() => {
        this.update({
          isPlaying: false,
          error: navigator.onLine
            ? "Couldn't start playback. Try downloading this chapter."
            : "You're offline and this chapter isn't downloaded.",
        });
      });
    } else {
      el.pause();
    }
  }

  pause(): void {
    this.el?.pause();
  }

  seek(time: number): void {
    const el = this.el;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(this.snapshot.duration || el.duration || 0, time));
    this.update({ currentTime: el.currentTime });
  }

  skip(seconds: number): void {
    const el = this.el;
    if (el) this.seek(el.currentTime + seconds);
  }

  setRate(rate: number): void {
    this.update({ rate });
    if (this.el) this.el.playbackRate = rate;
  }

  /** Stop and forget (book deleted or explicitly closed). */
  stop(): void {
    this.loadToken++;
    this.el?.pause();
    if (this.el) this.el.removeAttribute("src");
    this.releaseObjectUrl();
    this.update({ nowPlaying: null, isPlaying: false, currentTime: 0, duration: 0, error: null });
  }

  /** Keep the stored book object fresh (e.g. after a download completes). */
  syncBook(book: Book): void {
    const np = this.snapshot.nowPlaying;
    if (np && np.book.id === book.id) {
      this.update({ nowPlaying: { ...np, book } });
    }
  }

  private releaseObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  // ---- lock-screen integration ----

  private setPlaybackState(state: "playing" | "paused") {
    try {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
    } catch {
      // nice-to-have
    }
  }

  private setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    try {
      const np = this.snapshot.nowPlaying;
      if (!np) return;
      const chapter = np.book.chapters[np.chapterIndex];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter?.title || np.book.title,
        artist: np.book.author,
        album: np.book.title,
        artwork: np.book.coverUrl ? [{ src: np.book.coverUrl, sizes: "180x180", type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => this.toggle());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => this.skip(-15));
      navigator.mediaSession.setActionHandler("seekforward", () => this.skip(15));
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        const cur = this.snapshot.nowPlaying;
        if (cur && cur.chapterIndex > 0) void this.playChapter(cur.book, cur.chapterIndex - 1, true);
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        const cur = this.snapshot.nowPlaying;
        if (cur && cur.chapterIndex < cur.book.chapters.length - 1) {
          void this.playChapter(cur.book, cur.chapterIndex + 1, true);
        }
      });
    } catch {
      // nice-to-have
    }
  }

  private reportPosition() {
    const el = this.el;
    if (!el || !("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      if (isFinite(el.duration) && el.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: el.duration,
          playbackRate: el.playbackRate,
          position: Math.min(el.currentTime, el.duration),
        });
      }
    } catch {
      // nice-to-have
    }
  }
}

export const audioPlayer = new GlobalAudioPlayer();

/** React binding: re-renders on every playback state change. */
export function useAudioPlayer(): Snapshot {
  return useSyncExternalStore(audioPlayer.subscribe, audioPlayer.getSnapshot);
}
