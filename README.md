# 🦉 Audibook

**Turn any book into a gamified audiobook — Duolingo-style. 100% free, forever.**

Audibook converts your EPUB, PDF, and TXT files into audiobooks with comprehension quizzes, XP, streaks, and trophies. Everything runs **inside your browser** — your books never leave your device, there are no servers, no accounts, and no API keys. Inspired by [audiblez](https://github.com/santinic/audiblez).

## How it's free

| Feature | How it works |
|---|---|
| 📚 Book parsing | EPUB (real chapters from the book's own table of contents), PDF, and TXT are parsed on-device |
| 🗣️ Instant voice | Your device's built-in voices (Siri voices on iPhone) start narrating immediately |
| 🎙️ HQ voice | [Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) — the audiblez voice — runs in your browser via WebAssembly/WebGPU (multithreaded, q4-quantized). One ~45MB download, then it works offline forever. Chapters generate one at a time as you reach them |
| 🧠 Quizzes | Generated on-device from the chapter text (cloze comprehension questions) |
| 💾 Storage | Books and generated audio live in your browser's IndexedDB — fully offline |
| 🌐 Hosting | Static files only — deploys free on GitHub Pages |

## Getting Started

**Prerequisites:** Node.js 20+

```
npm install
npm run dev
```

Open http://localhost:5173.

## Install on iPhone

1. Deploy anywhere with HTTPS (GitHub Pages works — see below).
2. Open the URL in **Safari** on your iPhone.
3. Tap **Share → Add to Home Screen**.
4. Launch AubiBook from your home screen — it runs fullscreen like a native app, offline included.

## Production Build

```
npm run build
```

Outputs a fully static site to `dist/` — host it on GitHub Pages, Netlify, Cloudflare Pages, or any static server. The included GitHub Actions workflow (`.github/workflows/deploy.yml`) auto-deploys to GitHub Pages on every push to `main`.

## Tech Stack

React 19 · Vite · Tailwind CSS 4 · Kokoro-82M (kokoro-js) · Web Speech API · pdf.js · JSZip · IndexedDB · Service Worker
