import { Book } from "../types";
import { generateQuiz } from "./quizGen";
import { extractiveSummary } from "./textUtils";

// Quizzes for real audiobooks: find the matching Project Gutenberg text in
// archive.org's Gutenberg mirror (gutenberg.org itself blocks CORS, but
// archive.org's /download/ path does not), slice it across the recording's
// chapters proportionally by duration, and generate comprehension quizzes
// from each slice. Best-effort: a recording with no confident text match
// simply has no quizzes.

const MAX_TEXT_BYTES = 4 * 1048576; // sanity cap; classic novels are < 1.5MB

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(version \d+.*?\)/g, "")
    .replace(/\(dramatic reading\)/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function authorLastName(creator: string): string {
  const first = creator.split(/[,;]/)[0].trim(); // "Stoker, Bram" -> "Stoker"
  const words = first.split(/\s+/);
  return (first.includes(",") ? words[0] : words[words.length - 1] || "").toLowerCase();
}

/** Strip Project Gutenberg header/footer boilerplate (new and old formats). */
export function stripGutenbergBoilerplate(text: string): string {
  let body = text;

  const startNew = body.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*/i);
  if (startNew !== -1) {
    body = body.slice(body.indexOf("\n", startNew) + 1);
  } else {
    // Old etexts end their license block with *END*THE SMALL PRINT!...
    const smallPrint = body.search(/\*END\*?\s*THE SMALL PRINT[^\n]*/i);
    if (smallPrint !== -1) {
      body = body.slice(body.indexOf("\n", smallPrint) + 1);
    } else if (/project gutenberg/i.test(body.slice(0, 2000))) {
      body = body.slice(Math.floor(body.length * 0.02)); // crude but safe
    }
  }

  const endNew = body.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (endNew !== -1) {
    body = body.slice(0, endNew);
  } else {
    const endOld = body.search(/end of (the )?project gutenberg/i);
    if (endOld > body.length * 0.7) body = body.slice(0, endOld);
  }

  // Old etexts keep transcriber credits ("E-text revised by...") after the
  // license block. The story reliably starts at its first chapter heading —
  // jump there when one appears early in the text.
  const head = body.slice(0, Math.floor(body.length * 0.15));
  const firstHeading = head.match(/^\s*(chapter|part|book|prologue|introduction|act)\b[^\n]*$/im);
  if (firstHeading && firstHeading.index !== undefined && firstHeading.index > 0) {
    body = body.slice(firstHeading.index);
  }

  return body.trim();
}

/** Find and fetch the full text of a public-domain book, or null. */
export async function fetchBookText(title: string, creator: string): Promise<string | null> {
  try {
    const cleanTitle = normalizeTitle(title);
    const lastName = authorLastName(creator);
    if (!cleanTitle) return null;

    const q = encodeURIComponent(
      `collection:gutenberg AND title:(${cleanTitle})` + (lastName ? ` AND creator:(${lastName})` : "")
    );
    const res = await fetch(
      `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=creator&rows=5&output=json`
    );
    if (!res.ok) return null;
    const docs: any[] = (await res.json()).response?.docs || [];

    // Confident match only: the mirror title must contain (or be contained by)
    // the recording's normalized title, otherwise quizzes would be nonsense.
    const match = docs.find((d) => {
      const dt = normalizeTitle(String(d.title || ""));
      return dt && (dt.includes(cleanTitle) || cleanTitle.includes(dt));
    });
    if (!match) return null;

    const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(match.identifier)}`);
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();

    const txtFile = (meta.files || [])
      .filter(
        (f: any) =>
          typeof f.name === "string" &&
          f.name.endsWith(".txt") &&
          !/readme/i.test(f.name) &&
          Number(f.size) > 20000 &&
          Number(f.size) < MAX_TEXT_BYTES
      )
      .sort((a: any, b: any) => Number(b.size) - Number(a.size))[0];
    if (!txtFile) return null;

    const textRes = await fetch(
      `https://archive.org/download/${encodeURIComponent(match.identifier)}/${encodeURIComponent(txtFile.name)}`
    );
    if (!textRes.ok) return null;
    const raw = await textRes.text();

    const body = stripGutenbergBoilerplate(raw);
    return body.length > 10000 ? body : null;
  } catch {
    return null;
  }
}

/**
 * Attach quizzes + summaries to a real audiobook's chapters by slicing the
 * book text proportionally to each chapter's audio duration. Approximate by
 * design — the questions stay in the neighborhood of what was just heard.
 */
export function attachQuizzes(book: Book, text: string): Book {
  const totalDuration = book.chapters.reduce((sum, ch) => sum + (ch.duration || 0), 0);
  if (totalDuration <= 0 || text.length < 10000) return book;

  let cursor = 0;
  const chapters = book.chapters.map((chapter) => {
    const share = (chapter.duration || 0) / totalDuration;
    const sliceLength = Math.floor(text.length * share);
    const slice = text.slice(cursor, cursor + sliceLength);
    cursor += sliceLength;

    if (slice.length < 2000) return chapter; // too little text to quiz fairly
    return {
      ...chapter,
      quiz: generateQuiz(slice),
      summary: chapter.summary || extractiveSummary(slice),
    };
  });

  return { ...book, chapters };
}
