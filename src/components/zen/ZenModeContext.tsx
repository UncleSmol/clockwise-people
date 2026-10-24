"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ZenTab = "timesheets" | "leave";
export type ZenState =
  | "not_clocked_in"
  | "clocked_in"
  | "on_lunch"
  | "draft"
  | "submitted"
  | "leave";

export interface ZenStateColorConfig {
  state: ZenState;
  colorName: string;
  bgHex: string;
  borderHex: string;
  glowHex: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}

export const ZEN_STATE_COLORS: Record<ZenState, ZenStateColorConfig> = {
  not_clocked_in: {
    state: "not_clocked_in",
    colorName: "Slate Charcoal",
    bgHex: "#1e293b",
    borderHex: "rgba(255, 255, 255, 0.18)",
    glowHex: "rgba(30, 41, 59, 0.4)",
    pillBg: "rgba(30, 41, 59, 0.8)",
    pillText: "#ffffff",
    pillBorder: "rgba(255, 255, 255, 0.15)",
  },
  clocked_in: {
    state: "clocked_in",
    colorName: "Emerald Forest",
    bgHex: "#047857",
    borderHex: "rgba(255, 255, 255, 0.22)",
    glowHex: "rgba(4, 120, 87, 0.45)",
    pillBg: "rgba(16, 185, 129, 0.15)",
    pillText: "#047857",
    pillBorder: "rgba(16, 185, 129, 0.3)",
  },
  on_lunch: {
    state: "on_lunch",
    colorName: "Warm Amber",
    bgHex: "#ea580c",
    borderHex: "rgba(255, 255, 255, 0.22)",
    glowHex: "rgba(234, 88, 12, 0.45)",
    pillBg: "rgba(249, 115, 22, 0.15)",
    pillText: "#c2410c",
    pillBorder: "rgba(249, 115, 22, 0.3)",
  },
  draft: {
    state: "draft",
    colorName: "Electric Indigo",
    bgHex: "#2563eb",
    borderHex: "rgba(255, 255, 255, 0.22)",
    glowHex: "rgba(37, 99, 235, 0.45)",
    pillBg: "rgba(59, 130, 246, 0.15)",
    pillText: "#1d4ed8",
    pillBorder: "rgba(59, 130, 246, 0.3)",
  },
  submitted: {
    state: "submitted",
    colorName: "Teal Breeze",
    bgHex: "#0d9488",
    borderHex: "rgba(255, 255, 255, 0.22)",
    glowHex: "rgba(13, 148, 136, 0.45)",
    pillBg: "rgba(20, 184, 166, 0.15)",
    pillText: "#0f766e",
    pillBorder: "rgba(20, 184, 166, 0.3)",
  },
  leave: {
    state: "leave",
    colorName: "Royal Orchid",
    bgHex: "#6d28d9",
    borderHex: "rgba(255, 255, 255, 0.22)",
    glowHex: "rgba(109, 40, 217, 0.45)",
    pillBg: "rgba(139, 92, 246, 0.15)",
    pillText: "#6d28d9",
    pillBorder: "rgba(139, 92, 246, 0.3)",
  },
};

interface ZenModeContextValue {
  isZenMode: boolean;
  setIsZenMode: (val: boolean) => void;
  toggleZenMode: () => void;
  zenTab: ZenTab;
  setZenTab: (tab: ZenTab) => void;
  paletteIndex: number;
  setPaletteIndex: (idx: number) => void;
  activeZenState: ZenState;
  setActiveZenState: (state: ZenState) => void;
  activeColorConfig: ZenStateColorConfig;
}

const ZenModeContext = createContext<ZenModeContextValue | null>(null);

const STORAGE_KEY = "clockwise_zen_mode";
const TAB_KEY = "clockwise_zen_tab";
const PALETTE_KEY = "clockwise_fluid_palette";


interface ZenModeProviderProps {
  children: ReactNode;
  initialIsZenMode?: boolean;
  initialZenTab?: ZenTab;
  initialPaletteIndex?: number;
}

export function ZenModeProvider({
  children,
  initialIsZenMode = false,
  initialZenTab = "timesheets",
  initialPaletteIndex = 0,
}: ZenModeProviderProps) {
  const [isZenMode, setIsZenModeState] = useState<boolean>(initialIsZenMode);
  const [zenTab, setZenTabState] = useState<ZenTab>(initialZenTab);
  const [paletteIndex, setPaletteIndexState] = useState<number>(initialPaletteIndex);
  const [activeZenState, setActiveZenState] = useState<ZenState>("not_clocked_in");

  // Sync DOM classes and localStorage in useEffect after client mount (zero hydration error)
  useEffect(() => {
    try {
      const storedZen = localStorage.getItem(STORAGE_KEY);
      const isZen = storedZen !== null ? storedZen === "true" : initialIsZenMode;

      setIsZenModeState(isZen);
      document.cookie = `${STORAGE_KEY}=${isZen}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.classList.toggle("zen-mode", isZen);
      document.body.classList.toggle("zen-mode", isZen);

      const storedTab = localStorage.getItem(TAB_KEY);
      if (storedTab === "leave" || storedTab === "timesheets") {
        setZenTabState(storedTab);
        document.cookie = `${TAB_KEY}=${storedTab}; path=/; max-age=31536000; SameSite=Lax`;
      }

      const storedPalette = localStorage.getItem(PALETTE_KEY);
      if (storedPalette !== null) {
        const palIdx = Number(storedPalette) || 0;
        setPaletteIndexState(palIdx);
        document.cookie = `${PALETTE_KEY}=${palIdx}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {
      // ignore
    }
  }, [initialIsZenMode]);

  const setIsZenMode = useCallback((val: boolean) => {
    setIsZenModeState(val);
    try {
      localStorage.setItem(STORAGE_KEY, String(val));
      document.cookie = `${STORAGE_KEY}=${val}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore
    }
    if (val) {
      document.documentElement.classList.add("zen-mode");
      document.body.classList.add("zen-mode");
    } else {
      document.documentElement.classList.remove("zen-mode");
      document.body.classList.remove("zen-mode");
    }
  }, []);

  const toggleZenMode = useCallback(() => {
    setIsZenModeState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
        document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // ignore
      }
      if (next) {
        document.documentElement.classList.add("zen-mode");
        document.body.classList.add("zen-mode");
      } else {
        document.documentElement.classList.remove("zen-mode");
        document.body.classList.remove("zen-mode");
      }
      return next;
    });
  }, []);

  const setZenTab = useCallback((tab: ZenTab) => {
    setZenTabState(tab);
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // ignore
    }
  }, []);

  const setPaletteIndex = useCallback((idx: number) => {
    setPaletteIndexState(idx);
    try {
      localStorage.setItem(PALETTE_KEY, String(idx));
    } catch {
      // ignore
    }
  }, []);

  // Compute effective state: if tab is leave, color is leave
  const effectiveState = zenTab === "leave" ? "leave" : activeZenState;
  const activeColorConfig = ZEN_STATE_COLORS[effectiveState] || ZEN_STATE_COLORS.not_clocked_in;

  return (
    <ZenModeContext.Provider
      value={{
        isZenMode,
        setIsZenMode,
        toggleZenMode,
        zenTab,
        setZenTab,
        paletteIndex,
        setPaletteIndex,
        activeZenState,
        setActiveZenState,
        activeColorConfig,
      }}
    >
      {children}
    </ZenModeContext.Provider>
  );
}

export function useZenMode() {
  const ctx = useContext(ZenModeContext);
  if (!ctx) {
    // Return graceful fallback if used outside provider
    return {
      isZenMode: false,
      setIsZenMode: () => {},
      toggleZenMode: () => {},
      zenTab: "timesheets" as ZenTab,
      setZenTab: () => {},
      paletteIndex: 0,
      setPaletteIndex: () => {},
      activeZenState: "not_clocked_in" as ZenState,
      setActiveZenState: () => {},
      activeColorConfig: ZEN_STATE_COLORS.not_clocked_in,
    };
  }
  return ctx;
}
