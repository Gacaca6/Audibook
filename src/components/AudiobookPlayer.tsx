import { useState, useEffect, useRef } from "react";
import { Book, Chapter } from "../types";
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw, Check, Sparkles, HelpCircle } from "lucide-react";
import { motion } from "motion/react";
import AubiMascot from "./AubiMascot";
import { SpeechReader } from "../lib/speech";
import { hqVoice, HqVoiceManager } from "../lib/hqVoice";
import * as db from "../lib/db";

interface AudiobookPlayerProps {
  book: Book;
  onBack: () => void;
  onOpenQuiz: (chapter: Chapter) => void;
  completedQuizzes: string[]; // bookId-chapterId
  onUpdateXP: (xp: number) => void;
  onUpdateBook: (book: Book) => void;
}

export default function AudiobookPlayer({
  book,
  onBack,
  onOpenQuiz,
  completedQuizzes,
  onUpdateXP,
  onUpdateBook,
}: AudiobookPlayerProps) {
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // HQ audio state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [modelPercent, setModelPercent] = useState(0);
  const [modelState, setModelState] = useState(hqVoice.modelState);
  const [genPercent, setGenPercent] = useState<Record<number, number>>({});

  const currentChapter = book.chapters[activeChapterIndex] || book.chapters[0];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRef = useRef<SpeechReader | null>(null);
  const bookRef = useRef(book);
  bookRef.current = book;

  const bookChapterKey = `${book.id}-${currentChapter.id}`;
  const isQuizCompleted = completedQuizzes.includes(bookChapterKey);
  const isGenerating = genPercent[currentChapter.id] !== undefined;
  const hasHqAudio = !!audioUrl;

  // Wire up HQ voice manager events (singleton — the player is its only consumer)
  useEffect(() => {
    hqVoice.onModelChange = (state, percent) => {
      setModelState(state);
      setModelPercent(percent);
    };
    hqVoice.onJobProgress = (job, percent) => {
      if (job.bookId === bookRef.current.id) {
        setGenPercent((prev) => ({ ...prev, [job.chapterId]: percent }));
      }
    };
    hqVoice.onJobDone = (job, durationSec) => {
      if (job.bookId !== bookRef.current.id) return;
      setGenPercent((prev) => {
        const next = { ...prev };
        delete next[job.chapterId];
        return next;
      });
      // Persist the chapter's new HQ status
      const updated: Book = {
        ...bookRef.current,
        chapters: bookRef.current.chapters.map((ch) =>
          ch.id === job.chapterId ? { ...ch, hqAudio: "ready" as const, duration: durationSec } : ch
        ),
      };
      onUpdateBook(updated);
      onUpdateXP(15); // reward for preparing offline listening
    };
    hqVoice.onJobError = (job, error) => {
      if (job.bookId !== bookRef.current.id) return;
      setGenPercent((prev) => {
        const next = { ...prev };
        delete next[job.chapterId];
        return next;
      });
      alert(`HQ voice generation failed: ${error}`);
    };
    return () => {
      hqVoice.onModelChange = undefined;
      hqVoice.onJobProgress = undefined;
      hqVoice.onJobDone = undefined;
      hqVoice.onJobError = undefined;
    };
  }, [onUpdateBook, onUpdateXP]);

  // On chapter change: stop playback, load stored HQ audio, prep instant voice
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(currentChapter.duration || 30);

    let objectUrl: string | null = null;
    let cancelled = false;

    setAudioUrl(null);
    db.getAudio(book.id, currentChapter.id).then((blob) => {
      if (blob && !cancelled) {
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      }
    });

    speechRef.current?.dispose();
    const reader = new SpeechReader(currentChapter.text);
    reader.rate = playbackSpeed;
    reader.onProgress = (done, total) => {
      const estimated = currentChapter.duration || 30;
      setDuration(estimated);
      setCurrentTime((done / total) * estimated);
    };
    reader.onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onUpdateXP(10);
    };
    speechRef.current = reader;

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      audioRef.current?.pause();
      reader.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterIndex, book.id, currentChapter.hqAudio]);

  // Audio element listeners
  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && isFinite(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    onUpdateXP(10);
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (hasHqAudio) audioRef.current?.pause();
      else speechRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (hasHqAudio && audioRef.current) {
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            // Corrupt/unplayable stored audio: fall back to the instant voice
            speechRef.current?.play();
            setIsPlaying(true);
          });
      } else {
        if (!SpeechReader.isSupported()) {
          alert("This browser doesn't support speech synthesis. Generate HQ audio instead!");
          return;
        }
        speechRef.current?.play();
        setIsPlaying(true);
      }
    }
  };

  const skipTime = (amount: number) => {
    if (hasHqAudio && audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + amount));
      setCurrentTime(audioRef.current.currentTime);
    } else {
      speechRef.current?.skipChunks(amount > 0 ? 1 : -1);
    }
  };

  const handleSpeedChange = () => {
    const speeds = [0.8, 1, 1.25, 1.5];
    const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
    speechRef.current?.setRate(nextSpeed);
  };

  const startHqGeneration = () => {
    if (isGenerating || currentChapter.hqAudio === "ready") return;
    setGenPercent((prev) => ({ ...prev, [currentChapter.id]: 0 }));
    hqVoice.generateChapter(book.id, currentChapter.id, currentChapter.text);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const hqSupported = HqVoiceManager.isSupported();
  const isModelDownloading = modelState === "loading" && isGenerating;

  return (
    <div className="flex flex-col min-h-screen bg-[#F0F2F5] pb-28" id="player-screen">
      {/* Invisible HTML Audio tag (only used when HQ audio exists) */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleAudioEnded}
        />
      )}

      {/* Header (iOS style) */}
      <div className="bg-white border-b border-gray-100 pt-12 pb-4 px-4 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-1 font-sans font-black text-sm text-[#1CB0F6] border border-gray-200 rounded-xl px-3 py-1.5 bg-white active:bg-slate-50 active:scale-98 transition-all"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center max-w-[200px]">
          <h4 className="font-display font-black text-slate-800 text-xs tracking-tight line-clamp-1">
            {book.title}
          </h4>
          <p className="font-sans text-[10px] text-gray-400 mt-0.5 font-bold">
            Chapter {activeChapterIndex + 1} of {book.chaptersCount}
          </p>
        </div>

        {/* HQ Generation Button */}
        <button
          onClick={startHqGeneration}
          disabled={!hqSupported || hasHqAudio || isGenerating}
          className={`p-2 rounded-xl border transition-all ${
            hasHqAudio
              ? "bg-[#58CC02]/10 border-[#58CC02]/20 text-[#58CC02] cursor-default"
              : isGenerating
              ? "bg-white border-gray-200 text-cyan-600"
              : "bg-white border-gray-200 hover:border-cyan-400 text-cyan-600 active:scale-95"
          }`}
          title={hasHqAudio ? "HQ audio ready" : "Generate HQ audio"}
        >
          {isGenerating ? (
            <span className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin block" />
          ) : hasHqAudio ? (
            <Check className="w-4 h-4 text-[#58CC02]" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Main Scrollable Shell */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28 flex flex-col gap-6">
        {/* Animated Mascot Visualizer Card */}
        <div className="bg-white border border-gray-200 rounded-[2rem] p-5 shadow-sm text-center flex flex-col items-center">
          <AubiMascot mood={isPlaying ? "listening" : "happy"} className="w-40 h-40" />

          {/* Voice mode indicator */}
          <div className="mt-2.5">
            {hasHqAudio ? (
              <span className="bg-[#58CC02]/15 border border-[#58CC02]/20 text-[#58CC02] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                Aubi HD Voice • Saved Offline
              </span>
            ) : (
              <span className="bg-[#E1F5FE] border border-[#1CB0F6]/20 text-[#1CB0F6] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                Instant Device Voice
              </span>
            )}
          </div>

          {/* HQ upgrade card */}
          {!hasHqAudio && hqSupported && (
            <div className="w-full mt-4">
              {isGenerating ? (
                <div className="bg-cyan-50/60 border border-cyan-200/60 rounded-2xl p-3.5 text-left">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-sans font-black text-cyan-700 text-[11px] uppercase tracking-wide">
                      {isModelDownloading
                        ? `Downloading HQ voice (one-time) ${modelPercent}%`
                        : `Aubi is recording... ${genPercent[currentChapter.id] || 0}%`}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-cyan-100">
                    <motion.div
                      className="h-full bg-cyan-500 rounded-full"
                      animate={{
                        width: `${isModelDownloading ? modelPercent : genPercent[currentChapter.id] || 0}%`,
                      }}
                      transition={{ ease: "easeOut", duration: 0.3 }}
                    />
                  </div>
                  <p className="font-sans text-[10px] text-cyan-600 font-bold mt-2">
                    Keep this tab open — you can keep listening with the instant voice meanwhile!
                  </p>
                </div>
              ) : (
                <button
                  onClick={startHqGeneration}
                  className="w-full py-3 bg-[#1CB0F6] hover:bg-[#1899d6] border-b-4 border-[#1899d6] active:border-b-0 active:translate-y-[4px] text-white rounded-2xl font-sans font-black text-xs tracking-wide transition-all"
                >
                  ✨ Generate HQ Audio for this Chapter (free)
                </button>
              )}
              {modelState === "idle" && !isGenerating && (
                <p className="font-sans text-[10px] text-slate-400 font-bold mt-2">
                  First time only: downloads the free HQ voice (~90MB) to your device.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Chapters Horizontal Picker */}
        <div className="flex flex-col gap-2">
          <span className="font-sans font-black text-[10px] text-gray-400 tracking-wider uppercase px-1">
            CHAPTER SELECTOR
          </span>
          <div className="flex gap-2 overflow-x-auto pb-1.5 snap-x scrollbar-none">
            {book.chapters.map((ch, idx) => (
              <button
                key={ch.id}
                onClick={() => setActiveChapterIndex(idx)}
                className={`snap-start px-4.5 py-3 rounded-2xl font-sans font-black text-xs shrink-0 transition-all border-2 ${
                  idx === activeChapterIndex
                    ? "bg-[#58CC02] border-[#46A302] text-white shadow-sm"
                    : "bg-white border-gray-200 text-slate-600 active:bg-slate-50 font-bold"
                }`}
              >
                {ch.hqAudio === "ready" && "🎧 "}
                Ch {ch.id}: {ch.title.length > 15 ? ch.title.slice(0, 15) + "..." : ch.title}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Take-away Box */}
        <div className="bg-[#E1F5FE]/60 border border-[#1CB0F6]/20 rounded-2xl p-4 flex gap-3 items-start relative overflow-hidden">
          <div className="bg-[#1CB0F6] text-white p-2 rounded-xl text-xs font-black animate-pulse">
            💡
          </div>
          <div>
            <h5 className="font-display font-black text-[#1CB0F6] text-xs uppercase tracking-wider">Aubi's Summary Key</h5>
            <p className="font-sans text-xs text-slate-700 font-bold mt-1 leading-relaxed">
              "{currentChapter.summary}"
            </p>
          </div>
        </div>

        {/* Chapter Read-Along Text Block */}
        <div className="flex flex-col gap-2.5">
          <span className="font-sans font-black text-[10px] text-gray-400 tracking-wider uppercase px-1">
            READ ALONG & STUDY
          </span>
          <div className="bg-white border border-gray-200 rounded-[2rem] p-5 shadow-sm min-h-[150px] max-h-[400px] overflow-y-auto">
            <p className="font-sans text-sm text-slate-700 leading-relaxed text-left selection:bg-[#58CC02]/20 font-bold whitespace-pre-line">
              {currentChapter.text}
            </p>
          </div>
        </div>
      </div>

      {/* Floating Bottom Media Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 px-5 pt-4 pb-6 z-10 flex flex-col gap-3">
        {/* Progress Bar & Durations */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] font-black text-gray-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div
            className="w-full h-2 bg-gray-100 rounded-full relative overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (!hasHqAudio) return; // seeking needs a real audio file
              const rect = e.currentTarget.getBoundingClientRect();
              const newRatio = (e.clientX - rect.left) / rect.width;
              if (audioRef.current) {
                audioRef.current.currentTime = newRatio * duration;
                setCurrentTime(audioRef.current.currentTime);
              }
            }}
          >
            <div
              className="h-full bg-[#58CC02] rounded-full"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Media Control Buttons */}
        <div className="flex justify-between items-center">
          {/* Speed Controller */}
          <button
            onClick={handleSpeedChange}
            className="font-sans font-black text-xs text-gray-500 border border-gray-200 rounded-xl px-3 py-2 bg-white active:bg-slate-50 active:scale-95 transition-all"
          >
            {playbackSpeed}x Speed
          </button>

          {/* Play controls group */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => skipTime(-10)}
              className="p-3 text-slate-600 hover:text-slate-800 bg-gray-100 rounded-full active:scale-90 transition-all border border-gray-200/50"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              className={`p-5 rounded-full text-white shadow-md active:translate-y-[2px] transition-all ${
                isPlaying
                  ? "bg-[#1A1A1A] hover:bg-slate-800"
                  : "bg-[#58CC02] hover:bg-[#46A302]"
              }`}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
            </button>

            <button
              onClick={() => skipTime(10)}
              className="p-3 text-slate-600 hover:text-slate-800 bg-gray-100 rounded-full active:scale-90 transition-all border border-gray-200/50"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {/* Gamified Quiz Button launcher */}
          <button
            onClick={() => onOpenQuiz(currentChapter)}
            disabled={currentChapter.quiz.length === 0}
            className={`flex items-center gap-1 font-sans font-black text-xs px-4 py-2.5 rounded-xl border-b-4 transition-all active:border-b-0 active:translate-y-[4px] ${
              isQuizCompleted || currentChapter.quiz.length === 0
                ? "bg-gray-100 text-gray-400 border-gray-300 animate-none"
                : "bg-[#FF9600] text-white border-orange-700 hover:bg-orange-600 animate-pulse"
            }`}
          >
            {isQuizCompleted ? (
              <>
                <Check className="w-4 h-4" /> Quiz Clear
              </>
            ) : (
              <>
                <HelpCircle className="w-4 h-4 animate-bounce" /> Take Quiz
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
