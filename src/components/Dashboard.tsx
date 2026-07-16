import { useState, useEffect } from "react";
import { Book, UserProfile } from "../types";
import { BookOpen, Trophy, Flame, Sparkles, CheckCircle, Wifi, WifiOff, Trash2, Headphones } from "lucide-react";
import { motion } from "motion/react";
import BookUploader from "./BookUploader";
import AudiMascot from "./AudiMascot";

interface DashboardProps {
  books: Book[];
  userProfile: UserProfile;
  selectedBook: Book | null;
  onSelectBook: (book: Book) => void;
  onRefreshBooks: () => void;
  onDeleteBook: (id: string) => void;
  onUpdateXP: (xpGained: number) => void;
}

export default function Dashboard({
  books,
  userProfile,
  onSelectBook,
  onRefreshBooks,
  onDeleteBook,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"books" | "achievements">("books");
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor network status to show cute status badges
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="flex flex-col gap-5 px-4 pb-24" id="dashboard-container">
      {/* Gamified Header Stats (Duolingo Style) */}
      <div className="bg-white border border-gray-200 rounded-[2rem] p-4 flex justify-between items-center shadow-sm relative">
        <div className="flex items-center gap-2">
          <AudiMascot mood="happy" className="w-12 h-12" />
          <div>
            <h4 className="font-display font-black text-slate-800 text-sm leading-none">Audibook</h4>
            <p className="font-sans text-[10px] text-slate-400 mt-0.5 font-bold">Your Speech Companion</p>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2">
          {/* Flame Streak */}
          <div className="flex items-center gap-1 bg-[#FF9600] border-b-4 border-black/10 px-2.5 py-1.5 rounded-2xl text-white">
            <Flame className="w-4 h-4 text-white fill-white animate-pulse" />
            <span className="font-sans font-black text-xs">{userProfile.streak}d</span>
          </div>

          {/* XP Crown */}
          <div className="flex items-center gap-1 bg-[#E1F5FE] border-b-4 border-[#1CB0F6]/20 px-2.5 py-1.5 rounded-2xl text-[#1CB0F6]">
            <Sparkles className="w-4 h-4 text-[#1CB0F6] fill-[#1CB0F6]" />
            <span className="font-sans font-black text-xs">{userProfile.xp}</span>
          </div>

          {/* Online/Offline Badge */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-2xl text-[10px] font-black border-b-4 transition-colors ${
              isOnline
                ? "bg-[#58CC02] border-[#46A302] text-white"
                : "bg-amber-400 border-amber-600 text-white animate-pulse"
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isOnline ? "Live" : "Offline"}</span>
          </div>
        </div>
      </div>

      {/* Segmented Control / Tabs */}
      <div className="bg-white p-1.5 rounded-3xl flex gap-2 border border-gray-200 shadow-sm">
        <button
          onClick={() => setActiveTab("books")}
          className={`flex-1 py-3 text-center rounded-2xl font-sans font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "books" ? "bg-[#E1F5FE] text-[#1CB0F6] border-b-4 border-[#1CB0F6]/20" : "text-gray-400 hover:bg-gray-50 font-bold"
          }`}
        >
          <BookOpen className="w-4 h-4" /> My Books
        </button>
        <button
          onClick={() => setActiveTab("achievements")}
          className={`flex-1 py-3 text-center rounded-2xl font-sans font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "achievements" ? "bg-[#E1F5FE] text-[#1CB0F6] border-b-4 border-[#1CB0F6]/20" : "text-gray-400 hover:bg-gray-50 font-bold"
          }`}
        >
          <Trophy className="w-4 h-4" /> Trophies
        </button>
      </div>

      {/* Main Content Area */}
      <div className="min-h-[300px]">
        {activeTab === "books" ? (
          <div className="flex flex-col gap-4">
            {/* Drag & Drop uploader — works fully offline, books never leave the device */}
            <BookUploader onUploadSuccess={onRefreshBooks} />

            {/* Books Shelf List */}
            <div className="flex flex-col gap-3 mt-1">
              <h3 className="font-display font-black text-slate-800 text-sm tracking-wide uppercase px-1">
                Your Audiobooks Shelf ({books.length})
              </h3>

              {books.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-[2rem] p-8 text-center shadow-sm">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                  <p className="font-display font-black text-sm text-slate-500">No books found in your shelf!</p>
                  <p className="font-sans text-xs text-slate-400 mt-1 max-w-xs mx-auto font-bold">
                    Add an EPUB, PDF, or text file above to let Audi narrate and build quizzes for you!
                  </p>
                </div>
              ) : (
                books.map((book) => {
                  const isProcessing = book.status === "processing";
                  const isError = book.status === "error";

                  return (
                    <motion.div
                      key={book.id}
                      layoutId={`book-card-${book.id}`}
                      className={`bg-white border border-gray-200 rounded-[2rem] p-4.5 flex flex-col justify-between shadow-sm transition-all relative overflow-hidden ${
                        isProcessing
                          ? "animate-pulse"
                          : isError
                          ? "border-red-200 bg-red-50/20"
                          : "hover:border-[#58CC02] cursor-pointer"
                      }`}
                      onClick={() => !isProcessing && !isError && onSelectBook(book)}
                    >
                      {/* Processing Overlay Badge */}
                      {isProcessing && (
                        <div className="absolute top-0 left-0 bg-[#58CC02] h-1.5 w-full animate-pulse" />
                      )}

                      <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                          {/* Book cover graphic (Duolingo Style colorful avatar) */}
                          <div
                            className={`w-12 h-16 rounded-xl flex flex-col items-center justify-center text-white font-black relative shrink-0 shadow-sm ${
                              isProcessing
                                ? "bg-gray-200"
                                : isError
                                ? "bg-red-400"
                                : book.id === "audi-adventures"
                                ? "bg-gradient-to-br from-[#E1F5FE] to-[#1CB0F6]"
                                : "bg-gradient-to-br from-green-300 to-[#58CC02]"
                            }`}
                          >
                            <Headphones className="w-5 h-5 opacity-75 mb-1 text-white" />
                            <span className="font-mono text-[9px] uppercase tracking-wider text-white">
                              {book.chaptersCount || "..."} Ch
                            </span>
                          </div>

                          <div>
                            <h4 className="font-display font-black text-[#1A1A1A] text-sm tracking-tight leading-snug line-clamp-1">
                              {book.title}
                            </h4>
                            <p className="font-sans text-xs text-slate-400 mt-0.5 font-bold">By {book.author}</p>

                            <div className="flex gap-2.5 items-center mt-2.5 text-[10px] font-black">
                              {isProcessing ? (
                                <span className="text-[#58CC02] flex items-center gap-1 bg-[#58CC02]/10 px-2 py-0.5 rounded-lg border border-[#58CC02]/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#58CC02] animate-ping" />
                                  Writing Audiobook...
                                </span>
                              ) : isError ? (
                                <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                                  Conversion Failed
                                </span>
                              ) : (
                                <>
                                  <span className="text-slate-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-lg">
                                    {book.totalWords} words
                                  </span>
                                  <span className="text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-lg">
                                    +{book.xpReward} XP Gift
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Delete Button (Keep list tidy) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Remove "${book.title}" from your shelf?`)) {
                              onDeleteBook(book.id);
                            }
                          }}
                          className="text-gray-300 hover:text-red-500 p-1.5 rounded-xl hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Playback Progress Indicator */}
                      {!isProcessing && !isError && (
                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                          <span className="font-sans text-[10px] font-black text-gray-400">PLAYBACK STATUS</span>
                          <span className="text-[#58CC02] font-sans font-black text-xs flex items-center gap-1 bg-[#58CC02]/10 px-3 py-1 rounded-xl">
                            <CheckCircle className="w-4 h-4 text-[#58CC02] fill-[#58CC02]" /> Listen Now
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Achievements Board Tab */
          <div className="bg-white border border-gray-200 rounded-[2.5rem] p-5 shadow-sm flex flex-col gap-4">
            <div className="text-center pb-2 border-b border-gray-100">
              <h3 className="font-display font-black text-slate-800 text-base">Audi's Golden Trophies</h3>
              <p className="font-sans text-xs text-gray-400 mt-1 font-bold">Unlock badges by listening offline and answering quizzes!</p>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {userProfile.achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`border-2 rounded-3xl p-4 flex gap-3 items-center transition-all ${
                    ach.unlocked ? "border-yellow-300 bg-yellow-50/10" : "border-gray-100 bg-gray-50/50 opacity-70"
                  }`}
                >
                  {/* Badge Icon Shield */}
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                      ach.unlocked ? "bg-gradient-to-br from-yellow-300 to-yellow-500 text-white shadow-md animate-bounce" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {ach.icon}
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <h4 className={`font-sans font-black text-xs tracking-tight ${ach.unlocked ? "text-slate-800" : "text-gray-400"}`}>
                        {ach.title}
                      </h4>
                      {ach.unlocked && (
                        <span className="text-[9px] font-black text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Unlocked
                        </span>
                      )}
                    </div>
                    <p className="font-sans text-[10.5px] text-gray-400 mt-0.5 leading-tight font-bold">{ach.description}</p>

                    {/* Progress Bar for Achievement */}
                    <div className="flex items-center gap-2 mt-2.5">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ach.unlocked ? "bg-yellow-400" : "bg-gray-300"}`}
                          style={{ width: `${Math.min(100, (ach.currentValue / ach.targetValue) * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[9px] text-gray-400 font-bold">
                        {ach.currentValue}/{ach.targetValue}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
