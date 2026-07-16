import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AudiMascot from "./AudiMascot";
import { parseBookFile } from "../lib/parseBook";
import { saveBook } from "../lib/db";
import { ParseProgress } from "../types";

interface BookUploaderProps {
  onUploadSuccess: () => void;
  className?: string;
}

const STAGE_MESSAGES: Record<ParseProgress["stage"], string> = {
  reading: "Audi is adjusting her glasses to read your book... 🦉👓",
  extracting: "Turning every single page of your book... 📖✨",
  chapters: "Splitting the story into cozy chapters... 🔖",
  quizzes: "Writing fun comprehension quizzes for you... 🧠🎯",
};

export default function BookUploader({ onUploadSuccess, className = "" }: BookUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ParseProgress>({ stage: "reading", percent: 0 });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (![".txt", ".pdf", ".epub"].includes(fileExt)) {
      setError("We currently support only PDF, EPUB, and TXT files for voice generation.");
      return;
    }

    setError(null);
    setSuccess(null);
    setIsProcessing(true);
    setProgress({ stage: "reading", percent: 0 });

    try {
      // Everything happens right here on the device — no upload, no server
      const book = await parseBookFile(file, setProgress);
      await saveBook(book);
      setSuccess(`"${book.title}" is ready! ${book.chaptersCount} chapters added to your shelf.`);
      onUploadSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong while processing the book file.");
    } finally {
      setIsProcessing(false);
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`w-full ${className}`} id="uploader-container">
      <AnimatePresence mode="wait">
        {!isProcessing ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
            className={`relative flex flex-col items-center justify-center border-3 border-dashed rounded-[2rem] p-8 text-center cursor-pointer transition-all duration-300 ${
              dragActive
                ? "border-[#58CC02] bg-[#58CC02]/10 scale-98"
                : "border-gray-200 bg-white hover:border-[#58CC02] hover:bg-slate-50/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.pdf,.epub"
              onChange={handleChange}
            />

            {/* Pulsing Upload Icon */}
            <motion.div
              animate={{ y: dragActive ? [0, -6, 0] : 0 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className={`p-4 rounded-2xl mb-4 ${dragActive ? "bg-[#58CC02] text-white" : "bg-gray-100 text-slate-500"}`}
            >
              <Upload className="w-8 h-8" />
            </motion.div>

            <h3 className="font-display font-black text-lg text-[#1A1A1A] tracking-tight">
              Create Your New Audiobook!
            </h3>
            <p className="font-sans text-sm text-gray-500 max-w-sm mt-1.5 leading-relaxed font-bold">
              Drag & drop your <span className="font-black text-[#58CC02]">PDF, EPUB, or TXT</span> file here, or tap to choose a file. It never leaves your device.
            </p>

            <div className="flex gap-4 mt-6 items-center justify-center text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> PDF
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> EPUB
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> TXT
              </span>
            </div>

            {/* Notification Overlays */}
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 p-3 bg-red-50 border border-red-200 rounded-[1.5rem] flex items-start gap-2.5 text-left text-xs text-red-600 max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black">Conversion Error:</span> {error}
                </div>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 p-3.5 bg-green-50 border border-[#58CC02]/30 rounded-[1.5rem] flex items-center gap-2.5 text-left text-xs text-[#58CC02] max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#58CC02]" />
                <div>
                  <span className="font-black">Got it!</span> {success}
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white border border-gray-200 rounded-[2.5rem] p-8 flex flex-col items-center text-center shadow-sm"
          >
            {/* Mascot reading state */}
            <AudiMascot mood="quizzing" className="w-36 h-36 mb-4" />

            {/* Real parsing progress */}
            <div className="w-full max-w-xs bg-slate-100 h-2 rounded-full overflow-hidden relative mb-2 mt-2">
              <motion.div
                className="bg-[#58CC02] h-full rounded-full"
                animate={{ width: `${progress.percent}%` }}
                transition={{ ease: "easeOut", duration: 0.3 }}
              />
            </div>
            <span className="font-mono text-[10px] text-slate-400 mb-4">{progress.percent}%</span>

            <h3 className="font-display font-black text-slate-800 text-lg tracking-tight">
              Audi's Library Workshop
            </h3>

            {/* Stage message */}
            <AnimatePresence mode="wait">
              <motion.p
                key={progress.stage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="font-sans text-sm text-[#58CC02] font-black max-w-xs mt-3 min-h-[40px] leading-relaxed"
              >
                {STAGE_MESSAGES[progress.stage]}
              </motion.p>
            </AnimatePresence>

            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mt-4">
              100% On-Device • Private • Free
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
