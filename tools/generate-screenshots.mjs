import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { launch } from "./browser.mjs";

// Captures real app UI at exact store dimensions.
//   node tools/generate-screenshots.mjs
// Builds are served by `vite preview`; the script starts and stops it itself.
//
// Phone shots use a 360x640 CSS viewport at deviceScaleFactor 3 => 1080x1920,
// so the app renders its genuine mobile layout (not the desktop device frame).

const SHOTS_PNG = "public/screenshots"; // referenced by the web manifest
const SHOTS_JPG = "store/graphics"; // uploaded to Play (JPEG = guaranteed no alpha)
const ORIGIN = "http://localhost:4173";

const PHONE = { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const WIDE = { width: 1920, height: 1080, deviceScaleFactor: 1 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startPreview() {
  const proc = spawn("npm.cmd", ["run", "preview", "--", "--port", "4173", "--strictPort"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return proc;
}

async function waitForServer(page, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 3000 });
      if (res && res.ok()) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("vite preview did not start on " + ORIGIN);
}

/**
 * Start every run from a clean slate. Without this, a service worker left by a
 * previous run serves a stale bundle from cache and the capture drifts.
 */
async function resetOrigin(page) {
  // A service worker left by a previous run can take control mid-evaluate and
  // destroy the execution context, so retry until the teardown sticks.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await clearOriginState(page);
      return;
    } catch {
      await gotoApp(page).catch(() => {});
      await sleep(1000);
    }
  }
  console.log("    (origin reset incomplete — continuing)");
}

async function clearOriginState(page) {
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("aubibook-db");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
}

/**
 * Seed only the player's own progress (XP/streak) so the gamification is
 * visible. Every achievement is pre-unlocked so no "trophy unlocked" toast
 * fires mid-capture and covers the UI. Books themselves are added through the
 * real Discover -> Get flow, so screenshots show genuine data.
 */
async function seedProfile(page) {
  await page.evaluate(() => {
    const unlocked = [
      "first-listen",
      "quiz-master",
      "xp-scholar",
      "perfect-score",
      "shelf-builder",
    ].map((id) => ({ id, currentValue: 999, unlocked: true }));

    localStorage.setItem(
      "aubi_profile_v1",
      JSON.stringify({
        xp: 450,
        streak: 6,
        lastActiveDate: new Date().toDateString(),
        unlockedChapters: [],
        completedQuizzes: [],
        achievements: unlocked,
      })
    );
  });
}

/**
 * Navigate with retries. Tearing down a service worker can abort the very next
 * navigation (ERR_ABORTED), so one retry makes the reset reliable.
 */
async function gotoApp(page, attempts = 5) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(ORIGIN, { waitUntil: "networkidle2", timeout: 30000 });
      return;
    } catch (err) {
      lastError = err;
      await sleep(1000);
    }
  }
  throw lastError;
}

/** Wait for the launch splash to finish so it never appears in a screenshot. */
async function waitForApp(page) {
  await page.waitForFunction(() => !document.getElementById("splash"), { timeout: 15000 });
  await sleep(700);
}

async function clickByText(page, text, tag = "button") {
  const clicked = await page.evaluate(
    (t, sel) => {
      const el = [...document.querySelectorAll(sel)].find((n) => n.textContent?.includes(t));
      if (!el) return false;
      el.click();
      return true;
    },
    text,
    tag
  );
  if (!clicked) throw new Error(`Could not find ${tag} containing "${text}"`);
  await sleep(900);
}

/** Scroll the app's main scroll container (not the window) by N pixels. */
async function scrollApp(page, pixels) {
  await page.evaluate((px) => {
    const scroller = [...document.querySelectorAll("div")].find(
      (el) => el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY === "auto"
    );
    if (scroller) scroller.scrollTop += px;
    else window.scrollBy(0, px);
  }, pixels);
  await sleep(900);
}

/** Never capture a half-painted cover: wait until every <img> has decoded. */
async function waitForImages(page) {
  await page
    .waitForFunction(
      () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      { timeout: 20000 }
    )
    .catch(() => console.log("    (some images still loading — capturing anyway)"));
  await sleep(600);
}

async function capture(page, name, label) {
  await waitForImages(page);
  await page.screenshot({ path: `${SHOTS_PNG}/${name}.png` });
  await page.screenshot({ path: `${SHOTS_JPG}/screenshot-${name}.jpg`, type: "jpeg", quality: 94 });
  console.log(`  ✓ ${name}  (${label})`);
}

async function main() {
  mkdirSync(SHOTS_PNG, { recursive: true });
  mkdirSync(SHOTS_JPG, { recursive: true });

  const preview = startPreview();
  const browser = await launch();

  try {
    const page = await browser.newPage();
    await page.setViewport(PHONE);
    await waitForServer(page);

    // Clean slate, seed progress, then reload so the app boots with stats showing
    await resetOrigin(page);
    await seedProfile(page);
    await gotoApp(page);
    await waitForApp(page);

    console.log("Phone screenshots (1080x1920):");

    // 1. Discover — real search results from archive.org.
    //    Click the built-in "Sherlock Holmes" suggestion chip: it calls the
    //    app's own search directly, so no synthetic input events are involved.
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll("#discover-container button")].find(
        (b) => b.textContent?.trim() === "Sherlock Holmes"
      );
      if (!chip) throw new Error("suggestion chip not found");
      chip.click();
    });
    // NOTE: the results heading is CSS-uppercased, and innerText reflects
    // text-transform — so this check must be case-insensitive.
    await page.waitForFunction(() => /audiobooks found/i.test(document.body.innerText), {
      timeout: 60000,
    });
    await sleep(3000); // let cover art settle
    await capture(page, "narrow-1-discover", "Discover search results");

    // 2. Add a real audiobook through the real flow (metadata, cover art,
    //    audio URLs and quizzes all come from the live services)
    console.log("  … adding a real audiobook (this fetches metadata + quiz text)");
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("#discover-container button")].find((b) =>
        b.textContent?.includes("Get")
      );
      btn?.click();
    });
    // The app switches to My Books once the book lands on the shelf
    await page.waitForFunction(() => !!document.querySelector("#uploader-container"), {
      timeout: 90000,
    });
    await sleep(3500); // cover art + storage meter
    // Scroll past the uploader so the shelf itself is the hero of this shot
    await scrollApp(page, 620);
    await capture(page, "narrow-2-library", "Offline shelf");

    // 3. Player
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('#dashboard-container [class*="cursor-pointer"]')].find((d) =>
        d.textContent?.includes("Sherlock")
      );
      card?.click();
    });
    await page.waitForFunction(() => !!document.getElementById("player-screen"), { timeout: 20000 });
    await sleep(3000);
    await capture(page, "narrow-3-player", "Player with download options");

    // 4. Quiz — the button is disabled when no quiz could be generated, so
    //    assert it is live rather than silently capturing the player again.
    const quizReady = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("#player-screen button")].find((b) =>
        b.textContent?.includes("Quiz")
      );
      return btn ? !btn.disabled : false;
    });
    if (!quizReady) {
      throw new Error(
        "Quiz button is disabled — no quiz was generated for this book, so the quiz screenshot would be a duplicate."
      );
    }
    await clickByText(page, "Quiz");
    await page.waitForFunction(() => !!document.getElementById("quiz-modal-view"), { timeout: 15000 });
    await sleep(1500);
    await capture(page, "narrow-4-quiz", "Comprehension quiz");

    // 5. Wide (desktop presentation for the manifest's wide form factor)
    console.log("Wide screenshot (1920x1080):");
    await page.setViewport(WIDE);
    await gotoApp(page);
    await waitForApp(page);
    await sleep(1200);
    await page.screenshot({ path: `${SHOTS_PNG}/wide-1-discover.png` });
    console.log("  ✓ wide-1-discover");

    console.log("\nDone.");
  } finally {
    await browser.close();
    preview.kill();
    // vite spawns a child; make sure the port is released on Windows
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(preview.pid), "/f", "/t"], { stdio: "ignore" });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
