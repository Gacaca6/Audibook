import { useState, useEffect } from "react";
import { Headphones } from "lucide-react";
import { Book } from "../types";
import { getCover } from "../lib/db";

interface BookCoverProps {
  book: Book;
  className?: string;
}

/**
 * Book cover that works offline: shows the locally stored blob when we have
 * one, falls back to the network URL, and always has the gradient+headphones
 * placeholder underneath so a failed image never leaves a blank box.
 */
export default function BookCover({ book, className = "" }: BookCoverProps) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [networkFailed, setNetworkFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setLocalUrl(null);
    setNetworkFailed(false);
    getCover(book.id)
      .then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setLocalUrl(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.id]);

  const src = localUrl || (!networkFailed ? book.coverUrl : null);

  return (
    <div
      className={`relative overflow-hidden flex flex-col items-center justify-center text-white bg-gradient-to-br ${
        book.id === "audi-adventures" ? "from-[#E1F5FE] to-[#1CB0F6]" : "from-green-300 to-[#58CC02]"
      } ${className}`}
    >
      <Headphones className="w-5 h-5 opacity-75 text-white" />
      <span className="font-mono text-[9px] uppercase tracking-wider text-white mt-1">
        {book.chaptersCount || "..."} Ch
      </span>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => {
            if (localUrl) setLocalUrl(null);
            else setNetworkFailed(true);
          }}
        />
      )}
    </div>
  );
}
