import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

// Uses the browser already installed on this machine — no 150MB Chromium
// download, and nothing extra ships with the app (dev dependency only).
const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function findChrome() {
  for (const path of CANDIDATES) {
    if (path && existsSync(path)) return path;
  }
  throw new Error("No Chrome/Edge found. Set CHROME_PATH to your browser executable.");
}

export function launch(executablePath = findChrome()) {
  return puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--hide-scrollbars", "--force-device-scale-factor=1", "--font-render-hinting=none"],
  });
}
