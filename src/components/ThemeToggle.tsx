"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "cwp.theme";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function getThemeSnapshot(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const currentTheme = document.documentElement.dataset.theme;

  if (currentTheme === "light" || currentTheme === "dark") {
    return currentTheme;
  }

  return getPreferredTheme();
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

function subscribeToThemeChanges(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("cwp-theme-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("cwp-theme-change", callback);
  };
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    window.dispatchEvent(new Event("cwp-theme-change"));
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-pressed={isDark}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-5 w-9 items-center rounded-full bg-surface-muted p-0.5"
      >
        <span
          className={`block size-4 rounded-full bg-accent transition-transform ${
            isDark ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      <span className="hidden sm:inline">{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
