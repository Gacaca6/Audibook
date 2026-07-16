import { useState, useEffect, useRef, useCallback } from "react";
import { Book, Chapter } from "../types";
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw, Check, HelpCircle, Mic2, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AudiMascot from "./AudiMascot";
import {
  SpeechReader,
  loadVoices,
  listVoiceOptions,
  getSavedVoiceId,
  saveVoiceId,
  VoiceOption,
} from "../lib/speech";

interface AudiobookPlayerProps {
  book: Book;
  onBack: () => void;
  onOpenQuiz: (chapter: Chapter) => void;
  completedQuizzes: string[]; // bookId-chapterId
  onUpdateXP: (xp: number, kind?: "listen" | "general") => void;
}

export default function AudiobookPlayer({
  book,
  onBack,
  onOpenQuiz,
  completedQuizzes,
  onUpdateXP,
}: AudiobookPlayerProps) {
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Read-along state
  const [chunks, setChunks] = useState<string[]>([]);
  const [activeChunk, setActiveChunk] = useState(0);

  // Voice state
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState<string | null>(getSavedVoiceId());
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  const currentChapter = book.chapters[activeChapterIndex] || book.chapters[0];
  const speechRef = useRef<SpeechReader | null>(null);
  const chunkRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const supported = SpeechReader.isSupported();

  const bookChapterKey = `${book.id}-${currentChapter.id}`;
  const isQuizCompleted = completedQuizzes.includes(bookChapterKey);

  // Resolve the device's voices once (Safari populates these asynchronously)
  useEffect(() => {
    let cancelled = false;
    loadVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      setVoiceOptions(listVoiceOptions(list));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveVoice = useCallback(
    (list: SpeechSynthesisVoice[], id: string | null): SpeechSynthesisVoice | null => {
      if (list.length === 0) return null;
      const saved = id ? list.find((v) => v.voiceURI === id) : null;
      if (saved) return saved;
      // No pick yet: use the best-ranked English voice on this device
      const best = listVoiceOptions(list)[0];
      return (best && list.find((v) => v.voiceURI === best.id)) || null;
    },
    []
  );

  // Build the reader for the active chapter
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveChunk(0);
    setError(null);
    const estimated = currentChapter.duration || 30;
    setDuration(estimated);

    speechRef.current?.dispose();

    if (!supported) {
      setChunks([currentChapter.text]);
      return;
    }

    const reader = new SpeechReader(currentChapter.text);
    reader.rate = playbackSpeed;
    reader.setVoice(resolveVoice(voices, voiceId));
    reader.onProgress = (done, total) => {
      setCurrentTime((done / total) * estimated);
    };
    reader.onChunkChange = (idx) => setActiveChunk(idx);
    reader.onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setActiveChunk(0);
      onUpdateXP(10, "listen");
    };
    reader.onError = (message) => {
      setIsPlaying(false);
      setError(message);
    };
    speechRef.current = reader;
    setChunks(reader.getChunks());
    chunkRefs.current = [];

    return () => {
      reader.dispose();
    };
    // playbackSpeed/voice changes are applied via their own effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterIndex, book.id, voices, voiceId, supported]);

  // Stop narration if the app is backgrounded or unmounted
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        speechRef.current?.pause();
        setIsPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Keep the highlighted sentence in view while listening
  useEffect(() => {
    if (!isPlaying) return;
    chunkRefs.current[activeChunk]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeChunk, isPlaying]);

  const togglePlay = () => {
    if (!supported) {
      setError("This browser can't narrate. Try Safari or Chrome.");
      return;
    }
    if (isPlaying) {
      speechRef.current?.pause();
      setIsPlaying(false);
    } else {
      setError(null);
      speechRef.current?.play(); // called straight from the tap: iOS requires this
      setIsPlaying(true);
    }
  };

  const skip = (chunksToMove: number) => {
    speechRef.current?.skipChunks(chunksToMove);
  };

  const handleSpeedChange = () => {
    const speeds = [0.8, 1, 1.25, 1.5];
    const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    speechRef.current?.setRate(nextSpeed);
  };

  const handlePickVoice = (option: VoiceOption) => {
    setVoiceId(option.id);
    saveVoiceId(option.id);
    setShowVoicePicker(false);
  };

  const jumpToChunk = (index: number) => {
    speechRef.current?.seekToChunk(index);
    setActiveChunk(index);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const activeVoice = resolveVoice(voices, voiceId);
  const activeVoiceName =
    voiceOptions.find((v) => v.id === activeVoice?.voiceURI)?.name || activeVoice?.name || "Device Voice";

  return (
    <div className="flex flex-col min-h-screen bg-[#F0F2F5] pb-28" id="player-screen">
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

        {/* Voice picker */}
        <button
          onClick={() => setShowVoicePicker(true)}
          disabled={voiceOptions.length === 0}
          className="p-2 rounded-xl border border-gray-200 bg-white text-[#1CB0F6] active:scale-95 transition-all disabled:opacity-40"
          title="Choose narrator voice"
        >
          <Mic2 className="w-4 h-4" />
        </button>
      </div>

      {/* Main Scrollable Shell */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28 flex flex-col gap-6">
        {/* Animated Mascot Visualizer Card */}
        <div className="bg-white border border-gray-200 rounded-[2rem] p-5 shadow-sm text-center flex flex-col items-center">
          <AudiMascot mood={isPlaying ? "listening" : "happy"} className="w-40 h-40" />

          <button
            onClick={() => setShowVoicePicker(true)}
            disabled={voiceOptions.length === 0}
            className="mt-2.5 bg-[#E1F5FE] border border-[#1CB0F6]/20 text-[#1CB0F6] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider active:scale-95 transition-all disabled:opacity-60"
          >
            🎙 {activeVoiceName} • Tap to change
          </button>

          <p className="font-sans text-[10px] text-slate-400 font-bold mt-2 max-w-[240px]">
            Narrated instantly by your device — free, private, and works offline.
          </p>

          {error && (
            <div className="mt-3 w-full bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2 text-left">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="font-sans text-[11px] text-amber-700 font-bold">{error}</p>
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
                Ch {ch.id}: {ch.title.length > 15 ? ch.title.slice(0, 15) + "..." : ch.title}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Take-away Box */}
        <div className="bg-[#E1F5FE]/60 border border-[#1CB0F6]/20 rounded-2xl p-4 flex gap-3 items-start relative overflow-hidden">
          <div className="bg-[#1CB0F6] text-white p-2 rounded-xl text-xs font-black">💡</div>
          <div>
            <h5 className="font-display font-black text-[#1CB0F6] text-xs uppercase tracking-wider">
              Audi's Summary Key
            </h5>
            <p className="font-sans text-xs text-slate-700 font-bold mt-1 leading-relaxed">
              "{currentChapter.summary}"
            </p>
          </div>
        </div>

        {/* Chapter Read-Along Text Block (tap any sentence to jump there) */}
        <div className="flex flex-col gap-2.5">
          <span className="font-sans font-black text-[10px] text-gray-400 tracking-wider uppercase px-1">
            READ ALONG — TAP ANY LINE TO JUMP
          </span>
          <div className="bg-white border border-gray-200 rounded-[2rem] p-5 shadow-sm min-h-[150px] max-h-[400px] overflow-y-auto">
            <p className="font-sans text-sm leading-relaxed text-left font-bold">
              {chunks.map((chunk, idx) => (
                <span
                  key={idx}
                  ref={(el) => {
                    chunkRefs.current[idx] = el;
                  }}
                  onClick={() => jumpToChunk(idx)}
                  className={`cursor-pointer transition-colors rounded px-0.5 ${
                    idx === activeChunk
                      ? "bg-[#58CC02]/20 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {chunk}{" "}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>

      {/* Floating Bottom Media Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 px-5 pt-4 pb-6 z-10 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] font-black text-gray-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>~{formatTime(duration)}</span>
          </div>

          <div className="w-full h-2 bg-gray-100 rounded-full relative overflow-hidden">
            <motion.div
              className="h-full bg-[#58CC02] rounded-full"
              animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              transition={{ ease: "linear", duration: 0.3 }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={handleSpeedChange}
            className="font-sans font-black text-xs text-gray-500 border border-gray-200 rounded-xl px-3 py-2 bg-white active:bg-slate-50 active:scale-95 transition-all"
          >
            {playbackSpeed}x Speed
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={() => skip(-1)}
              className="p-3 text-slate-600 bg-gray-100 rounded-full active:scale-90 transition-all border border-gray-200/50"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              className={`p-5 rounded-full text-white shadow-md active:translate-y-[2px] transition-all ${
                isPlaying ? "bg-[#1A1A1A]" : "bg-[#58CC02]"
              }`}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
            </button>

            <button
              onClick={() => skip(1)}
              className="p-3 text-slate-600 bg-gray-100 rounded-full active:scale-90 transition-all border border-gray-200/50"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => onOpenQuiz(currentChapter)}
            disabled={currentChapter.quiz.length === 0}
            className={`flex items-center gap-1 font-sans font-black text-xs px-4 py-2.5 rounded-xl border-b-4 transition-all active:border-b-0 active:translate-y-[4px] ${
              isQuizCompleted || currentChapter.quiz.length === 0
                ? "bg-gray-100 text-gray-400 border-gray-300"
                : "bg-[#FF9600] text-white border-orange-700"
            }`}
          >
            {isQuizCompleted ? (
              <>
                <Check className="w-4 h-4" /> Quiz Clear
              </>
            ) : (
              <>
                <HelpCircle className="w-4 h-4" /> Take Quiz
              </>
            )}
          </button>
        </div>
      </div>

      {/* Voice Picker Sheet */}
      <AnimatePresence>
        {showVoicePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={() => setShowVoicePicker(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-white w-full max-w-[412px] rounded-t-[2rem] p-5 max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-display font-black text-slate-800 text-base">Choose Your Narrator</h4>
                <button
                  onClick={() => setShowVoicePicker(false)}
                  className="p-2 rounded-xl bg-gray-100 text-slate-500 active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="font-sans text-[11px] text-slate-400 font-bold mb-3">
                These are the voices installed on your device. Add more in your phone's accessibility settings.
              </p>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                {voiceOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handlePickVoice(option)}
                    className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-all ${
                      option.id === activeVoice?.voiceURI
                        ? "bg-[#58CC02]/10 border-[#58CC02]"
                        : "bg-white border-gray-200 active:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-sans font-black text-sm text-slate-700">{option.name}</span>
                      {option.id === activeVoice?.voiceURI && <Check className="w-4 h-4 text-[#58CC02]" />}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      {option.lang}
                      {option.offline ? " • offline" : " • needs internet"}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
