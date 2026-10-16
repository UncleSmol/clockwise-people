"use client";

import { useEffect } from "react";

/**
 * Ensures legacy dark-theme artifacts in localStorage and cookies are purged
 * on the client without rendering inline <script> tags that trigger React 19 warnings.
 */
export function ThemeCleanup() {
  useEffect(() => {
    try {
      localStorage.removeItem("theme");
      document.cookie = "theme=;Max-Age=-1;path=/";
      document.documentElement.classList.remove("dark");
      document.documentElement.removeAttribute("data-theme");
    } catch {
      // Ignore storage/cookie access errors in restricted browser contexts
    }
  }, []);

  return null;
}
