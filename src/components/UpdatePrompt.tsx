import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { onUpdateReady, applyUpdate } from "../lib/swUpdate";

/**
 * Non-blocking "new version" banner. Shown only when a newer service worker is
 * waiting, and dismissible — nothing interrupts playback without consent.
 */
export default function UpdatePrompt() {
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    onUpdateReady(() => setVisible(true));
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="absolute top-safe left-4 right-4 z-50 bg-[#1B1235] rounded-2xl shadow-lg p-3 flex items-center gap-3"
          role="status"
        >
          <div className="bg-[#6D4AFF] p-2 rounded-xl text-white shrink-0">
            <RefreshCw className={`w-4 h-4 ${applying ? "animate-spin" : ""}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-sans font-black text-white text-xs">New version available</p>
            <p className="font-sans font-bold text-white/60 text-[10px] leading-tight">
              Your books and downloads stay exactly where they are.
            </p>
          </div>
          <button
            onClick={() => {
              setApplying(true);
              applyUpdate();
            }}
            disabled={applying}
            className="px-3 py-2 bg-[#6D4AFF] text-white rounded-xl font-sans font-black text-[11px] active:scale-95 transition-all shrink-0 disabled:opacity-70"
          >
            {applying ? "Updating..." : "Update"}
          </button>
          <button
            onClick={() => setVisible(false)}
            className="p-1.5 text-white/40 active:text-white/70 shrink-0"
            aria-label="Dismiss update notice"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
