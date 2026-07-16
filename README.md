# 🦉 Audibook

**Turn any book into a gamified audiobook — Duolingo-style. 100% free, forever.**

Audibook converts your EPUB, PDF, and TXT files into audiobooks with comprehension quizzes, XP, streaks, and trophies. Everything runs **inside your browser** — your books never leave your device, there are no servers, no accounts, and no API keys. Inspired by [audiblez](https://github.com/santinic/audiblez).

## How it's free

| Feature | How it works |
|---|---|
| 📚 Book parsing | EPUB (real chapters from the book's own table of contents), PDF, and TXT are parsed on-device |
| 🗣️ Narration | Your device's own speech engine — instant, offline, no download. Pick any voice installed on your phone or computer |
| 🧠 Quizzes | Generated on-device from the chapter text (cloze comprehension questions) |
| 💾 Storage | Books live in your browser's IndexedDB — fully offline |
| 🌐 Hosting | Static files only — deploys free on Vercel, GitHub Pages, or any static host |

## Why the device voice?

Audibook originally ran [Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (the [audiblez](https://github.com/santinic/audiblez) voice) in-browser via ONNX. **It reliably crashes iOS Safari**: the model downloads, then the tab dies and reloads. This is a known upstream issue, not a tuning problem — see [transformers.js#1241](https://github.com/huggingface/transformers.js/issues/1241), [#1242](https://github.com/huggingface/transformers.js/issues/1242), and [this Kokoro-specific report](https://github.com/open-webui/open-webui/discussions/10025). Safari also caps memory at roughly 1GB per origin.

The device's own speech engine has none of those problems: zero download, instant playback, works offline, and every phone already has good voices installed. A prototype that works beats a demo that crashes.

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

React 19 · Vite · Tailwind CSS 4 · Web Speech API · pdf.js · JSZip · IndexedDB · Service Worker
