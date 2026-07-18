import { Play, Pause, X } from "lucide-react";
import { motion } from "motion/react";
import { audioPlayer, useAudioPlayer } from "../lib/audioPlayer";
import BookCover from "./BookCover";

interface MiniPlayerProps {
  onOpen: (bookId: string, chapterIndex: number) => void;
}

/**
 * Persistent playback bar shown while an audiobook plays and the full player
 * is closed. Pause/resume from anywhere; tap to jump back into the book.
 */
export default function MiniPlayer({ onOpen }: MiniPlayerProps) {
  const { nowPlaying, isPlaying, currentTime, duration } = useAudioPlayer();
  if (!nowPlaying) return null;

  const chapter = nowPlaying.book.chapters[nowPlaying.chapterIndex];
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-[76px] inset-x-0 mx-auto max-w-[412px] z-20 px-3 pb-safe-nav"
      id="mini-player"
    >
      <div
        className="bg-[#1A1A1A] rounded-2xl shadow-lg overflow-hidden cursor-pointer"
        onClick={() => onOpen(nowPlaying.book.id, nowPlaying.chapterIndex)}
      >
        {/* Progress hairline */}
        <div className="h-0.5 bg-white/10">
          <div className="h-full bg-[#58CC02] transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex items-center gap-3 p-2.5">
          <BookCover book={nowPlaying.book} className="w-9 h-9 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-sans font-black text-white text-xs line-clamp-1">{nowPlaying.book.title}</p>
            <p className="font-sans font-bold text-white/50 text-[10px] line-clamp-1">
              {chapter?.title || `Chapter ${nowPlaying.chapterIndex + 1}`}
            </p>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              audioPlayer.toggle();
            }}
            className="p-2.5 bg-[#58CC02] rounded-xl text-white active:scale-90 transition-all shrink-0"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              audioPlayer.stop();
            }}
            className="p-2 text-white/40 active:text-white/70 shrink-0"
            title="Stop playback"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
