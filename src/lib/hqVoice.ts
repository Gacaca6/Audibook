import { chunkSentences } from "./textUtils";
import { saveAudio } from "./db";

// Main-thread manager for the HQ voice worker. Owns the singleton worker,
// tracks model download state, and serializes chapter generation requests.

export type HqModelState = "idle" | "loading" | "ready" | "error";

export interface HqGenerationJob {
  bookId: string;
  chapterId: number;
}

type ModelListener = (state: HqModelState, downloadPercent: number) => void;
type JobProgressListener = (job: HqGenerationJob, percent: number) => void;
type JobDoneListener = (job: HqGenerationJob, durationSec: number) => void;
type JobErrorListener = (job: HqGenerationJob, error: string) => void;

const DEFAULT_VOICE = "af_heart"; // Kokoro's warmest storyteller voice
const AUTO_KEY = "audibook_hq_auto"; // once the user generates one chapter, auto-generate as they read

interface PendingJob extends HqGenerationJob {
  requestId: string;
  text: string;
}

/** Has the user opted into HQ audio (by generating at least once)? */
export function isHqAutoEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function enableHqAuto(): void {
  try {
    localStorage.setItem(AUTO_KEY, "1");
  } catch {
    // storage unavailable — auto mode just stays off
  }
}

class HqVoiceManager {
  private worker: Worker | null = null;
  private queue: PendingJob[] = [];
  private activeJob: PendingJob | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;

  modelState: HqModelState = "idle";
  modelDownloadPercent = 0;

  onModelChange?: ModelListener;
  onJobProgress?: JobProgressListener;
  onJobDone?: JobDoneListener;
  onJobError?: JobErrorListener;

  static isSupported(): boolean {
    return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
  }

  isQueued(bookId: string, chapterId: number): boolean {
    return (
      (this.activeJob?.bookId === bookId && this.activeJob?.chapterId === chapterId) ||
      this.queue.some((j) => j.bookId === bookId && j.chapterId === chapterId)
    );
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL("./ttsWorker.ts", import.meta.url), { type: "module" });

    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case "model-progress":
          this.modelState = "loading";
          this.modelDownloadPercent = msg.percent;
          this.onModelChange?.(this.modelState, msg.percent);
          break;
        case "model-ready":
          this.modelState = "ready";
          this.modelDownloadPercent = 100;
          this.onModelChange?.(this.modelState, 100);
          break;
        case "model-error":
          this.modelState = "error";
          this.onModelChange?.(this.modelState, this.modelDownloadPercent);
          this.failActiveJob(msg.error);
          break;
        case "generate-progress":
          if (this.activeJob && this.activeJob.requestId === msg.requestId) {
            this.onJobProgress?.(this.activeJob, msg.percent);
          }
          break;
        case "generate-done":
          if (this.activeJob && this.activeJob.requestId === msg.requestId) {
            const job = this.activeJob;
            saveAudio(job.bookId, job.chapterId, msg.blob)
              .then(() => this.onJobDone?.(job, msg.durationSec))
              .catch((err) => this.onJobError?.(job, err?.message || "Failed to save audio"))
              .finally(() => {
                this.activeJob = null;
                this.processQueue();
              });
          }
          break;
        case "generate-error":
          if (this.activeJob && this.activeJob.requestId === msg.requestId) {
            this.failActiveJob(msg.error);
          }
          break;
      }
    };

    this.worker.onerror = () => {
      this.modelState = "error";
      this.onModelChange?.(this.modelState, this.modelDownloadPercent);
      this.failActiveJob("The HQ voice worker crashed");
    };

    return this.worker;
  }

  private failActiveJob(error: string) {
    if (this.activeJob) {
      const job = this.activeJob;
      this.activeJob = null;
      this.onJobError?.(job, error);
    }
    this.processQueue();
  }

  /** Kick off the one-time model download (~90MB, cached for offline use). */
  preloadModel(): void {
    if (this.modelState === "ready" || this.modelState === "loading") return;
    this.modelState = "loading";
    this.onModelChange?.(this.modelState, 0);
    this.ensureWorker().postMessage({ type: "load" });
  }

  /** Queue HQ audio generation for a chapter; result is saved to IndexedDB. */
  generateChapter(bookId: string, chapterId: number, text: string): void {
    if (this.isQueued(bookId, chapterId)) return;
    const job: PendingJob = {
      bookId,
      chapterId,
      text,
      requestId: `${bookId}:${chapterId}:${Date.now()}`,
    };
    this.queue.push(job);
    this.preloadModel();
    this.processQueue();
  }

  private processQueue(): void {
    if (this.activeJob || this.queue.length === 0) {
      if (!this.activeJob && this.queue.length === 0) this.releaseWakeLock();
      return;
    }
    this.activeJob = this.queue.shift()!;
    this.acquireWakeLock();
    // Kokoro handles ~1-2 sentences at a time best; chunk on sentence borders
    const chunks = chunkSentences(this.activeJob.text, 350);
    this.ensureWorker().postMessage({
      type: "generate",
      requestId: this.activeJob.requestId,
      chunks,
      voice: DEFAULT_VOICE,
    });
  }

  // iOS suspends JS (including workers) when the screen sleeps, which kills
  // generation mid-way. Keep the screen awake while a job is running.
  private async acquireWakeLock(): Promise<void> {
    if (this.wakeLock) return;
    try {
      const nav = navigator as any;
      if (nav.wakeLock?.request) {
        this.wakeLock = await nav.wakeLock.request("screen");
      }
    } catch {
      // Wake lock denied (e.g. low battery mode) — generation still runs while visible
    }
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }
}

export const hqVoice = new HqVoiceManager();
export { HqVoiceManager };
