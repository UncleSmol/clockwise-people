"use client";

import { useEffect } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "cwp.theme";

function getPreferredTheme(): Theme {
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

export default function ThemeBootstrap() {
  useEffect(() => {
    applyTheme(getPreferredTheme());
    window.dispatchEvent(new Event("cwp-theme-change"));
  }, []);

  return null;
}
