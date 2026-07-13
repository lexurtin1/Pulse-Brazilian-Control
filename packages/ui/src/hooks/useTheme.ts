import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

// Same localStorage key as the design reference (Pulse Brazil Command
// Centre.dc.html's toggleTheme()), so the manual-override behavior matches
// exactly, not just the visual result.
const STORAGE_KEY = "px-theme";

function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage unavailable (private mode, etc.) — theme still applies for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
