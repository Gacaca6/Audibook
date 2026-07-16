/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";
import { Mp3Encoder } from "@breezystack/lamejs";

// Web Worker that runs Kokoro-82M (the audiblez voice model) fully in the
// browser and encodes the result to MP3 — no server, no API, free forever.
// The ~90MB model downloads once from the Hugging Face CDN and is cached
// by the browser for offline use.

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let tts: KokoroTTS | null = null;
let loadingPromise: Promise<KokoroTTS> | null = null;

interface GenerateRequest {
  type: "generate";
  requestId: string;
  chunks: string[]; // sentence-safe text chunks
  voice: string;
}

type InMessage = { type: "load" } | GenerateRequest;

function post(message: object) {
  (self as unknown as Worker).postMessage(message);
}

async function loadModel(): Promise<KokoroTTS> {
  if (tts) return tts;
  if (!loadingPromise) {
    // WebGPU is much faster where available (needs fp32); WASM works everywhere (q8)
    const hasWebGPU = typeof (self as any).navigator !== "undefined" && !!(self as any).navigator.gpu;

    const load = (device: "webgpu" | "wasm") =>
      KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: device === "webgpu" ? "fp32" : "q8",
        device,
        progress_callback: (info: any) => {
          if (info.status === "progress" && typeof info.progress === "number") {
            post({ type: "model-progress", file: info.file, percent: Math.round(info.progress) });
          }
        },
      });

    loadingPromise = (hasWebGPU ? load("webgpu").catch(() => load("wasm")) : load("wasm")).then(
      (model) => {
        tts = model;
        return model;
      }
    );
  }
  return loadingPromise;
}

function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function encodeMp3(samples: Int16Array, sampleRate: number, kbps = 48): Uint8Array[] {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const blockSize = 1152 * 16;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) parts.push(new Uint8Array(encoded));
  }
  const final = encoder.flush();
  if (final.length > 0) parts.push(new Uint8Array(final));
  return parts;
}

async function handleGenerate(req: GenerateRequest) {
  try {
    const model = await loadModel();
    post({ type: "model-ready" });

    const pcmParts: Float32Array[] = [];
    let sampleRate = 24000;

    for (let i = 0; i < req.chunks.length; i++) {
      const audio = await model.generate(req.chunks[i], { voice: req.voice as any });
      pcmParts.push(audio.audio);
      sampleRate = audio.sampling_rate;
      post({
        type: "generate-progress",
        requestId: req.requestId,
        percent: Math.round(((i + 1) / req.chunks.length) * 100),
      });
    }

    // Concatenate all chunks into one PCM stream, then encode to MP3
    const totalLength = pcmParts.reduce((sum, p) => sum + p.length, 0);
    const pcm = new Float32Array(totalLength);
    let offset = 0;
    for (const part of pcmParts) {
      pcm.set(part, offset);
      offset += part.length;
    }

    const mp3Parts = encodeMp3(floatTo16BitPcm(pcm), sampleRate);
    const blob = new Blob(mp3Parts as BlobPart[], { type: "audio/mpeg" });
    const durationSec = Math.round(totalLength / sampleRate);

    post({ type: "generate-done", requestId: req.requestId, blob, durationSec });
  } catch (err: any) {
    post({
      type: "generate-error",
      requestId: req.requestId,
      error: err?.message || "HQ voice generation failed",
    });
  }
}

self.onmessage = async (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  if (msg.type === "load") {
    try {
      await loadModel();
      post({ type: "model-ready" });
    } catch (err: any) {
      post({ type: "model-error", error: err?.message || "Failed to load the HQ voice model" });
    }
  } else if (msg.type === "generate") {
    await handleGenerate(msg);
  }
};
