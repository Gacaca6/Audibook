import { mkdirSync } from "node:fs";
import { launch, findChrome } from "./browser.mjs";
import { iconHtml, shortcutIconHtml, featureGraphicHtml, widgetPreviewHtml, GLYPHS } from "./brand.mjs";

// Renders every launcher and store graphic at exact pixel dimensions using the
// system Chrome. Re-run any time the brand mark changes:  node tools/generate-icons.mjs

const ICONS = "public/icons";
const STORE = "store/graphics";

async function shoot(page, { html, width, height, out, omitBackground = false, type = "png", quality }) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({
    path: out,
    omitBackground,
    type,
    ...(type === "jpeg" ? { quality: quality ?? 92 } : {}),
    clip: { x: 0, y: 0, width, height },
  });
  console.log("  ✓", out);
}

async function main() {
  mkdirSync(ICONS, { recursive: true });
  mkdirSync(STORE, { recursive: true });

  const executablePath = findChrome();
  console.log("Using browser:", executablePath);
  const browser = await launch(executablePath);
  const page = await browser.newPage();

  console.log("Launcher icons (manifest `any` — rounded artwork, transparent canvas):");
  for (const size of [192, 512]) {
    await shoot(page, {
      html: iconHtml({ size, shape: "rounded", inset: 0.1 }),
      width: size,
      height: size,
      out: `${ICONS}/icon-${size}.png`,
      omitBackground: true,
    });
  }

  console.log("Maskable icons (full bleed; mark inside the 80% safe zone):");
  for (const size of [192, 512]) {
    await shoot(page, {
      html: iconHtml({ size, shape: "square", inset: 0.21 }),
      width: size,
      height: size,
      out: `${ICONS}/icon-maskable-${size}.png`,
    });
  }

  console.log("Apple touch icon (opaque, unrounded — iOS applies its own mask):");
  await shoot(page, {
    html: iconHtml({ size: 180, shape: "square", inset: 0.12 }),
    width: 180,
    height: 180,
    out: `${ICONS}/apple-touch-icon.png`,
  });

  console.log("Shortcut icons:");
  for (const [name, glyph] of Object.entries({
    discover: GLYPHS.discover,
    library: GLYPHS.library,
    continue: GLYPHS.play,
  })) {
    await shoot(page, {
      html: shortcutIconHtml({ size: 192, glyph }),
      width: 192,
      height: 192,
      out: `${ICONS}/shortcut-${name}.png`,
    });
  }

  console.log("Store graphics:");
  // Play store icon: 512x512, 32-bit PNG, full square (Play applies the mask)
  await shoot(page, {
    html: iconHtml({ size: 512, shape: "square", inset: 0.14 }),
    width: 512,
    height: 512,
    out: `${STORE}/play-icon-512.png`,
  });
  // App Store icon: 1024x1024, flattened, no alpha, no rounded corners
  await shoot(page, {
    html: iconHtml({ size: 1024, shape: "square", inset: 0.14 }),
    width: 1024,
    height: 1024,
    out: `${STORE}/appstore-icon-1024.png`,
  });
  // Feature graphic: 1024x500. JPEG => guaranteed no alpha channel.
  await shoot(page, {
    html: featureGraphicHtml({ width: 1024, height: 500 }),
    width: 1024,
    height: 500,
    out: `${STORE}/feature-graphic-1024x500.jpg`,
    type: "jpeg",
    quality: 95,
  });

  console.log("Widget preview:");
  mkdirSync("public/widgets", { recursive: true });
  await shoot(page, {
    html: widgetPreviewHtml({ width: 600, height: 400 }),
    width: 600,
    height: 400,
    out: "public/widgets/continue-preview.png",
  });

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
