export interface QuizQuestion {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface Chapter {
  id: number;
  title: string;
  text: string; // chapter text for TTS narration + read-along ("" for real audiobooks)
  duration: number; // seconds (estimated for TTS, real for audio files)
  summary: string; // bite-sized key take-away
  quiz: QuizQuestion[];
  /** Real narrated MP3 (LibriVox/archive.org). When set, the chapter streams
      this instead of using the device voice. */
  audioUrl?: string;
  audioSizeMB?: number;
  /** MP3 blob saved to IndexedDB for offline listening. */
  downloaded?: boolean;
}

export type BookSource = "upload" | "librivox";

export interface Book {
  id: string;
  title: string;
  author: string;
  fileName: string;
  uploadDate: string;
  chaptersCount: number;
  totalWords: number;
  status: "processing" | "ready" | "error";
  chapters: Chapter[];
  xpReward: number;
  source?: BookSource; // undefined on older records = "upload"
  coverUrl?: string;
  description?: string;
  runtime?: string; // e.g. "10:23:00" for real audiobooks
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  targetValue: number;
  currentValue: number;
  unlocked: boolean;
}

export interface UserProfile {
  xp: number;
  streak: number;
  lastActiveDate: string;
  unlockedChapters: string[]; // "bookId-chapterId"
  completedQuizzes: string[]; // "bookId-chapterId"
  achievements: Achievement[];
}

/** Progress reported while a book file is being parsed into chapters. */
export interface ParseProgress {
  stage: "reading" | "extracting" | "chapters" | "quizzes";
  percent: number; // 0-100
}
