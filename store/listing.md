# Google Play — store listing (copy-paste ready)

Every field below is within Play's limit. Character counts are noted so you can
verify nothing is truncated on paste.

---

## App details

**App name** (limit 30) — **28 chars**
```
Audibook: Offline Audiobooks
```

**Short description** (limit 80) — **75 chars**
```
20,000+ free human-narrated audiobooks. Listen offline. No account, no ads.
```

**Full description** (limit 4000) — **1,990 chars**
```
Audibook turns your phone into a complete audiobook library — and it is free, with no account and no ads.

Browse more than 20,000 real audiobooks narrated by human volunteers, download the chapters you want, and listen anywhere, even with no signal. Every recording comes from the LibriVox public-domain collection, so there is nothing to buy and nothing to subscribe to.

Have a book that is not in the library? Add your own EPUB, PDF or TXT file and Audibook reads it aloud with your device's own voice, splitting it into real chapters automatically. Your file is processed entirely on your phone and never uploaded anywhere.

WHAT YOU CAN DO
• Search a library of 20,000+ free, human-narrated audiobooks
• Download chapters for true offline listening — on a plane, underground, anywhere
• Keep listening with the screen off, with lock-screen play, pause and skip controls
• Turn your own EPUB, PDF or TXT books into audiobooks, read aloud on-device
• Pick any narrator voice installed on your phone, and set the speed you like
• Answer comprehension quizzes drawn from the book you just heard
• Earn XP, build a daily streak, and unlock trophies as you listen
• Follow along with the text and tap any line to jump straight to it

BUILT FOR PRIVACY
Audibook has no accounts, no advertising, no analytics and no tracking of any kind. It collects no personal data at all. Your books, your downloads and your progress stay on your device, and you can delete them at any time.

WORKS OFFLINE
The app itself is installable and opens without a connection. Downloaded chapters play with no internet at all, and your shelf, covers and progress are always available.

A NOTE ON THE LIBRARY
Audiobooks are public-domain recordings produced by LibriVox volunteers and hosted by the Internet Archive. Titles are classics — Sherlock Holmes, Dracula, Pride and Prejudice, Treasure Island and thousands more. Recent bestsellers are not available, which is exactly why you can also bring your own books.
```

---

## Categorisation

| Field | Value |
|---|---|
| **App category** | Books & Reference |
| **Tags** | Audiobooks, Books, Education |
| **Contact email** | mikelgodwin1234@gmail.com |
| **Website** | https://audibook-beta.vercel.app |
| **Privacy policy URL** | https://audibook-beta.vercel.app/privacy.html |

---

## Graphic assets (all generated to exact spec)

| Asset | Spec | File |
|---|---|---|
| App icon | 512×512, 32-bit PNG | `graphics/play-icon-512.png` |
| Feature graphic | 1024×500, JPEG (no alpha) | `graphics/feature-graphic-1024x500.jpg` |
| Phone screenshot 1 | 1080×1920, JPEG | `graphics/screenshot-narrow-1-discover.jpg` |
| Phone screenshot 2 | 1080×1920, JPEG | `graphics/screenshot-narrow-2-library.jpg` |
| Phone screenshot 3 | 1080×1920, JPEG | `graphics/screenshot-narrow-3-player.jpg` |
| Phone screenshot 4 | 1080×1920, JPEG | `graphics/screenshot-narrow-4-quiz.jpg` |

Play requires a minimum of 2 phone screenshots; 4 are supplied. All are real app
UI captured in the mobile layout — no mockups, no browser chrome.

---

## Data safety form

Answer **"No"** to *Does your app collect or share any of the required user data types?*

If the console asks per-category, the answer is **none collected, none shared** for
every category: Location, Personal info, Financial info, Health, Messages, Photos and
videos, Audio files, Files and docs, Calendar, Contacts, App activity, Web browsing,
App info and performance, Device or other IDs.

Supporting answers:
- **Is all user data encrypted in transit?** Yes — the app is served over HTTPS and all
  network requests use HTTPS.
- **Do you provide a way for users to request data deletion?** Yes — all data is stored
  on the device and can be deleted in-app (remove a book) or by uninstalling.
- **Data collected but processed only on the device:** the books a user adds and the
  chapters they download are stored locally and never transmitted. Nothing is sent to a
  server, so nothing is declared as collected.

---

## Content rating (IARC questionnaire)

Answer honestly; the expected outcome is **Everyone / PEGI 3**:

| Question | Answer |
|---|---|
| Violence, sexuality, profanity, drugs, gambling | No |
| User-generated content shared between users | **No** — books stay on the user's own device |
| Does the app share the user's location | No |
| Does the app allow users to interact or exchange content | No |
| Does the app contain ads | No |
| Does the app offer purchases | No |

Note: the library contains classic literature (e.g. Dracula) with mild literary
peril. If the questionnaire asks about mature literary themes, answer accurately;
this may result in a slightly higher rating, which is fine.

After completing the questionnaire, Play issues an **IARC rating ID**. Add it to
`public/manifest.json` as `"iarc_rating_id": "<id>"` and redeploy — that is the one
remaining optional manifest field.

---

## Target audience and content

**Critical:** select **13 and over** only. Google Play's Families policy does not
permit PWA/TWA-based apps to target children. Do **not** tick any age band under 13,
and do not opt the app into the Designed for Families programme.

- *Is your app designed for children?* **No**
- *Does your store listing appeal to children?* **No** — the listing copy and graphics
  are aimed at a general adult audience.

---

## App access

No login, no gated content. Select **"All functionality is available without special
access"** — reviewers need no test credentials.

---

## Ads

Select **"No, my app does not contain ads."**

---

## Pre-submission checklist

- [ ] Package the TWA (Bubblewrap or PWABuilder) using package ID `com.gacaca6.audibook`
- [ ] Back up `signing.keystore` + passwords somewhere permanent — without them the app can never be updated
- [ ] Replace both placeholder fingerprints in `public/.well-known/assetlinks.json` (see `README.md`) and redeploy
- [ ] Upload the `.aab`, then add the **Play App Signing** fingerprint and redeploy again
- [ ] Install from internal testing and confirm **no browser address bar** appears
- [ ] Confirm the app opens with aeroplane mode on
- [ ] Complete Data safety, Content rating, Target audience, Ads and App access sections
- [ ] Add the IARC rating ID to the manifest and redeploy
