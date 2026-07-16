export interface QuizQuestion {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface Chapter {
  id: number;
  title: string;
  text: string;
  duration: number; // estimated seconds at ~150 wpm narration
  summary: string; // bite-sized key take-away
  quiz: QuizQuestion[];
}

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
