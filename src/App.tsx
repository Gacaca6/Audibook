import { useState, useEffect, useRef } from "react";
import { Book, Chapter, UserProfile, Achievement } from "./types";
import Dashboard from "./components/Dashboard";
import AudiobookPlayer from "./components/AudiobookPlayer";
import QuizModal from "./components/QuizModal";
import { motion, AnimatePresence } from "motion/react";
import * as db from "./lib/db";
import { sampleBook } from "./data/sampleBook";

// Default initial achievements
const initialAchievements: Achievement[] = [
  {
    id: "first-listen",
    title: "Starter Listener",
    description: "Listen to your first audiobook chapter and gain focus.",
    icon: "🎧",
    targetValue: 1,
    currentValue: 0,
    unlocked: false,
  },
  {
    id: "quiz-master",
    title: "Quiz Whiz",
    description: "Clear a chapter comprehension quiz with flying colors.",
    icon: "🎓",
    targetValue: 1,
    currentValue: 0,
    unlocked: false,
  },
  {
    id: "xp-scholar",
    title: "XP Scholar",
    description: "Reach 200 cumulative experience points in your library.",
    icon: "👑",
    targetValue: 200,
    currentValue: 0,
    unlocked: false,
  },
  {
    id: "perfect-score",
    title: "Perfect Score",
    description: "Get a perfect 3/3 score on any chapter quiz.",
    icon: "🎯",
    targetValue: 1,
    currentValue: 0,
    unlocked: false,
  },
  {
    id: "shelf-builder",
    title: "Shelf Builder",
    description: "Turn one of your own books into an audiobook.",
    icon: "📚",
    targetValue: 1,
    currentValue: 0,
    unlocked: false,
  }
];

/** Keep earned progress when the achievement list itself changes between versions. */
function mergeAchievements(stored: unknown): Achievement[] {
  if (!Array.isArray(stored)) return initialAchievements;
  return initialAchievements.map((base) => {
    const prev = stored.find((a: Achievement) => a?.id === base.id);
    return prev ? { ...base, currentValue: prev.currentValue ?? 0, unlocked: !!prev.unlocked } : base;
  });
}

export default function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [activeQuizChapter, setActiveQuizChapter] = useState<Chapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize and persist user profile in localStorage
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const stored = localStorage.getItem("aubi_profile_v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.achievements = mergeAchievements(parsed.achievements);
        return parsed;
      }
    } catch (e) {
      console.error("Failed to parse user profile from localStorage", e);
    }

    return {
      xp: 0,
      streak: 1,
      lastActiveDate: new Date().toDateString(),
      unlockedChapters: [],
      completedQuizzes: [],
      achievements: initialAchievements,
    };
  });

  // Sync profile changes to localStorage
  useEffect(() => {
    localStorage.setItem("aubi_profile_v1", JSON.stringify(userProfile));
  }, [userProfile]);

  // Load books list on startup
  useEffect(() => {
    fetchBooks();
    checkStreakOnLaunch();
  }, []);

  // Hand off from the static splash (index.html) once the library is ready,
  // holding it long enough for the intro animation to actually land.
  useEffect(() => {
    if (isLoading) return;
    const splash = document.getElementById("splash");
    if (!splash) return;

    const shownAt = Number(splash.dataset.shownAt || Date.now());
    const remaining = Math.max(0, 2100 - (Date.now() - shownAt));

    const timer = setTimeout(() => {
      splash.classList.add("splash-out");
      setTimeout(() => splash.remove(), 650);
    }, remaining);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const fetchBooks = async () => {
    try {
      setIsLoading(true);
      let stored = await db.getAllBooks();
      // First launch: seed the starter audiobook
      if (stored.length === 0) {
        await db.saveBook(sampleBook);
        stored = [sampleBook];
      }
      stored.sort((a, b) => (a.uploadDate < b.uploadDate ? 1 : -1));
      setBooks(stored);
    } catch (err) {
      console.error("Failed to load books from storage:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Check and increment daily streak on startup
  const checkStreakOnLaunch = () => {
    const today = new Date().toDateString();
    const lastActive = userProfile.lastActiveDate;

    if (today !== lastActive) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      setUserProfile((prev) => {
        let newStreak = prev.streak;
        if (lastActive === yesterday.toDateString()) {
          newStreak += 1;
        } else {
          // If break of streak, reset to 1
          newStreak = 1;
        }

        return {
          ...prev,
          streak: newStreak,
          lastActiveDate: today,
        };
      });
    }
  };

  // XP progression and achievement unlocks. `kind` ties trophies to the
  // action that actually earns them (not just any XP gain).
  const handleUpdateXP = (xpGained: number, kind: "listen" | "add-book" | "general" = "general") => {
    setUserProfile((prev) => {
      const nextXP = prev.xp + xpGained;

      const updatedAchievements = prev.achievements.map((ach) => {
        if (ach.unlocked) return ach;

        let currentValue = ach.currentValue;
        if (ach.id === "xp-scholar") {
          currentValue = nextXP;
        } else if (ach.id === "first-listen" && kind === "listen") {
          currentValue = 1;
        } else if (ach.id === "shelf-builder" && kind === "add-book") {
          currentValue = 1;
        }

        return { ...ach, currentValue, unlocked: currentValue >= ach.targetValue };
      });

      return {
        ...prev,
        xp: nextXP,
        achievements: updatedAchievements,
      };
    });
  };

  // Display toast notification when achievements unlock (watches state so the
  // profile updaters above stay pure)
  const [toastText, setToastText] = useState<string | null>(null);
  const seenUnlocksRef = useRef<Set<string>>(
    new Set(userProfile.achievements.filter((a) => a.unlocked).map((a) => a.id))
  );
  useEffect(() => {
    for (const ach of userProfile.achievements) {
      if (ach.unlocked && !seenUnlocksRef.current.has(ach.id)) {
        seenUnlocksRef.current.add(ach.id);
        setToastText(`🏆 Trophy Unlocked: "${ach.title}"! ${ach.icon}`);
        const timer = setTimeout(() => setToastText(null), 4500);
        return () => clearTimeout(timer);
      }
    }
  }, [userProfile.achievements]);

  // Delete a book (and its stored HQ audio)
  const handleDeleteBook = async (bookId: string) => {
    try {
      await db.deleteBook(bookId);
    } catch (err) {
      console.error("Failed to delete book from storage:", err);
    }
    setBooks((prev) => prev.filter((b) => b.id !== bookId));
    if (selectedBook?.id === bookId) {
      setSelectedBook(null);
    }
  };

  // A newly added book landed on the shelf
  const handleBookAdded = () => {
    fetchBooks();
    handleUpdateXP(25, "add-book");
  };

  // An audiobook fetched from the free library (already saved to IndexedDB)
  const handleBookFetched = (book: Book) => {
    setBooks((prev) => [book, ...prev.filter((b) => b.id !== book.id)]);
    handleUpdateXP(25, "add-book");
  };

  // Persist chapter updates (e.g. a chapter downloaded for offline) from the player
  const handleUpdateBook = async (updated: Book) => {
    setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelectedBook((prev) => (prev?.id === updated.id ? updated : prev));
    try {
      await db.saveBook(updated);
    } catch (err) {
      console.error("Failed to persist book update:", err);
    }
  };

  // Select audiobook to listen
  const handleSelectBook = (book: Book) => {
    setSelectedBook(book);
    // Track achievement
    handleUpdateXP(5); // listening enter reward
  };

  // Complete chapter quiz and award XP
  const handleCompleteQuiz = (xpEarned: number) => {
    if (!activeQuizChapter || !selectedBook) return;

    const key = `${selectedBook.id}-${activeQuizChapter.id}`;

    setUserProfile((prev) => {
      const isAlreadyCompleted = prev.completedQuizzes.includes(key);
      const nextCompleted = isAlreadyCompleted ? prev.completedQuizzes : [...prev.completedQuizzes, key];

      // Mark quiz achievements (kept pure — the toast effect reacts to unlocks)
      const updatedAchievements = prev.achievements.map((ach) => {
        if (ach.unlocked) return ach;

        let currentValue = ach.currentValue;
        if (ach.id === "quiz-master") {
          currentValue = nextCompleted.length;
        } else if (ach.id === "perfect-score" && xpEarned >= 60) {
          currentValue = 1;
        }

        return { ...ach, currentValue, unlocked: currentValue >= ach.targetValue };
      });

      return {
        ...prev,
        completedQuizzes: nextCompleted,
        achievements: updatedAchievements,
      };
    });

    handleUpdateXP(xpEarned);
    setActiveQuizChapter(null);
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] md:py-8 flex items-center justify-center font-sans overflow-x-hidden select-none">
      {/* 📱 Real iPhone 15 Pro simulated device wrapper for desktops, collapses on mobile */}
      <div
        className="w-full md:max-w-[412px] md:h-[840px] md:rounded-[50px] bg-[#F0F2F5] md:shadow-2xl md:border-[12px] md:border-slate-800 md:relative md:overflow-hidden flex flex-col justify-between"
        id="iphone-wrapper"
      >
        {/* iOS Native Status Bar (Mocked inside container for immersive look) */}
        <div className="hidden md:flex absolute top-0 left-0 w-full h-[40px] bg-white px-8 justify-between items-center z-30 select-none pointer-events-none border-b border-gray-100">
          <span className="text-[11px] font-bold text-slate-800 font-sans tracking-wide">9:41</span>
          {/* Simulated Dynamic Island Speaker pill */}
          <div className="w-24 h-4.5 bg-black rounded-full mx-auto" />
          <div className="flex gap-1 items-center">
            {/* Battery & Signal */}
            <span className="text-[10px] font-extrabold text-slate-800">5G</span>
            <div className="w-4.5 h-2.5 border border-slate-800 rounded-sm p-[1px] flex items-center">
              <div className="bg-slate-800 h-full w-[80%] rounded-2xs" />
            </div>
          </div>
        </div>

        {/* Floating Trophys Unlock Banner (Toast) */}
        <AnimatePresence>
          {toastText && (
            <motion.div
              initial={{ opacity: 0, y: -40, scale: 0.9 }}
              animate={{ opacity: 1, y: 15, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="absolute top-safe left-4 right-4 bg-[#FF9600] border-2 border-orange-500 rounded-2xl p-3.5 flex items-center gap-3 shadow-lg z-40 text-white"
            >
              <div className="bg-white p-2 rounded-xl text-lg shadow-sm">🏆</div>
              <div className="text-left">
                <h5 className="font-sans font-extrabold text-orange-950 text-xs uppercase tracking-wide">Quest Mastery!</h5>
                <p className="font-sans font-bold text-white text-xs">{toastText}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Screen View Changer */}
        <div className="flex-1 flex flex-col h-full bg-[#F0F2F5] md:pt-10 overflow-y-auto">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 border-4 border-[#58CC02] border-t-transparent rounded-full animate-spin mb-4" />
              <h4 className="font-sans font-black text-slate-700 text-sm">Warming up vocal cords...</h4>
            </div>
          ) : (
            /* Entrance-only animations: navigation must never wait on an exit
               animation (throttled rAF in background tabs can stall it) */
            <>
              {selectedBook ? (
                /* 1. AUDIOBOOK PLAYER SCREEN */
                <motion.div
                  key="player"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex-1 flex flex-col h-full bg-[#F0F2F5]"
                >
                  <AudiobookPlayer
                    book={selectedBook}
                    onBack={() => setSelectedBook(null)}
                    onOpenQuiz={(ch) => setActiveQuizChapter(ch)}
                    completedQuizzes={userProfile.completedQuizzes}
                    onUpdateXP={handleUpdateXP}
                    onUpdateBook={handleUpdateBook}
                  />
                </motion.div>
              ) : (
                /* 2. DASHBOARD VIEW (SHELF & REWARDS) */
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 pt-4 bg-[#F0F2F5]"
                >
                  <Dashboard
                    books={books}
                    userProfile={userProfile}
                    selectedBook={selectedBook}
                    onSelectBook={handleSelectBook}
                    onRefreshBooks={handleBookAdded}
                    onBookFetched={handleBookFetched}
                    onDeleteBook={handleDeleteBook}
                    onUpdateXP={handleUpdateXP}
                  />
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* 3. GAMIFIED COMPREHENSION QUIZ MODAL */}
        <AnimatePresence>
          {activeQuizChapter && (
            <QuizModal
              chapter={activeQuizChapter}
              onClose={() => setActiveQuizChapter(null)}
              onCompleteQuiz={handleCompleteQuiz}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
