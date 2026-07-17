import { useState, useRef, FormEvent } from "react";
import { Search, Download, Check, Headphones, AlertTriangle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AudiMascot from "./AudiMascot";
import { searchAudiobooks, getAudiobook, AudiobookSearchResult } from "../lib/librivox";
import { saveBook } from "../lib/db";
import { Book } from "../types";

interface DiscoverProps {
  shelfBookIds: string[];
  onBookAdded: (book: Book) => void;
}

const SUGGESTIONS = ["Pride and Prejudice", "Sherlock Holmes", "Dracula", "The Art of War", "Treasure Island", "Aesop's Fables"];

export default function Discover({ shelfBookIds, onBookAdded }: DiscoverProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AudiobookSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = async (term: string) => {
    const q = term.trim();
    if (!q) return;
    setQuery(q);
    setIsSearching(true);
    setError(null);
    try {
      const found = await searchAudiobooks(q);
      setResults(found);
    } catch (err: any) {
      setError(err.message || "Search failed. Check your connection.");
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    inputRef.current?.blur();
    runSearch(query);
  };

  const handleGet = async (result: AudiobookSearchResult) => {
    if (addingId) return;
    setAddingId(result.identifier);
    setError(null);
    try {
      const book = await getAudiobook(result.identifier);
      await saveBook(book);
      onBookAdded(book);
    } catch (err: any) {
      setError(err.message || "Couldn't add this audiobook. Please try again.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" id="discover-container">
      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white border-2 border-gray-200 rounded-2xl px-3.5 focus-within:border-[#58CC02] transition-colors">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 20,000+ free audiobooks..."
            className="w-full py-3.5 bg-transparent outline-none font-sans font-bold text-sm text-slate-700 placeholder:text-slate-300"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="px-4 bg-[#58CC02] border-b-4 border-[#46A302] active:border-b-0 active:translate-y-[4px] text-white rounded-2xl font-sans font-black text-sm transition-all disabled:opacity-50 disabled:border-b-4 disabled:translate-y-0"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Go"}
        </button>
      </form>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="font-sans text-xs text-red-600 font-bold">{error}</p>
        </div>
      )}

      {/* Empty state: suggestions */}
      {results === null && !isSearching && (
        <div className="bg-white border border-gray-200 rounded-[2rem] p-6 text-center shadow-sm">
          <AudiMascot mood="happy" className="w-28 h-28 mx-auto" />
          <h3 className="font-display font-black text-slate-800 text-base mt-2">Find Your Next Story</h3>
          <p className="font-sans text-xs text-slate-400 font-bold mt-1 max-w-xs mx-auto leading-relaxed">
            Real narrated audiobooks from LibriVox — free forever, no account needed. Try one of these:
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => runSearch(s)}
                className="px-3 py-2 bg-[#E1F5FE] border border-[#1CB0F6]/20 text-[#1CB0F6] rounded-xl font-sans font-black text-[11px] active:scale-95 transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Searching skeleton */}
      {isSearching && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-[2rem] p-4 flex gap-3 animate-pulse">
              <div className="w-14 h-[76px] bg-slate-100 rounded-xl shrink-0" />
              <div className="flex-1 py-1 flex flex-col gap-2">
                <div className="h-3.5 bg-slate-100 rounded-full w-3/4" />
                <div className="h-3 bg-slate-100 rounded-full w-1/2" />
                <div className="h-3 bg-slate-100 rounded-full w-1/3 mt-auto" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {results !== null && !isSearching && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display font-black text-slate-800 text-sm tracking-wide uppercase px-1">
            {results.length === 0 ? "No matches found" : `${results.length} audiobooks found`}
          </h3>

          {results.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-[2rem] p-6 text-center shadow-sm">
              <p className="font-sans text-xs text-slate-500 font-bold leading-relaxed max-w-xs mx-auto">
                Nothing matched "{query}". LibriVox covers classics and public-domain titles — try an author like
                "Jane Austen" or "Mark Twain". Got your own copy? Add it from My Books and Audi will narrate it!
              </p>
            </div>
          )}

          <AnimatePresence>
            {results.map((r) => {
              const onShelf = shelfBookIds.includes(`lv-${r.identifier}`);
              const isAdding = addingId === r.identifier;
              return (
                <motion.div
                  key={r.identifier}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-gray-200 rounded-[2rem] p-4 flex gap-3 shadow-sm"
                >
                  {/* Cover */}
                  <div className="w-14 h-[76px] rounded-xl overflow-hidden bg-gradient-to-br from-green-300 to-[#58CC02] shrink-0 flex items-center justify-center relative">
                    <Headphones className="w-5 h-5 text-white/80 absolute" />
                    <img
                      src={r.coverUrl}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover relative"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <h4 className="font-display font-black text-slate-800 text-[13px] leading-snug line-clamp-2">
                      {r.title}
                    </h4>
                    <p className="font-sans text-[11px] text-slate-400 font-bold mt-0.5 line-clamp-1">{r.creator}</p>
                    <div className="mt-auto pt-1.5 flex items-center gap-2">
                      <span className="font-mono text-[9px] text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                        🎧 {r.downloads >= 1000 ? `${Math.round(r.downloads / 1000)}k listens` : `${r.downloads} listens`}
                      </span>
                    </div>
                  </div>

                  {/* Get button */}
                  <div className="flex items-center">
                    {onShelf ? (
                      <span className="flex items-center gap-1 px-3 py-2 bg-[#58CC02]/10 border border-[#58CC02]/20 text-[#58CC02] rounded-xl font-sans font-black text-[11px]">
                        <Check className="w-3.5 h-3.5" /> Added
                      </span>
                    ) : (
                      <button
                        onClick={() => handleGet(r)}
                        disabled={isAdding || addingId !== null}
                        className="flex items-center gap-1 px-3 py-2.5 bg-[#1CB0F6] border-b-4 border-[#1899d6] active:border-b-0 active:translate-y-[4px] text-white rounded-xl font-sans font-black text-[11px] transition-all disabled:opacity-60"
                      >
                        {isAdding ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" /> Get
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <p className="font-sans text-[10px] text-slate-400 font-bold text-center px-4 pb-2">
            Recordings by LibriVox volunteers — public domain, free forever. ❤️
          </p>
        </div>
      )}
    </div>
  );
}
