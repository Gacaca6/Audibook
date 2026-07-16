/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import { Mp3Encoder } from "@breezystack/lamejs";

// Web Worker that runs Kokoro-82M (the audiblez voice model) fully in the
// browser and encodes the result to MP3 — no server, no API, free forever.
// The model downloads once from the Hugging Face CDN and is cached by the
// browser for offline use.
//
// Speed/memory choices for phones:
//  - q4 quantization: ~half the download and RAM of q8, noticeably faster on CPU
//  - WASM multithreading when the page is crossOriginIsolated (COOP/COEP headers)
//  - MP3 is encoded incrementally per sentence chunk, so a full chapter never
//    holds its entire PCM stream in memory (critical on iOS Safari)

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// Use every core we're allowed: threads only work when crossOriginIsolated
const hwThreads = (self.navigator && self.navigator.hardwareConcurrency) || 4;
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, hwThreads) : 1;

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
    // WebGPU is much faster where available (needs fp32); WASM works everywhere (q4)
    const hasWebGPU = typeof (self as any).navigator !== "undefined" && !!(self as any).navigator.gpu;

    const load = (device: "webgpu" | "wasm") =>
      KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: device === "webgpu" ? "fp32" : "q4",
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

async function handleGenerate(req: GenerateRequest) {
  try {
    const model = await loadModel();
    post({ type: "model-ready" });

    let encoder: Mp3Encoder | null = null;
    let sampleRate = 24000;
    const mp3Parts: Uint8Array[] = [];
    let totalSamples = 0;
    const blockSize = 1152 * 16;

    for (let i = 0; i < req.chunks.length; i++) {
      const audio = await model.generate(req.chunks[i], { voice: req.voice as any });
      sampleRate = audio.sampling_rate;
      if (!encoder) encoder = new Mp3Encoder(1, sampleRate, 48);

      // Encode this chunk's PCM right away and let it be garbage-collected
      const samples = floatTo16BitPcm(audio.audio);
      totalSamples += samples.length;
      for (let s = 0; s < samples.length; s += blockSize) {
        const encoded = encoder.encodeBuffer(samples.subarray(s, s + blockSize));
        if (encoded.length > 0) mp3Parts.push(new Uint8Array(encoded));
      }

      post({
        type: "generate-progress",
        requestId: req.requestId,
        percent: Math.round(((i + 1) / req.chunks.length) * 100),
      });
    }

    if (encoder) {
      const final = encoder.flush();
      if (final.length > 0) mp3Parts.push(new Uint8Array(final));
    }

    const blob = new Blob(mp3Parts as BlobPart[], { type: "audio/mpeg" });
    const durationSec = Math.round(totalSamples / sampleRate);

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
