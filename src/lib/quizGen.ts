import { QuizQuestion } from "../types";
import { splitSentences, contentWords } from "./textUtils";

// Generates listening-comprehension quizzes with zero AI: pick informative
// sentences spread across the chapter, blank out a key word (cloze deletion),
// and offer distractor words drawn from elsewhere in the same chapter.

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Candidate {
  sentence: string;
  keyword: string;
}

export function generateQuiz(text: string, questionCount = 3): QuizQuestion[] {
  const sentences = splitSentences(text);

  // Candidate sentences: informative length, contains a strong keyword
  const candidates: Candidate[] = [];
  for (const s of sentences) {
    const wordCount = (s.match(/\S+/g) || []).length;
    if (wordCount < 8 || wordCount > 40) continue;
    const keywords = contentWords(s, 5);
    if (keywords.length === 0) continue;
    // Keyword: the longest content word — usually the most distinctive
    const keyword = keywords.sort((a, b) => b.length - a.length)[0];
    candidates.push({ sentence: s, keyword });
  }

  if (candidates.length === 0) return [];

  // Spread picks across the chapter (start / middle / end)
  const picks: Candidate[] = [];
  const step = candidates.length / Math.min(questionCount, candidates.length);
  for (let i = 0; i < Math.min(questionCount, candidates.length); i++) {
    picks.push(candidates[Math.floor(i * step)]);
  }

  // Pool of distractor words from the whole chapter
  const pool = Array.from(new Set(contentWords(text, 5).map((w) => w)));

  return picks.map(({ sentence, keyword }) => {
    const distractors = shuffle(
      pool.filter(
        (w) =>
          w.toLowerCase() !== keyword.toLowerCase() &&
          Math.abs(w.length - keyword.length) <= 4
      )
    ).slice(0, 3);

    // Pad in the unlikely case the chapter has too few unique words
    while (distractors.length < 3) {
      distractors.push(["story", "moment", "journey"][distractors.length]);
    }

    const options = shuffle([keyword, ...distractors]);
    const correctOptionIndex = options.indexOf(keyword);

    const blanked = sentence.replace(
      new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
      "_____"
    );

    return {
      question: `Which word completes this line from the chapter?\n“${blanked}”`,
      options,
      correctOptionIndex,
      explanation: `The chapter says: “${sentence}” — great listening pays off!`,
    };
  });
}
