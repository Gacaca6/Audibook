// Audibook brand primitives, shared by the icon and store-asset generators.
// Everything is plain SVG/CSS so assets can be re-rendered deterministically.

export const BRAND = {
  violet: "#6D4AFF",
  violetLight: "#8F73FF",
  violetDark: "#5433E0",
  violetDeep: "#4326B8",
  teal: "#00B3A4",
  tealLight: "#CFFAF5",
  coral: "#FF7A45",
  ink: "#1B1235",
  white: "#FFFFFF",
};

export const FONT_STACK =
  `'Segoe UI Variable Display','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif`;

/**
 * The Audibook mark: Audi the cat wearing over-ear headphones.
 * Drawn in a 100x100 box so it can be scaled and inset freely.
 */
export function markSvg(size = 100) {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- ears -->
  <path d="M27,47 L31,15 L54,32 Z" fill="${BRAND.white}"/>
  <path d="M73,47 L69,15 L46,32 Z" fill="${BRAND.white}"/>
  <path d="M33,44 L36,24 L48,34 Z" fill="${BRAND.coral}" fill-opacity="0.55"/>
  <path d="M67,44 L64,24 L52,34 Z" fill="${BRAND.coral}" fill-opacity="0.55"/>
  <!-- head -->
  <path d="M50,27 C74,27 85,43 85,58 C85,78 69,90 50,90 C31,90 15,78 15,58 C15,43 26,27 50,27 Z"
        fill="${BRAND.white}"/>
  <!-- eyes -->
  <ellipse cx="38" cy="57" rx="6.2" ry="7.4" fill="${BRAND.ink}"/>
  <ellipse cx="62" cy="57" rx="6.2" ry="7.4" fill="${BRAND.ink}"/>
  <circle cx="36" cy="54.4" r="2.2" fill="${BRAND.white}"/>
  <circle cx="60" cy="54.4" r="2.2" fill="${BRAND.white}"/>
  <!-- nose + smile -->
  <path d="M46,70 L54,70 L50,75.5 Z" fill="${BRAND.coral}"/>
  <path d="M42,77 Q50,84 58,77" stroke="${BRAND.ink}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <!-- headphones -->
  <path d="M13,60 C8,25 92,25 87,60" stroke="${BRAND.teal}" stroke-width="7.5" stroke-linecap="round" fill="none"/>
  <rect x="5" y="49" width="16" height="27" rx="8" fill="${BRAND.teal}"/>
  <rect x="79" y="49" width="16" height="27" rx="8" fill="${BRAND.teal}"/>
  <rect x="10" y="56" width="6" height="13" rx="3" fill="${BRAND.tealLight}"/>
  <rect x="84" y="56" width="6" height="13" rx="3" fill="${BRAND.tealLight}"/>
</svg>`;
}

/**
 * Build an icon page.
 *  shape: "rounded"  -> rounded-square artwork on a transparent canvas (manifest `any`)
 *         "square"   -> full-bleed opaque square (maskable / store icons; the OS masks it)
 *  inset: fraction of the canvas kept clear around the mark. Maskable icons need the
 *         mark inside the central 80% safe zone, so they use a larger inset.
 */
export function iconHtml({ size, shape = "rounded", inset = 0.14 }) {
  const markSize = Math.round(size * (1 - inset * 2));
  const radius = shape === "rounded" ? size * 0.2237 : 0;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  .canvas{
    width:${size}px;height:${size}px;border-radius:${radius}px;
    background:linear-gradient(150deg, ${BRAND.violetLight} 0%, ${BRAND.violet} 45%, ${BRAND.violetDark} 100%);
    display:flex;align-items:center;justify-content:center;overflow:hidden;
  }
  svg{display:block}
</style></head>
<body><div class="canvas">${markSvg(markSize)}</div></body></html>`;
}

/** Monochrome shortcut icon: a glyph on the brand gradient, maskable-safe. */
export function shortcutIconHtml({ size, glyph }) {
  const glyphSize = Math.round(size * 0.44);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  .canvas{
    width:${size}px;height:${size}px;
    background:linear-gradient(150deg, ${BRAND.violetLight} 0%, ${BRAND.violetDark} 100%);
    display:flex;align-items:center;justify-content:center;
  }
  svg{display:block;width:${glyphSize}px;height:${glyphSize}px}
</style></head>
<body><div class="canvas">${glyph}</div></body></html>`;
}

export const GLYPHS = {
  // magnifier over a sound wave — "Discover"
  discover: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 L21 21"/><path d="M8 9v3M10.5 7.5v6M13 9v3"/></svg>`,
  // stacked books — "My Books"
  library: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14Z"/><path d="M10 12h4"/></svg>`,
  // play triangle — "Continue listening"
  play: `<svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M8 5.5v13l11-6.5Z"/></svg>`,
};

/** Google Play feature graphic — 1024x500, no essential content near the edges. */
export function featureGraphicHtml({ width = 1024, height = 500 }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0}
  .canvas{
    width:${width}px;height:${height}px;position:relative;overflow:hidden;
    background:linear-gradient(120deg, ${BRAND.violetDeep} 0%, ${BRAND.violet} 55%, ${BRAND.violetLight} 100%);
    display:flex;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box;
    font-family:${FONT_STACK};
  }
  .rings{position:absolute;inset:0;overflow:hidden}
  .ring{position:absolute;border:2px solid rgba(255,255,255,.16);border-radius:50%}
  .r1{width:520px;height:520px;left:-140px;top:-80px}
  .r2{width:760px;height:760px;left:-260px;top:-190px}
  .r3{width:340px;height:340px;right:-90px;bottom:-130px;border-color:rgba(255,255,255,.22)}
  .badge{
    width:196px;height:196px;border-radius:52px;flex:0 0 auto;position:relative;
    background:rgba(255,255,255,.12);
    border:2px solid rgba(255,255,255,.3);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 24px 60px rgba(0,0,0,.28);
  }
  .copy{position:relative;color:#fff}
  .title{font-size:74px;font-weight:800;letter-spacing:-2px;line-height:1;margin:0}
  .sub{font-size:27px;font-weight:600;margin:18px 0 0;color:rgba(255,255,255,.93);line-height:1.32}
  .pills{display:flex;gap:12px;margin-top:26px}
  .pill{
    font-size:17px;font-weight:700;color:#fff;padding:9px 18px;border-radius:999px;
    background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.28);
  }
</style></head>
<body>
  <div class="canvas">
    <div class="rings"><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div></div>
    <div class="badge">${markSvg(140)}</div>
    <div class="copy">
      <p class="title">Audibook</p>
      <p class="sub">20,000+ free audiobooks, offline.<br/>Turn your own books into audio too.</p>
      <div class="pills"><span class="pill">Offline</span><span class="pill">No account</span><span class="pill">100% free</span></div>
    </div>
  </div>
</body></html>`;
}
