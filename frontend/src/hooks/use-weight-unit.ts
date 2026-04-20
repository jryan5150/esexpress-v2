import { useSyncExternalStore, useCallback } from "react";

/**
 * Sitewide lbs/tons preference. Persisted in localStorage under
 * `esexpress-weight-unit`. Components that display a weight value read
 * via `useWeightUnit()` and format accordingly. The toggle lives in the
 * sidebar footer so it's always reachable.
 *
 * Default: "tons" — matches the existing payroll sheet format Jessica's
 * team uses today.
 */

const STORAGE_KEY = "esexpress-weight-unit";
type WeightUnit = "tons" | "lbs";

function readUnit(): WeightUnit {
  if (typeof window === "undefined") return "tons";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "lbs" ? "lbs" : "tons";
}

const subscribers = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    subscribers.delete(onChange);
    window.removeEventListener("storage", storageHandler);
  };
}

/**
 * Read the current unit + setter. Re-renders the consuming component
 * whenever the preference changes, including from a different tab
 * (via the browser's storage event).
 */
export function useWeightUnit(): {
  unit: WeightUnit;
  setUnit: (next: WeightUnit) => void;
  toggle: () => void;
  /** Format a tons value in the user's preferred unit. Accepts string or
   *  number; returns formatted string like "23.04 t" or "46,080 lbs".
   *  Returns a placeholder for nullish / NaN inputs. */
  format: (weightTons: string | number | null | undefined) => string;
} {
  const unit = useSyncExternalStore(subscribe, readUnit, () => "tons");

  const setUnit = useCallback((next: WeightUnit) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable; preference won't persist across reloads
    }
    for (const cb of subscribers) cb();
  }, []);

  const toggle = useCallback(() => {
    setUnit(readUnit() === "tons" ? "lbs" : "tons");
  }, [setUnit]);

  const format = useCallback(
    (weightTons: string | number | null | undefined): string => {
      if (weightTons == null || weightTons === "") return "--";
      const tons =
        typeof weightTons === "string" ? parseFloat(weightTons) : weightTons;
      if (!Number.isFinite(tons)) return "--";
      if (unit === "lbs") {
        const lbs = Math.round(tons * 2000);
        return `${lbs.toLocaleString("en-US")} lbs`;
      }
      return `${tons.toFixed(2)} t`;
    },
    [unit],
  );

  return { unit, setUnit, toggle, format };
}
