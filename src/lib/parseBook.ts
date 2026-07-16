import JSZip from "jszip";
import { Book, Chapter, ParseProgress } from "../types";
import { countWords, estimateDuration, extractiveSummary } from "./textUtils";
import { generateQuiz } from "./quizGen";

// Parses EPUB / PDF / TXT files entirely in the browser — no server, no AI API.
// EPUB chapters come from the real spine + table of contents; PDF and TXT are
// split on chapter headings (falling back to evenly-sized sections).

type OnProgress = (p: ParseProgress) => void;

interface RawChapter {
  title: string;
  text: string;
}

const MIN_CHAPTER_CHARS = 300; // skip covers, title pages, blank sections
const FALLBACK_CHUNK_WORDS = 2200; // ~15 min of narration per section

// ---------- TXT / generic text chaptering ----------

const HEADING_RE = /^\s*(chapter|part|book|section|prologue|epilogue|introduction|preface|act)\b[^\n]{0,80}$/gim;

function splitTextIntoChapters(fullText: string): RawChapter[] {
  const text = fullText.replace(/\r\n/g, "\n");
  const matches = [...text.matchAll(HEADING_RE)];

  if (matches.length >= 2) {
    const chapters: RawChapter[] = [];
    // Text before the first heading (foreword etc.)
    const preamble = text.slice(0, matches[0].index).trim();
    if (preamble.length >= MIN_CHAPTER_CHARS) {
      chapters.push({ title: "Opening", text: preamble });
    }
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!;
      const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
      const headingLine = matches[i][0].trim();
      const body = text.slice(start + matches[i][0].length, end).trim();
      if (body.length >= MIN_CHAPTER_CHARS) {
        chapters.push({ title: headingLine.replace(/\s+/g, " ").slice(0, 80), text: body });
      }
    }
    if (chapters.length >= 2) return chapters;
  }

  // No usable headings: split into evenly sized sections on paragraph borders
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chapters: RawChapter[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const p of paragraphs) {
    current.push(p.trim());
    currentWords += countWords(p);
    if (currentWords >= FALLBACK_CHUNK_WORDS) {
      chapters.push({ title: `Part ${chapters.length + 1}`, text: current.join("\n\n") });
      current = [];
      currentWords = 0;
    }
  }
  if (current.length > 0) {
    const tail = current.join("\n\n");
    if (chapters.length > 0 && countWords(tail) < 300) {
      chapters[chapters.length - 1].text += "\n\n" + tail;
    } else {
      chapters.push({ title: `Part ${chapters.length + 1}`, text: tail });
    }
  }
  if (chapters.length === 1) chapters[0].title = "Full Book";
  return chapters;
}

// ---------- EPUB ----------

function resolveHref(basePath: string, href: string): string {
  const clean = href.split("#")[0];
  if (clean.startsWith("/")) return clean.slice(1);
  const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/") + 1) : "";
  const url = new URL(clean, "https://x/" + baseDir);
  return decodeURIComponent(url.pathname.slice(1));
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, nav, sup.noteref").forEach((el) => el.remove());
  // Preserve paragraph breaks
  doc.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, br").forEach((el) => {
    el.insertAdjacentText("beforeend", "\n");
  });
  return (doc.body?.textContent || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function firstHeading(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const h = doc.querySelector("h1, h2, h3");
  const title = h?.textContent?.replace(/\s+/g, " ").trim();
  return title && title.length > 0 && title.length <= 120 ? title : null;
}

async function parseEpub(
  file: File,
  onProgress: OnProgress
): Promise<{ title: string; author: string; chapters: RawChapter[] }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  onProgress({ stage: "extracting", percent: 10 });

  // 1. container.xml → OPF path
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("Not a valid EPUB (missing container.xml)");
  const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("Not a valid EPUB (missing rootfile)");

  // 2. OPF → metadata, manifest, spine
  const opfXml = await zip.file(opfPath)!.async("string");
  const opf = new DOMParser().parseFromString(opfXml, "application/xml");

  const title =
    opf.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "title")[0]?.textContent?.trim() ||
    file.name.replace(/\.epub$/i, "");
  const author =
    opf.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "creator")[0]?.textContent?.trim() ||
    "Unknown Author";

  const manifest = new Map<string, { href: string; properties: string }>();
  opf.querySelectorAll("manifest > item").forEach((item) => {
    manifest.set(item.getAttribute("id") || "", {
      href: item.getAttribute("href") || "",
      properties: item.getAttribute("properties") || "",
    });
  });

  const spineIds = [...opf.querySelectorAll("spine > itemref")]
    .filter((ref) => ref.getAttribute("linear") !== "no")
    .map((ref) => ref.getAttribute("idref") || "");

  // 3. Table of contents (EPUB3 nav or EPUB2 NCX) → href → title map
  const tocTitles = new Map<string, string>();
  try {
    let navHtml: string | null = null;
    let navPath = "";
    for (const [, item] of manifest) {
      if (item.properties.includes("nav")) {
        navPath = resolveHref(opfPath, item.href);
        navHtml = (await zip.file(navPath)?.async("string")) || null;
        break;
      }
    }
    if (navHtml) {
      const navDoc = new DOMParser().parseFromString(navHtml, "text/html");
      navDoc.querySelectorAll("nav a[href]").forEach((a) => {
        const href = resolveHref(navPath, a.getAttribute("href") || "");
        const label = a.textContent?.replace(/\s+/g, " ").trim();
        if (label && !tocTitles.has(href)) tocTitles.set(href, label);
      });
    } else {
      // EPUB2 NCX fallback
      const ncxItem = [...manifest.values()].find((i) => i.href.endsWith(".ncx"));
      if (ncxItem) {
        const ncxPath = resolveHref(opfPath, ncxItem.href);
        const ncxXml = await zip.file(ncxPath)?.async("string");
        if (ncxXml) {
          const ncx = new DOMParser().parseFromString(ncxXml, "application/xml");
          ncx.querySelectorAll("navPoint").forEach((np) => {
            const label = np.querySelector("navLabel > text")?.textContent?.replace(/\s+/g, " ").trim();
            const src = np.querySelector("content")?.getAttribute("src");
            if (label && src) {
              const href = resolveHref(ncxPath, src);
              if (!tocTitles.has(href)) tocTitles.set(href, label);
            }
          });
        }
      }
    }
  } catch {
    // TOC is a nice-to-have; heading detection covers the gaps
  }

  // 4. Walk the spine and extract chapter text
  const chapters: RawChapter[] = [];
  for (let i = 0; i < spineIds.length; i++) {
    const item = manifest.get(spineIds[i]);
    if (!item) continue;
    const docPath = resolveHref(opfPath, item.href);
    const html = await zip.file(docPath)?.async("string");
    if (!html) continue;

    const text = htmlToText(html);
    if (text.length < MIN_CHAPTER_CHARS) continue; // cover, title page, etc.

    const chapterTitle =
      tocTitles.get(docPath) || firstHeading(html) || `Chapter ${chapters.length + 1}`;
    chapters.push({ title: chapterTitle.slice(0, 80), text });

    onProgress({ stage: "chapters", percent: 15 + Math.round((i / spineIds.length) * 55) });
  }

  if (chapters.length === 0) throw new Error("No readable chapters found in this EPUB.");
  return { title, author, chapters };
}

// ---------- PDF ----------

async function parsePdf(file: File, onProgress: OnProgress): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push(pageText);
    onProgress({ stage: "extracting", percent: 5 + Math.round((i / pdf.numPages) * 60) });
  }
  return pages.join("\n\n");
}

// ---------- Entry point ----------

export async function parseBookFile(file: File, onProgress: OnProgress): Promise<Book> {
  onProgress({ stage: "reading", percent: 2 });
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  let title = file.name.replace(ext, "");
  let author = "Unknown Author";
  let rawChapters: RawChapter[];

  if (ext === ".epub") {
    const epub = await parseEpub(file, onProgress);
    title = epub.title;
    author = epub.author;
    rawChapters = epub.chapters;
  } else if (ext === ".pdf") {
    const text = await parsePdf(file, onProgress);
    if (countWords(text) < 50) {
      throw new Error("This PDF has no extractable text (it may be a scanned book).");
    }
    rawChapters = splitTextIntoChapters(text);
  } else if (ext === ".txt") {
    const text = await file.text();
    rawChapters = splitTextIntoChapters(text);
  } else {
    throw new Error("Unsupported file type. Please use EPUB, PDF, or TXT.");
  }

  // Build full chapters with summaries + quizzes (fast, fully local)
  const chapters: Chapter[] = rawChapters.map((raw, idx) => {
    onProgress({ stage: "quizzes", percent: 72 + Math.round((idx / rawChapters.length) * 26) });
    return {
      id: idx + 1,
      title: raw.title,
      text: raw.text,
      duration: estimateDuration(raw.text),
      summary: extractiveSummary(raw.text),
      quiz: generateQuiz(raw.text),
      hqAudio: "none",
    };
  });

  const totalWords = chapters.reduce((sum, c) => sum + countWords(c.text), 0);

  return {
    id: "book-" + Date.now(),
    title,
    author,
    fileName: file.name,
    uploadDate: new Date().toISOString(),
    chaptersCount: chapters.length,
    totalWords,
    status: "ready",
    chapters,
    xpReward: Math.min(1000, chapters.length * 100),
  };
}
