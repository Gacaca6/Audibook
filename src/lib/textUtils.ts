// Text helpers shared by the parser, quiz generator, and TTS engines.

const ABBREVIATIONS = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|Fig|No|Vol|Ch)\.$/;

/** Split text into sentences, tolerant of abbreviations and quotes. */
export function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z0-9])/);
  // Re-join pieces that were split after an abbreviation
  const sentences: string[] = [];
  for (const part of parts) {
    const prev = sentences[sentences.length - 1];
    if (prev && ABBREVIATIONS.test(prev.trim())) {
      sentences[sentences.length - 1] = prev + " " + part;
    } else if (part.trim()) {
      sentences.push(part.trim());
    }
  }
  return sentences;
}

/** Group sentences into chunks of roughly `maxChars` (never splitting a sentence). */
export function chunkSentences(text: string, maxChars: number): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current && current.length + s.length + 1 > maxChars) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? current + " " + s : s;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

const STOPWORDS = new Set(
  "the a an and or but if then else when while for nor so yet of in on at by to from with about into over after under between out against during without before behind beyond above below off up down is are was were be been being am do does did doing have has had having will would shall should may might must can could not no yes this that these those there here it its it's he she they them his her their our your my we you i who whom whose which what where why how all any both each few more most other some such only own same than too very just also as because until again once".split(
    " "
  )
);

/** Extract meaningful (non-stopword) words from text. */
export function contentWords(text: string, minLength = 5): string[] {
  const words = text.match(/[A-Za-z][A-Za-z'-]+/g) || [];
  return words.filter((w) => w.length >= minLength && !STOPWORDS.has(w.toLowerCase()));
}

/** Count total words in a text. */
export function countWords(text: string): number {
  return (text.match(/\S+/g) || []).length;
}

/**
 * Extractive summary: score sentences by how many of the chapter's most
 * frequent content words they contain, return the best early sentence.
 */
export function extractiveSummary(text: string, maxSentences = 2): string {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences.join(" ");

  const freq = new Map<string, number>();
  for (const w of contentWords(text, 4)) {
    const key = w.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  const scored = sentences.map((s, idx) => {
    const words = contentWords(s, 4);
    if (words.length === 0) return { idx, s, score: 0 };
    const score =
      words.reduce((sum, w) => sum + (freq.get(w.toLowerCase()) || 0), 0) / Math.sqrt(words.length);
    // Prefer earlier sentences slightly (openings usually set the scene)
    const positionBonus = 1 - (idx / sentences.length) * 0.3;
    return { idx, s, score: score * positionBonus };
  });

  const top = scored
    .filter(({ s }) => s.length > 30 && s.length < 300)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx);

  const result = (top.length > 0 ? top : scored.slice(0, maxSentences)).map(({ s }) => s).join(" ");
  return result.length > 320 ? result.slice(0, 317) + "..." : result;
}

/** Estimated narration duration in seconds (~150 words per minute). */
export function estimateDuration(text: string): number {
  return Math.round(countWords(text) * 0.4);
}
