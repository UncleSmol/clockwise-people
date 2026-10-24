"use client";

import React, { useState, useEffect, useRef } from "react";
import { useZenMode } from "./ZenModeContext";
import { PALETTES } from "../background/LuminousFluidBackground";
import { Sparkles, Maximize2, Minimize2, Palette, Check } from "lucide-react";

export default function ZenModeTrigger() {
  const {
    isZenMode,
    toggleZenMode,
    paletteIndex,
    setPaletteIndex,
    activeColorConfig,
  } = useZenMode();

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close palette popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard shortcut: Esc to exit Zen Mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isZenMode) {
        toggleZenMode();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isZenMode, toggleZenMode]);

  const currentPalette = PALETTES[paletteIndex] || PALETTES[0];

  return (
    <div
      ref={triggerRef}
      className="hidden sm:flex fixed sm:bottom-6 sm:right-6 z-50 flex-col items-end gap-2.5 pointer-events-auto"
    >
      {/* Simplified Palette Ribbon Popover */}
      {isOpen ? (
        <div className="rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl p-3 shadow-2xl space-y-2.5 w-56 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-slate-700" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                Aura Palette
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              {currentPalette.name}
            </span>
          </div>

          {/* Quick Palette Dot Swatches */}
          <div className="flex items-center justify-between gap-1.5 px-1 py-1">
            {PALETTES.map((p, idx) => {
              const isSelected = idx === paletteIndex;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setPaletteIndex(idx);
                  }}
                  title={p.name}
                  className={`relative size-8 rounded-full transition-all cursor-pointer shadow-xs ${
                    isSelected
                      ? "ring-2 ring-slate-900 ring-offset-2 scale-110 shadow-md"
                      : "opacity-75 hover:opacity-100 hover:scale-105"
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${p.c1}, ${p.c2})`,
                  }}
                >
                  {isSelected ? (
                    <Check className="size-3.5 text-white drop-shadow-md mx-auto" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Zen Toggle in Popover */}
          <button
            type="button"
            onClick={() => {
              toggleZenMode();
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 transition shadow-xs cursor-pointer"
          >
            {isZenMode ? (
              <>
                <Minimize2 className="size-3.5" />
                <span>Exit Zen View</span>
              </>
            ) : (
              <>
                <Maximize2 className="size-3.5" />
                <span>Enter Zen View</span>
              </>
            )}
          </button>
        </div>
      ) : null}

      {/* Main Trigger: Circle icon with "Z" at center pulsating with selected zen mode color */}
      <div className="relative group">
        {/* Pulsating background ring */}
        <span
          className="absolute -inset-1 rounded-full animate-ping opacity-60 pointer-events-none"
          style={{
            backgroundColor: activeColorConfig.glowHex,
            animationDuration: isZenMode ? "2s" : "3s",
          }}
        />

        {/* Glow halo */}
        <span
          className="absolute -inset-0.5 rounded-full blur-xs opacity-70 pointer-events-none transition-all duration-300"
          style={{
            backgroundColor: activeColorConfig.bgHex,
          }}
        />

        {/* The Button */}
        <button
          type="button"
          onClick={() => {
            // Short click toggles Zen Mode
            toggleZenMode();
          }}
          onContextMenu={(e) => {
            // Right click opens palette picker
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }}
          aria-label={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
          title={isZenMode ? "Exit Zen Mode (Click) · Palettes (Right Click)" : "Zen Mode (Click) · Palettes (Right Click)"}
          className="relative size-12 sm:size-14 rounded-full flex items-center justify-center text-white font-black shadow-xl transition-all transform hover:scale-105 active:scale-95 cursor-pointer border border-white/40"
          style={{
            backgroundColor: activeColorConfig.bgHex,
            boxShadow: `0 8px 24px -4px ${activeColorConfig.glowHex}`,
          }}
        >
          {/* Centered 'Z' */}
          <span className="text-xl sm:text-2xl font-black font-sans tracking-tight select-none">
            Z
          </span>

          {/* Mini palette dots indicator badge on edge */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen((prev) => !prev);
            }}
            title="Choose Aura Palette"
            className="absolute -top-1 -right-1 size-5 rounded-full bg-white text-slate-800 shadow-md border border-slate-200 grid place-items-center hover:bg-slate-50 transition-colors"
          >
            <Palette className="size-2.5 text-slate-700" />
          </span>
        </button>
      </div>
    </div>
  );
}
