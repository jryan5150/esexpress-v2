export type Theme = "dark" | "light" | "system";

export const STORAGE_KEY = "esexpress-theme";

export const CYCLE: Theme[] = ["dark", "light", "system"];

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR or restricted context)
  }
  return "dark";
}

export function getResolvedTheme(preference: Theme): "dark" | "light" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return preference;
}

export function cycleTheme(): Theme {
  const current = getStoredTheme();
  const currentIndex = CYCLE.indexOf(current);
  const next = CYCLE[(currentIndex + 1) % CYCLE.length];

  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage unavailable
  }

  const resolved = getResolvedTheme(next);
  document.documentElement.setAttribute("data-theme", resolved);

  return next;
}

export function initThemeListener(): () => void {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handler = () => {
    const stored = getStoredTheme();
    if (stored === "system") {
      const resolved = getResolvedTheme("system");
      document.documentElement.setAttribute("data-theme", resolved);
    }
  };

  mediaQuery.addEventListener("change", handler);

  return () => {
    mediaQuery.removeEventListener("change", handler);
  };
}
