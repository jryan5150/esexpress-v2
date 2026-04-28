import { useEffect, useState } from "react";

interface Props {
  src: string;
  alt: string;
  /**
   * Stable identifier (typically `load-${id}` or `bol-${id}`). Rotation
   * preference is persisted to localStorage under this key, so when the
   * user rotates a sideways photo the choice survives reload + future
   * visits to the same load.
   */
  storageKey: string;
  /** className forwarded to the `<img>` element. */
  imgClassName?: string;
  /** className forwarded to the wrapping `<div>`. */
  className?: string;
  /** Optional click on the image (e.g. open lightbox). */
  onImgClick?: () => void;
  /** Optional onError handler forwarded to the `<img>`. */
  onError?: React.ReactEventHandler<HTMLImageElement>;
  /** Position of the rotate control. Default: bottom-right. */
  controlPosition?: "bottom-right" | "top-right";
}

const STORAGE_PREFIX = "esexpress-photo-rotation:";

function readRotation(key: string): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(STORAGE_PREFIX + key);
  if (!v) return 0;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 0;
  return ((n % 360) + 360) % 360;
}

function writeRotation(key: string, deg: number) {
  if (typeof window === "undefined") return;
  if (deg === 0) {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } else {
    window.localStorage.setItem(STORAGE_PREFIX + key, String(deg));
  }
}

/**
 * Image wrapper with a manual ↻ rotation button. The proxy already does
 * EXIF auto-rotation on JotForm photos, but some sideways shots arrive
 * stripped of EXIF (or with the wrong orientation tag). This gives the
 * user a manual override that sticks across reloads.
 *
 * Implementation: pure CSS transform — no backend write, no re-encode.
 * The container reserves enough room so 90/270° rotations don't get
 * clipped (rotated images render rotated relative to the original
 * intrinsic dimensions).
 */
export function RotatableImage({
  src,
  alt,
  storageKey,
  imgClassName = "w-full max-h-96 object-contain rounded border border-border bg-black/10",
  className = "",
  onImgClick,
  onError,
  controlPosition = "bottom-right",
}: Props) {
  const [rotation, setRotation] = useState(() => readRotation(storageKey));

  // Re-read when the storage key changes (e.g. user navigates to a
  // different load while the component remains mounted).
  useEffect(() => {
    setRotation(readRotation(storageKey));
  }, [storageKey]);

  const rotate = () => {
    const next = (rotation + 90) % 360;
    setRotation(next);
    writeRotation(storageKey, next);
  };

  const swapAxis = rotation === 90 || rotation === 270;

  const controlClasses =
    controlPosition === "top-right"
      ? "absolute top-2 right-2"
      : "absolute bottom-2 right-2";

  return (
    <div className={`relative ${className}`}>
      <img
        src={src}
        alt={alt}
        onClick={onImgClick}
        onError={onError}
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: "transform 200ms ease",
          // When the image is rotated 90/270 the intrinsic width becomes
          // the rendered height. Forcing object-contain on a square-ish
          // container keeps it inside bounds.
          maxHeight: swapAxis ? "24rem" : undefined,
        }}
        className={imgClassName}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          rotate();
        }}
        title={`Rotate 90° (currently ${rotation}°)`}
        aria-label="Rotate photo"
        className={`${controlClasses} w-8 h-8 rounded-full bg-black/55 hover:bg-black/75 text-white text-base flex items-center justify-center shadow-md backdrop-blur-sm`}
      >
        ↻
      </button>
    </div>
  );
}

export { readRotation as readPhotoRotation };
