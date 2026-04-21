import { useEffect, useState } from "react";

interface Props {
  /** Single URL (back-compat). Mutually exclusive with `urls`. */
  url?: string | null;
  /** Multi-photo mode. When provided, renders prev/next + counter. */
  urls?: string[];
  /** Initial index when `urls` is supplied. Clamped to array bounds. */
  initialIndex?: number;
  alt?: string;
  onClose: () => void;
}

/**
 * Full-screen photo lightbox. Accepts either `url` (single) or `urls[]`
 * (multi with cycling). Keyboard: Esc closes, ArrowLeft/Right cycles when
 * multi. Click backdrop to close.
 *
 * Multi-photo mode is the common case for driver-submitted JotForm tickets
 * where the same submission carries 2-3 angles of the same scale ticket.
 */
export function PhotoLightbox({
  url,
  urls,
  initialIndex = 0,
  alt,
  onClose,
}: Props) {
  const effectiveUrls = urls && urls.length > 0 ? urls : url ? [url] : [];
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, Math.max(0, effectiveUrls.length - 1))),
  );

  // Reset index when the source array itself changes.
  useEffect(() => {
    setIndex(Math.max(0, Math.min(initialIndex, effectiveUrls.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUrls.length, initialIndex]);

  const step = (delta: number) => {
    if (effectiveUrls.length < 2) return;
    const n = effectiveUrls.length;
    setIndex((i) => (i + delta + n) % n);
  };

  useEffect(() => {
    if (effectiveUrls.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUrls.length, onClose]);

  if (effectiveUrls.length === 0) return null;
  const current = effectiveUrls[index];
  const multi = effectiveUrls.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center cursor-zoom-out"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl leading-none flex items-center justify-center"
      >
        ×
      </button>
      {multi && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center"
          >
            ›
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full tabular-nums">
            {index + 1} / {effectiveUrls.length}
          </div>
        </>
      )}
      <img
        src={current}
        alt={alt ?? "Load photo"}
        className="max-w-[92vw] max-h-[92vh] rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
