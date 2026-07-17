import { useState, useEffect, useRef, useCallback } from "react";
import { Book, Chapter } from "../types";
import {
  ChevronLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Check,
  HelpCircle,
  Mic2,
  X,
  AlertTriangle,
  Download,
  CloudOff,
} from "lucide-react";
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
import { downloadChapterAudio } from "../lib/librivox";
import { hasSpaceFor, isQuotaError, STORAGE_FULL_MESSAGE } from "../lib/storage";
import * as db from "../lib/db";

interface AudiobookPlayerProps {
  book: Book;
  onBack: () => void;
  onOpenQuiz: (chapter: Chapter) => void;
  completedQuizzes: string[]; // bookId-chapterId
  onUpdateXP: (xp: number, kind?: "listen" | "general") => void;
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
  const [error, setError] = useState<string | null>(null);

  // Real-audio (LibriVox) state
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioFromDevice, setAudioFromDevice] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<Record<number, number>>({});

  // Read-along state (TTS chapters)
  const [chunks, setChunks] = useState<string[]>([]);
  const [activeChunk, setActiveChunk] = useState(0);

  // Voice state (TTS chapters)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState<string | null>(getSavedVoiceId());
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  const currentChapter = book.chapters[activeChapterIndex] || book.chapters[0];
  const isAudioChapter = !!currentChapter.audioUrl;
  const speechRef = useRef<SpeechReader | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunkRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const bookRef = useRef(book);
  bookRef.current = book;
  const indexRef = useRef(activeChapterIndex);
  indexRef.current = activeChapterIndex;
  // When a chapter ends (or lock-screen next is tapped), the next one should
  // start playing on its own — including with the screen off.
  const autoPlayNextRef = useRef(false);
  // Downloads run one at a time; parallel multi-MB fetches spike phone memory.
  const dlQueueRef = useRef<Chapter[]>([]);
  const dlActiveRef = useRef(false);
  const ttsSupported = SpeechReader.isSupported();

  const bookChapterKey = `${book.id}-${currentChapter.id}`;
  const isQuizCompleted = completedQuizzes.includes(bookChapterKey);
  const isDownloading = downloadPercent[currentChapter.id] !== undefined;

  // Resolve the device's voices once (Safari populates these asynchronously)
  useEffect(() => {
    if (!ttsSupported) return;
    let cancelled = false;
    loadVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      setVoiceOptions(listVoiceOptions(list));
    });
    return () => {
      cancelled = true;
    };
  }, [ttsSupported]);

  const resolveVoice = useCallback(
    (list: SpeechSynthesisVoice[], id: string | null): SpeechSynthesisVoice | null => {
      if (list.length === 0) return null;
      const saved = id ? list.find((v) => v.voiceURI === id) : null;
      if (saved) return saved;
      const best = listVoiceOptions(list)[0];
      return (best && list.find((v) => v.voiceURI === best.id)) || null;
    },
    []
  );

  // Set up a REAL-AUDIO chapter. Deliberately independent of the voice list —
  // the async `voiceschanged` arrival must never reset a playing stream.
  useEffect(() => {
    if (!isAudioChapter) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setError(null);
    setDuration(currentChapter.duration || 30);
    setChunks([]);
    speechRef.current?.dispose();
    speechRef.current = null;

    let objectUrl: string | null = null;
    let cancelled = false;

    // Prefer the offline copy; fall back to streaming from the archive
    setAudioSrc(null);
    setAudioFromDevice(false);
    db.getAudio(book.id, currentChapter.id)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setAudioSrc(objectUrl);
          setAudioFromDevice(true);
        } else {
          setAudioSrc(currentChapter.audioUrl!);
          if (!navigator.onLine) {
            setError("This chapter isn't downloaded yet — connect to the internet or download it for offline.");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAudioSrc(currentChapter.audioUrl!);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterIndex, book.id, isAudioChapter]);

  // Set up a TTS chapter (device voice). Re-runs when the voice list arrives
  // or the user picks a narrator — that's harmless here, unlike for streams.
  useEffect(() => {
    if (isAudioChapter) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveChunk(0);
    setError(null);
    setDuration(currentChapter.duration || 30);
    setAudioSrc(null);
    speechRef.current?.dispose();
    speechRef.current = null;

    if (!ttsSupported) {
      setChunks([currentChapter.text]);
      return;
    }
    const estimated = currentChapter.duration || 30;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterIndex, book.id, voices, voiceId, isAudioChapter]);

  // TTS pauses when the app is backgrounded (the engine dies anyway);
  // real audio keeps playing — that's the point of an audiobook.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && speechRef.current) {
        speechRef.current.pause();
        setIsPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Keep the highlighted sentence in view while listening (TTS mode)
  useEffect(() => {
    if (!isPlaying || isAudioChapter) return;
    chunkRefs.current[activeChunk]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeChunk, isPlaying, isAudioChapter]);

  // Lock-screen / notification media controls for real audio. Handlers read
  // refs, not closures, so they stay correct across chapter changes.
  const setupMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      const b = bookRef.current;
      const ch = b.chapters[indexRef.current];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ch?.title || b.title,
        artist: b.author,
        album: b.title,
        artwork: b.coverUrl ? [{ src: b.coverUrl, sizes: "180x180", type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => {
        audioRef.current
          ?.play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        if (audioRef.current) audioRef.current.currentTime -= 15;
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        if (audioRef.current) audioRef.current.currentTime += 15;
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (indexRef.current > 0) {
          autoPlayNextRef.current = true;
          setActiveChapterIndex(indexRef.current - 1);
        }
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (indexRef.current < bookRef.current.chapters.length - 1) {
          autoPlayNextRef.current = true;
          setActiveChapterIndex(indexRef.current + 1);
        }
      });
    } catch {
      // Media session is a nice-to-have
    }
  }, []);

  // Keep the lock-screen scrubber in sync
  const reportPosition = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      if (isFinite(audio.duration) && audio.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: Math.min(audio.currentTime, audio.duration),
        });
      }
    } catch {
      // Position state is a nice-to-have
    }
  }, []);

  const togglePlay = () => {
    setError(null);
    if (isAudioChapter) {
      const audio = audioRef.current;
      if (!audio) return;
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        try {
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        } catch { /* nice-to-have */ }
      } else {
        audio.playbackRate = playbackSpeed;
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            setupMediaSession();
            try {
              if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
            } catch { /* nice-to-have */ }
          })
          .catch(() => {
            setError(
              navigator.onLine
                ? "Couldn't start this chapter. Try downloading it, or check the next chapter."
                : "You're offline and this chapter isn't downloaded yet."
            );
          });
      }
    } else {
      if (!ttsSupported) {
        setError("This browser can't narrate. Try Safari or Chrome.");
        return;
      }
      if (isPlaying) {
        speechRef.current?.pause();
        setIsPlaying(false);
      } else {
        speechRef.current?.play(); // called straight from the tap: iOS requires this
        setIsPlaying(true);
      }
    }
  };

  const skip = (direction: 1 | -1) => {
    if (isAudioChapter) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = Math.max(0, Math.min(audio.duration || duration, audio.currentTime + direction * 15));
        setCurrentTime(audio.currentTime);
      }
    } else {
      speechRef.current?.skipChunks(direction);
    }
  };

  const handleSpeedChange = () => {
    const speeds = [0.8, 1, 1.25, 1.5];
    const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
    speechRef.current?.setRate(nextSpeed);
  };

  const handleSeek = (ratio: number) => {
    if (!isAudioChapter || !audioRef.current) return;
    const target = ratio * (audioRef.current.duration || duration);
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  // Serialized download queue: one chapter at a time, quota-checked before
  // each fetch, and the whole queue stops on the first failure instead of
  // hammering a dead connection or a full disk.
  const clearDownloadMark = (chapterId: number) => {
    setDownloadPercent((prev) => {
      const next = { ...prev };
      delete next[chapterId];
      return next;
    });
  };

  const processDownloadQueue = async () => {
    if (dlActiveRef.current) return;
    dlActiveRef.current = true;
    try {
      while (dlQueueRef.current.length > 0) {
        const chapter = dlQueueRef.current.shift()!;
        try {
          if (!(await hasSpaceFor(chapter.audioSizeMB || 30))) {
            throw new Error(STORAGE_FULL_MESSAGE);
          }
          const blob = await downloadChapterAudio(chapter, (percent) =>
            setDownloadPercent((prev) => ({ ...prev, [chapter.id]: percent }))
          );
          await db.saveAudio(bookRef.current.id, chapter.id, blob);
          onUpdateBook({
            ...bookRef.current,
            chapters: bookRef.current.chapters.map((ch) =>
              ch.id === chapter.id ? { ...ch, downloaded: true } : ch
            ),
          });
          onUpdateXP(15);
        } catch (err: any) {
          setError(isQuotaError(err) ? STORAGE_FULL_MESSAGE : err.message || "Download failed. Please try again.");
          // Drop everything still waiting — the cause likely affects them too
          for (const pending of dlQueueRef.current) clearDownloadMark(pending.id);
          dlQueueRef.current = [];
        } finally {
          clearDownloadMark(chapter.id);
        }
      }
    } finally {
      dlActiveRef.current = false;
    }
  };

  const handleDownload = (chapter: Chapter) => {
    if (downloadPercent[chapter.id] !== undefined || chapter.downloaded || !chapter.audioUrl) return;
    setError(null);
    setDownloadPercent((prev) => ({ ...prev, [chapter.id]: 0 }));
    dlQueueRef.current.push(chapter);
    void processDownloadQueue();
  };

  const handleDownloadAll = () => {
    const remaining = bookRef.current.chapters.filter(
      (ch) => ch.audioUrl && !ch.downloaded && downloadPercent[ch.id] === undefined
    );
    for (const ch of remaining) handleDownload(ch);
  };

  const handleRemoveDownload = async (chapter: Chapter) => {
    try {
      await db.deleteAudio(book.id, chapter.id);
      onUpdateBook({
        ...bookRef.current,
        chapters: bookRef.current.chapters.map((ch) =>
          ch.id === chapter.id ? { ...ch, downloaded: false } : ch
        ),
      });
      // If it's the chapter on screen, swap back to the streaming source
      if (chapter.id === currentChapter.id && chapter.audioUrl) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setAudioFromDevice(false);
        setAudioSrc(chapter.audioUrl);
        setCurrentTime(0);
      }
    } catch {
      setError("Couldn't remove the offline copy. Please try again.");
    }
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
    if (!isFinite(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const activeVoice = resolveVoice(voices, voiceId);
  const activeVoiceName =
    voiceOptions.find((v) => v.id === activeVoice?.voiceURI)?.name || activeVoice?.name || "Device Voice";

  return (
    <div className="flex flex-col min-h-screen bg-[#F0F2F5] pb-28" id="player-screen">
      {/* Real audio element (LibriVox chapters) */}
      {isAudioChapter && audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
            reportPosition();
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && isFinite(audioRef.current.duration)) {
              setDuration(audioRef.current.duration);
            }
          }}
          onCanPlay={() => {
            // Continuous playback: when the previous chapter ended (or a
            // lock-screen skip was tapped), start this one without a touch —
            // this is what keeps a whole book playing with the screen off.
            if (autoPlayNextRef.current && audioRef.current) {
              autoPlayNextRef.current = false;
              audioRef.current.playbackRate = playbackSpeed;
              audioRef.current
                .play()
                .then(() => {
                  setIsPlaying(true);
                  setupMediaSession();
                })
                .catch(() => setIsPlaying(false));
            }
          }}
          onEnded={() => {
            onUpdateXP(10, "listen");
            if (indexRef.current < bookRef.current.chapters.length - 1) {
              autoPlayNextRef.current = true;
              setActiveChapterIndex(indexRef.current + 1);
            } else {
              setIsPlaying(false);
              setCurrentTime(0);
            }
          }}
          onError={() => {
            if (audioSrc && !audioFromDevice) {
              setError(
                navigator.onLine
                  ? "This audio file couldn't load. Try another chapter."
                  : "You're offline and this chapter isn't downloaded."
              );
            }
            autoPlayNextRef.current = false;
            setIsPlaying(false);
          }}
        />
      )}

      {/* Header (iOS style) */}
      <div className="bg-white border-b border-gray-100 pt-safe-header pb-4 px-4 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-1 font-sans font-black text-sm text-[#1CB0F6] border border-gray-200 rounded-xl px-3 py-1.5 bg-white active:bg-slate-50 active:scale-98 transition-all"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center max-w-[190px]">
          <h4 className="font-display font-black text-slate-800 text-xs tracking-tight line-clamp-1">
            {book.title}
          </h4>
          <p className="font-sans text-[10px] text-gray-400 mt-0.5 font-bold">
            Chapter {activeChapterIndex + 1} of {book.chaptersCount}
          </p>
        </div>

        {/* Context action: download (audio) or voice picker (TTS) */}
        {isAudioChapter ? (
          <button
            onClick={() => handleDownload(currentChapter)}
            disabled={currentChapter.downloaded || isDownloading}
            className={`p-2 rounded-xl border transition-all ${
              currentChapter.downloaded
                ? "bg-[#58CC02]/10 border-[#58CC02]/20 text-[#58CC02]"
                : "bg-white border-gray-200 text-[#1CB0F6] active:scale-95"
            }`}
            title={currentChapter.downloaded ? "Saved for offline" : "Download for offline"}
          >
            {isDownloading ? (
              <span className="w-4 h-4 border-2 border-[#1CB0F6] border-t-transparent rounded-full animate-spin block" />
            ) : currentChapter.downloaded ? (
              <Check className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        ) : (
          <button
            onClick={() => setShowVoicePicker(true)}
            disabled={voiceOptions.length === 0}
            className="p-2 rounded-xl border border-gray-200 bg-white text-[#1CB0F6] active:scale-95 transition-all disabled:opacity-40"
            title="Choose narrator voice"
          >
            <Mic2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Scrollable Shell */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28 flex flex-col gap-6">
        {/* Cover / Mascot Card */}
        <div className="bg-white border border-gray-200 rounded-[2rem] p-5 shadow-sm text-center flex flex-col items-center">
          {book.coverUrl ? (
            <div className="w-36 h-36 rounded-3xl overflow-hidden shadow-md bg-gradient-to-br from-green-300 to-[#58CC02] flex items-center justify-center">
              <img
                src={book.coverUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <AudiMascot mood={isPlaying ? "listening" : "happy"} className="w-40 h-40" />
          )}

          {isAudioChapter ? (
            <div className="mt-3 flex flex-col items-center gap-1.5">
              <span className="bg-[#E1F5FE] border border-[#1CB0F6]/20 text-[#1CB0F6] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                🎙 Human Narrated {book.runtime ? `• ${book.runtime}` : ""}
              </span>
              {audioFromDevice ? (
                <span className="bg-[#58CC02]/10 border border-[#58CC02]/20 text-[#58CC02] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                  ✓ Playing from your device — works offline
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">
                  Streaming{currentChapter.audioSizeMB ? ` • ${currentChapter.audioSizeMB}MB to download` : ""}
                </span>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* Download CTA for streaming chapters */}
          {isAudioChapter && !currentChapter.downloaded && (
            <div className="w-full mt-4">
              {isDownloading ? (
                <div className="bg-[#E1F5FE]/60 border border-[#1CB0F6]/20 rounded-2xl p-3.5 text-left">
                  <span className="font-sans font-black text-[#1CB0F6] text-[11px] uppercase tracking-wide">
                    Saving for offline... {downloadPercent[currentChapter.id] || 0}%
                  </span>
                  <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-[#1CB0F6]/10 mt-2">
                    <motion.div
                      className="h-full bg-[#1CB0F6] rounded-full"
                      animate={{ width: `${downloadPercent[currentChapter.id] || 0}%` }}
                      transition={{ ease: "easeOut", duration: 0.3 }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleDownload(currentChapter)}
                  className="w-full py-3 bg-[#1CB0F6] border-b-4 border-[#1899d6] active:border-b-0 active:translate-y-[4px] text-white rounded-2xl font-sans font-black text-xs tracking-wide transition-all flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Download this chapter for offline
                  {currentChapter.audioSizeMB ? ` (${currentChapter.audioSizeMB}MB)` : ""}
                </button>
              )}
            </div>
          )}

          {/* Remove the offline copy to reclaim space */}
          {isAudioChapter && currentChapter.downloaded && (
            <button
              onClick={() => handleRemoveDownload(currentChapter)}
              className="mt-3 font-sans text-[10px] font-bold text-slate-400 underline underline-offset-2 active:text-slate-600"
            >
              Remove offline copy
              {currentChapter.audioSizeMB ? ` (frees ${currentChapter.audioSizeMB}MB)` : ""}
            </button>
          )}

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
                {ch.downloaded && "✓ "}
                {ch.title.length > 20 ? ch.title.slice(0, 20) + "..." : ch.title}
              </button>
            ))}
          </div>
        </div>

        {/* Summary / About box */}
        {(currentChapter.summary || book.description) && (
          <div className="bg-[#E1F5FE]/60 border border-[#1CB0F6]/20 rounded-2xl p-4 flex gap-3 items-start relative overflow-hidden">
            <div className="bg-[#1CB0F6] text-white p-2 rounded-xl text-xs font-black">💡</div>
            <div>
              <h5 className="font-display font-black text-[#1CB0F6] text-xs uppercase tracking-wider">
                {currentChapter.summary ? "Audi's Summary Key" : "About this audiobook"}
              </h5>
              <p className="font-sans text-xs text-slate-700 font-bold mt-1 leading-relaxed">
                {currentChapter.summary || book.description}
              </p>
            </div>
          </div>
        )}

        {/* Read-Along (TTS chapters only — real audiobooks have no text) */}
        {!isAudioChapter && (
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
        )}

        {/* Bulk offline download for the whole book */}
        {isAudioChapter &&
          (() => {
            const remaining = book.chapters.filter((ch) => ch.audioUrl && !ch.downloaded);
            const queued = Object.keys(downloadPercent).length;
            const remainingMB = Math.round(remaining.reduce((sum, ch) => sum + (ch.audioSizeMB || 0), 0));
            const activeEntry = Object.entries(downloadPercent)[0];
            const activeChapterTitle = activeEntry
              ? book.chapters.find((ch) => ch.id === Number(activeEntry[0]))?.title
              : null;
            return (
              <div className="flex flex-col gap-2">
                {remaining.length > 0 && queued === 0 && (
                  <button
                    onClick={handleDownloadAll}
                    className="w-full py-3 bg-white border-2 border-[#1CB0F6]/30 text-[#1CB0F6] rounded-2xl font-sans font-black text-xs tracking-wide active:bg-[#E1F5FE]/50 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Download all {remaining.length} remaining chapters
                    {remainingMB > 0 ? ` (~${remainingMB}MB)` : ""}
                  </button>
                )}
                {queued > 0 && activeChapterTitle && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-3 flex items-center gap-2.5">
                    <span className="w-4 h-4 border-2 border-[#1CB0F6] border-t-transparent rounded-full animate-spin shrink-0" />
                    <p className="font-sans text-[11px] text-slate-500 font-bold">
                      Saving "{activeChapterTitle}" {activeEntry ? `${activeEntry[1]}%` : ""}
                      {queued > 1 ? ` — ${queued - 1} more in queue` : ""}. One at a time keeps your phone happy!
                    </p>
                  </div>
                )}
                {remaining.length > 0 && (
                  <div className="flex items-center gap-2 px-2">
                    <CloudOff className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    <p className="font-sans text-[10px] text-slate-400 font-bold">
                      Chapters play over the internet until you download them. Downloaded chapters (✓) work anywhere.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
      </div>

      {/* Floating Bottom Media Bar */}
      <div className="fixed bottom-0 inset-x-0 mx-auto max-w-[412px] bg-white/95 backdrop-blur-md border-t border-gray-100 px-5 pt-4 pb-safe-bar z-10 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] font-black text-gray-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>
              {isAudioChapter ? "" : "~"}
              {formatTime(duration)}
            </span>
          </div>

          <div
            className={`w-full h-2 bg-gray-100 rounded-full relative overflow-hidden ${isAudioChapter ? "cursor-pointer" : ""}`}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              handleSeek((e.clientX - rect.left) / rect.width);
            }}
          >
            <motion.div
              className="h-full bg-[#58CC02] rounded-full"
              animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              transition={{ ease: "linear", duration: 0.2 }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={handleSpeedChange}
            className="font-sans font-black text-xs text-gray-500 border border-gray-200 rounded-xl px-3 py-2 bg-white active:bg-slate-50 active:scale-95 transition-all"
          >
            {playbackSpeed}x
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={() => skip(-1)}
              className="p-3 text-slate-600 bg-gray-100 rounded-full active:scale-90 transition-all border border-gray-200/50"
              title={isAudioChapter ? "Back 15 seconds" : "Previous sentence"}
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
              title={isAudioChapter ? "Forward 15 seconds" : "Next sentence"}
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
                <Check className="w-4 h-4" /> Done
              </>
            ) : (
              <>
                <HelpCircle className="w-4 h-4" /> Quiz
              </>
            )}
          </button>
        </div>
      </div>

      {/* Voice Picker Sheet (TTS books only) */}
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
