# Google Play submission kit

Everything needed to package and publish Audibook as a Trusted Web Activity (TWA).

## Locked identity — do not change after the first upload

| Field | Value |
|---|---|
| **Canonical URL** | `https://audibook-beta.vercel.app` |
| **Package ID** | `com.gacaca6.audibook` |
| **App name (Play, ≤30)** | `Audibook: Offline Audiobooks` |

Changing the package ID after publishing creates a brand-new listing with zero installs
and zero reviews. Changing the URL breaks every installed app, because Digital Asset
Links bind to the exact origin.

## Assets in this folder

| File | Spec | Where it goes |
|---|---|---|
| `graphics/play-icon-512.png` | 512×512, 32-bit PNG | Play Console → Store listing → App icon |
| `graphics/feature-graphic-1024x500.jpg` | 1024×500, JPEG (no alpha) | Play Console → Store listing → Feature graphic |
| `graphics/appstore-icon-1024.png` | 1024×1024, no alpha | App Store (later) |
| `../public/screenshots/narrow-*.png` | 1080×1920 PNG | Play Console → Phone screenshots (≥2 required) |

Regenerate any graphic with `node tools/generate-icons.mjs`, and screenshots with
`node tools/generate-screenshots.mjs` (needs the dev server running).

## Critical: Digital Asset Links

`public/.well-known/assetlinks.json` currently ships **placeholder fingerprints**. Until they
are replaced, the installed app will show a browser address bar.

1. Package the app (Bubblewrap or PWABuilder) — this generates `signing.keystore`.
2. Get the upload key fingerprint:
   ```
   keytool -list -v -keystore signing.keystore -alias android
   ```
3. Replace `REPLACE_WITH_UPLOAD_KEY_SHA256` with that SHA-256 value.
4. Upload the `.aab` to Play Console.
5. Go to **Play Console → Setup → App integrity → App signing** and copy the
   **SHA-256 certificate fingerprint** Google generated.
6. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` with it.
7. Redeploy the site, then confirm:
   ```
   curl -sI https://audibook-beta.vercel.app/.well-known/assetlinks.json
   ```
   It must return `200` and `content-type: application/json` with no redirect.

Step 5–6 is the single most common reason a shipped TWA still shows an address bar.

## Critical: keep the signing key forever

`signing.keystore` plus its passwords (`signing-key-info.txt`) are the **only** way to ship
an update under this listing. Back them up somewhere permanent and private. If they are
lost, the listing can never be updated again.

## Play policy notes for this app

- **Target audience: 13+.** Google Play's Families policy does not permit PWA/TWA apps to
  target children. Do not select a child age band in the Target Audience section.
- **Privacy policy URL:** `https://audibook-beta.vercel.app/privacy.html`
- **Data safety:** declare *no data collected, no data shared* (see `listing.md`).
- **Content rights:** audiobooks are public-domain LibriVox recordings hosted by the
  Internet Archive; quiz text comes from Project Gutenberg. Both are public domain and
  attributed in-app.
