import { chunkSentences } from "./textUtils";

// Narration engine: the device's own speech synthesizer.
//
// This is the whole audio engine — free, offline, instant, no download.
// It is also the only thing that actually works on iPhone: running a neural
// TTS model (Kokoro/ONNX) in Safari reliably crashes the tab, which is a known
// upstream bug (huggingface/transformers.js#1241, #1242).
//
// Safari/iOS quirks this class works around:
//  1. getVoices() is empty on first call -> wait for the `voiceschanged` event.
//  2. speak() must be kicked off from a user gesture -> play() is only ever
//     called from a click handler; later chunks inherit that unlocked state.
//  3. Long utterances get truncated/stalled -> text is split into short,
//     sentence-safe chunks and queued one at a time.
//  4. The synth silently dies mid-utterance (classic ~15s bug) -> a watchdog
//     resumes it, and re-speaks the current chunk if it goes quiet.
//  5. pause()/resume() are unreliable -> "pause" cancels but remembers the
//     chunk index, so resume restarts cleanly from that chunk.

// A chunk is only considered dead once it has been silent for longer than it
// could plausibly take to read aloud. Safari does not reliably fire `onboundary`
// word events, so a flat timeout would keep declaring healthy long chunks dead
// and restarting them forever. ~12 characters per second is normal speech.
const CHARS_PER_SECOND = 12;
const NO_START_TIMEOUT_MS = 6000; // engine never picked the utterance up at all
const STALL_GRACE_MS = 5000; // slack on top of the estimated read time

export interface VoiceOption {
  id: string; // voiceURI
  name: string;
  lang: string;
  offline: boolean;
}

/** Resolve the device's voice list, waiting for it if Safari hasn't filled it yet. */
export function loadVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  if (!SpeechReader.isSupported()) return Promise.resolve([]);

  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    setTimeout(finish, timeoutMs);
  });
}

/** English voices, best-sounding first, deduped by name. */
export function listVoiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;

  const score = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    let s = 0;
    // Apple's higher-quality variants advertise themselves in the name
    if (name.includes("premium") || name.includes("enhanced")) s += 40;
    if (name.includes("natural") || name.includes("neural")) s += 30;
    if (v.localService) s += 20; // on-device => works offline, no lag
    if (v.default) s += 5;
    if (name.includes("compact")) s -= 20; // Apple's low-quality fallbacks
    return s;
  };

  const seen = new Set<string>();
  return pool
    .slice()
    .sort((a, b) => score(b) - score(a))
    .filter((v) => {
      const key = v.name.replace(/\s*\((enhanced|premium|compact)\)/i, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((v) => ({
      id: v.voiceURI,
      name: v.name.replace(/\s*\(.*?\)\s*/g, " ").trim() || v.name,
      lang: v.lang,
      offline: v.localService,
    }));
}

const VOICE_KEY = "audibook_voice_uri";

export function getSavedVoiceId(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceId(id: string): void {
  try {
    localStorage.setItem(VOICE_KEY, id);
  } catch {
    // storage unavailable — the default voice is used instead
  }
}

export class SpeechReader {
  private chunks: string[];
  private chunkStarts: number[];
  private totalChars: number;
  private index = 0;
  private playing = false;
  private disposed = false;
  private voice: SpeechSynthesisVoice | null = null;
  private watchdog: number | null = null;
  private lastEventAt = 0;
  private retriedCurrentChunk = false;
  private currentStarted = false;

  rate = 1;
  /** Fires with the index of the chunk now being read (for read-along highlight). */
  onChunkChange?: (chunkIndex: number, totalChunks: number) => void;
  onProgress?: (charsDone: number, totalChars: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;

  constructor(text: string) {
    // Short chunks keep Safari honest and make seeking feel responsive
    this.chunks = chunkSentences(text, 200);
    this.chunkStarts = [];
    let offset = 0;
    for (const c of this.chunks) {
      this.chunkStarts.push(offset);
      offset += c.length + 1;
    }
    this.totalChars = offset;
  }

  static isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  get currentChunkIndex(): number {
    return this.index;
  }

  getChunks(): string[] {
    return this.chunks;
  }

  setVoice(voice: SpeechSynthesisVoice | null): void {
    this.voice = voice;
    if (this.playing) this.restartCurrentChunk();
  }

  /** Must be called from a user gesture the first time (iOS requirement). */
  play(): void {
    if (this.disposed || !SpeechReader.isSupported()) return;
    window.speechSynthesis.cancel();
    this.playing = true;
    this.retriedCurrentChunk = false;
    this.startWatchdog();
    // Safari can deadlock if speak() lands in the same tick as cancel()
    setTimeout(() => this.speakCurrent(), 0);
  }

  private speakCurrent(): void {
    if (this.disposed || !this.playing) return;

    if (this.index >= this.chunks.length) {
      this.playing = false;
      this.stopWatchdog();
      this.index = 0;
      this.onEnd?.();
      return;
    }

    this.lastEventAt = Date.now();
    this.currentStarted = false;
    this.onChunkChange?.(this.index, this.chunks.length);

    const utterance = new SpeechSynthesisUtterance(this.chunks[this.index]);
    utterance.rate = this.rate;
    utterance.pitch = 1.05;
    if (this.voice) {
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
    }

    utterance.onstart = () => {
      this.lastEventAt = Date.now();
      this.currentStarted = true;
      this.retriedCurrentChunk = false;
    };

    utterance.onboundary = (event) => {
      this.lastEventAt = Date.now();
      if (event.name === "word") {
        this.onProgress?.(this.chunkStarts[this.index] + event.charIndex, this.totalChars);
      }
    };

    utterance.onend = () => {
      if (this.disposed || !this.playing) return;
      this.lastEventAt = Date.now();
      this.advance();
    };

    utterance.onerror = (event) => {
      if (this.disposed || !this.playing) return;
      this.lastEventAt = Date.now();
      // "interrupted"/"canceled" are our own cancel() calls — not real failures
      const err = (event as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled") return;
      if (err === "not-allowed") {
        this.playing = false;
        this.stopWatchdog();
        this.onError?.("Tap play to start narration.");
        return;
      }
      this.advance(); // skip a chunk the engine refuses rather than stalling
    };

    window.speechSynthesis.speak(utterance);
  }

  private advance(): void {
    this.index += 1;
    this.retriedCurrentChunk = false;
    this.onProgress?.(
      this.index < this.chunks.length ? this.chunkStarts[this.index] : this.totalChars,
      this.totalChars
    );
    this.speakCurrent();
  }

  private restartCurrentChunk(): void {
    window.speechSynthesis.cancel();
    setTimeout(() => this.speakCurrent(), 0);
  }

  /** How long this chunk should plausibly take to speak, in ms. */
  private expectedChunkMs(): number {
    const chars = this.chunks[this.index]?.length ?? 0;
    return (chars / CHARS_PER_SECOND) * 1000 / Math.max(0.5, this.rate);
  }

  // Safari/Chrome silently stall long sessions; nudge or restart when they do.
  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = window.setInterval(() => {
      if (!this.playing || this.disposed) return;

      // Known engine bug: synthesis pauses itself. resume() is a no-op otherwise.
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();

      // Before onstart, a short timeout is right: the engine never took the job.
      // After onstart, allow the chunk's full estimated read time (doubled, since
      // rate and voice vary) before calling it dead.
      const limit = this.currentStarted
        ? this.expectedChunkMs() * 2 + STALL_GRACE_MS
        : NO_START_TIMEOUT_MS;

      if (Date.now() - this.lastEventAt < limit) return;

      if (!this.retriedCurrentChunk) {
        this.retriedCurrentChunk = true;
        this.lastEventAt = Date.now();
        this.restartCurrentChunk();
      } else {
        this.lastEventAt = Date.now();
        this.advance(); // still dead — move on rather than hang forever
      }
    }, 2000);
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  pause(): void {
    this.playing = false;
    this.stopWatchdog();
    window.speechSynthesis.cancel(); // resume restarts this chunk from its start
  }

  stop(): void {
    this.playing = false;
    this.stopWatchdog();
    this.index = 0;
    window.speechSynthesis.cancel();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.playing) this.restartCurrentChunk();
  }

  /** Jump by whole chunks (~1-2 sentences each). */
  skipChunks(count: number): void {
    const next = Math.max(0, Math.min(this.chunks.length - 1, this.index + count));
    this.index = next;
    this.onProgress?.(this.chunkStarts[next], this.totalChars);
    this.onChunkChange?.(next, this.chunks.length);
    if (this.playing) this.restartCurrentChunk();
  }

  /** Jump straight to a chunk (used by tap-to-read-from-here). */
  seekToChunk(index: number): void {
    this.skipChunks(index - this.index);
  }

  dispose(): void {
    this.disposed = true;
    this.playing = false;
    this.stopWatchdog();
    window.speechSynthesis.cancel();
  }
}
