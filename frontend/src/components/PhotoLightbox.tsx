import { useEffect } from "react";

interface Props {
  url: string | null;
  alt?: string;
  onClose: () => void;
}

/**
 * Full-screen photo lightbox. Renders nothing when url is null.
 *
 * - Click backdrop → close
 * - ESC → close
 * - Click image → no-op (lets users zoom in via browser if they want)
 */
export function PhotoLightbox({ url, alt, onClose }: Props) {
  useEffect(() => {
    if (!url) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [url, onClose]);

  if (!url) return null;

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
      <img
        src={url}
        alt={alt ?? "Load photo"}
        className="max-w-[92vw] max-h-[92vh] rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
