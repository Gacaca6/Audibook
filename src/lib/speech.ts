import { chunkSentences } from "./textUtils";

// Instant narration via the browser's built-in Web Speech API (free, offline,
// uses the device's own voices — Siri voices on iPhone).
//
// iOS Safari silently stops long utterances and its pause/resume is unreliable,
// so we split the text into sentence chunks and queue them one at a time.
// "Pause" cancels the current utterance but remembers the chunk index, so
// resume restarts from the current chunk.

export class SpeechReader {
  private chunks: string[];
  private chunkStarts: number[]; // char offset of each chunk
  private totalChars: number;
  private index = 0;
  private playing = false;
  private disposed = false;

  rate = 1;
  onProgress?: (charsDone: number, totalChars: number) => void;
  onEnd?: () => void;

  constructor(text: string) {
    this.chunks = chunkSentences(text, 220);
    this.chunkStarts = [];
    let offset = 0;
    for (const c of this.chunks) {
      this.chunkStarts.push(offset);
      offset += c.length + 1;
    }
    this.totalChars = offset;
  }

  static isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** 0..1 progress through the text. */
  get progress(): number {
    return this.totalChars === 0 ? 0 : this.chunkStarts[this.index] / this.totalChars;
  }

  play(): void {
    if (this.disposed || !SpeechReader.isSupported()) return;
    window.speechSynthesis.cancel();
    this.playing = true;
    this.speakCurrent();
  }

  private speakCurrent(): void {
    if (this.disposed || !this.playing) return;
    if (this.index >= this.chunks.length) {
      this.playing = false;
      this.index = 0;
      this.onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(this.chunks[this.index]);
    utterance.rate = this.rate;
    utterance.pitch = 1.05;

    utterance.onboundary = (event) => {
      if (event.name === "word") {
        this.onProgress?.(this.chunkStarts[this.index] + event.charIndex, this.totalChars);
      }
    };

    utterance.onend = () => {
      if (this.disposed || !this.playing) return;
      this.index += 1;
      this.onProgress?.(
        this.index < this.chunks.length ? this.chunkStarts[this.index] : this.totalChars,
        this.totalChars
      );
      this.speakCurrent();
    };

    utterance.onerror = () => {
      // Treat errors like a finished chunk so playback continues
      if (this.disposed || !this.playing) return;
      this.index += 1;
      this.speakCurrent();
    };

    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    this.playing = false;
    window.speechSynthesis.cancel(); // resume restarts from this chunk
  }

  stop(): void {
    this.playing = false;
    this.index = 0;
    window.speechSynthesis.cancel();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.playing) {
      window.speechSynthesis.cancel();
      this.speakCurrent();
    }
  }

  /** Jump forward/backward by whole chunks (~1-2 sentences each). */
  skipChunks(count: number): void {
    this.index = Math.max(0, Math.min(this.chunks.length - 1, this.index + count));
    this.onProgress?.(this.chunkStarts[this.index], this.totalChars);
    if (this.playing) {
      window.speechSynthesis.cancel();
      this.speakCurrent();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.playing = false;
    window.speechSynthesis.cancel();
  }
}
