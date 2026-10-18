"use client";

import { Clock, Check, RotateCcw, X, Sparkles } from "lucide-react";
import React, { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export type AnalogTimePickerProps = {
  name?: string;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (e: { target: { name: string; value: string }; currentTarget?: { name: string; value: string } }) => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  compact?: boolean;
  label?: string;
  ariaLabel?: string;
};

// Converts "HH:mm" to { hour12, minute, isPm }
function parseTimeTo12(timeStr: string | null | undefined): { hour12: number; minute: number; isPm: boolean } {
  if (!timeStr) {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    return {
      hour12: h % 12 === 0 ? 12 : h % 12,
      minute: m,
      isPm: h >= 12,
    };
  }
  const [hStr = "0", mStr = "0"] = timeStr.split(":");
  const h24 = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  return {
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: Math.min(59, Math.max(0, m)),
    isPm: h24 >= 12,
  };
}

// Converts { hour12, minute, isPm } back to "HH:mm" (24-hour string)
function formatTo24(hour12: number, minute: number, isPm: boolean): string {
  let h24 = hour12 % 12;
  if (isPm) h24 += 12;
  const hh = String(h24).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

const emptySubscribe = () => () => {};

export default function AnalogTimePicker({
  name,
  value: controlledValue,
  defaultValue,
  onChange,
  onValueChange,
  disabled = false,
  required = false,
  id: propId,
  className = "",
  placeholder = "--:--",
  compact = false,
  label,
  ariaLabel,
}: AnalogTimePickerProps) {
  const generatedId = useId();
  const id = propId || generatedId;

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isControlled = controlledValue !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState<string>(() => defaultValue ?? "");
  const activeValue = (isControlled ? controlledValue : uncontrolledValue) ?? "";

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"hours" | "minutes">("hours");
  const [draftTime, setDraftTime] = useState<string>("");

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const clockFaceRef = useRef<HTMLDivElement | null>(null);

  // Derive current hour, minute, AM/PM from draftTime (when modal open) or activeValue
  const { hour12, minute, isPm } = useMemo(() => {
    return parseTimeTo12(isOpen ? draftTime : activeValue);
  }, [isOpen, draftTime, activeValue]);

  const handleOpen = () => {
    if (disabled) return;
    const initial = activeValue || formatTo24(
      new Date().getHours() % 12 || 12,
      new Date().getMinutes(),
      new Date().getHours() >= 12
    );
    setDraftTime(initial);
    setMode("hours");
    setIsOpen(true);
  };

  const commitTime = (formatted: string) => {
    setDraftTime(formatted);
    if (!isControlled) {
      setUncontrolledValue(formatted);
    }
    onValueChange?.(formatted);
    onChange?.({
      target: { name: name || "", value: formatted },
      currentTarget: { name: name || "", value: formatted },
    });
  };

  const handleSelectHour = (h: number) => {
    const newFormatted = formatTo24(h, minute, isPm);
    commitTime(newFormatted);
    // Smooth auto-transition to minute selection
    window.setTimeout(() => {
      setMode("minutes");
    }, 220);
  };

  const handleSelectMinute = (m: number) => {
    const newFormatted = formatTo24(hour12, m, isPm);
    commitTime(newFormatted);
  };

  const handleToggleAmPm = (pm: boolean) => {
    const newFormatted = formatTo24(hour12, minute, pm);
    commitTime(newFormatted);
  };

  const handleSetNow = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    commitTime(formatted);
    setIsOpen(false);
  };

  const handleClear = () => {
    setDraftTime("");
    if (!isControlled) {
      setUncontrolledValue("");
    }
    onValueChange?.("");
    onChange?.({
      target: { name: name || "", value: "" },
      currentTarget: { name: name || "", value: "" },
    });
    setIsOpen(false);
  };

  // Luxury Glassmorphic Dial Geometry
  const clockSize = 250;
  const center = clockSize / 2; // 125
  const radius = 90; // distance from center to number centers

  // Angle for the active clock needle
  const currentHandAngle = useMemo(() => {
    if (mode === "hours") {
      return (hour12 % 12) * 30; // 360 / 12 = 30 deg
    }
    return minute * 6; // 360 / 60 = 6 deg
  }, [mode, hour12, minute]);

  const handRad = (currentHandAngle * Math.PI) / 180;
  const handTipX = center + radius * Math.sin(handRad);
  const handTipY = center - radius * Math.cos(handRad);

  // Handle pointer / touch click anywhere on clock face
  const handleFaceClick = (clientX: number, clientY: number) => {
    if (!clockFaceRef.current) return;
    const rect = clockFaceRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;

    if (mode === "hours") {
      const h = Math.round(deg / 30) % 12 || 12;
      handleSelectHour(h);
    } else {
      const m = Math.round(deg / 6) % 60;
      handleSelectMinute(m);
    }
  };

  const displayTime = activeValue;

  return (
    <div className={`relative inline-block w-full ${compact ? "min-w-0" : ""}`}>
      {/* Hidden input ensuring zero breakage for Server Actions & native FormData */}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={activeValue}
          required={required}
          id={`${id}-hidden`}
        />
      ) : null}

      {/* Trigger Button replacing native scroll drums */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={handleOpen}
        aria-label={ariaLabel || label || "Select time"}
        className={
          className ||
          (compact
            ? "flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-border/80 bg-surface/90 px-1.5 text-xs font-bold text-foreground outline-none transition-all hover:border-emerald-500/50 hover:shadow-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-50"
            : "flex h-10 w-full items-center justify-between gap-2.5 rounded-xl border border-border bg-surface/90 px-3.5 text-sm font-semibold text-foreground outline-none transition-all hover:border-emerald-500/50 hover:shadow-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50")
        }
      >
        <span className="flex items-center gap-2 truncate">
          <Clock className={compact ? "size-3 shrink-0 text-muted" : "size-4 shrink-0 text-muted"} />
          <span className={!displayTime ? "text-muted font-normal" : "font-extrabold tracking-wide"}>
            {displayTime || placeholder}
          </span>
        </span>
      </button>

      {/* Glassmorphic Analogue Clock Modal via Portal */}
      {isOpen && isClient
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Ultra-frosted deep glass backdrop */}
              <div
                className="fixed inset-0 bg-slate-950/65 backdrop-blur-md transition-opacity duration-300"
                onClick={() => setIsOpen(false)}
              />

              {/* Glassmorphic Time Picker Dialog Card */}
              <div
                className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-[28px] border border-white/15 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-950/90 p-5 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-2xl ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Decorative Ambient Glass Light Blobs */}
                <div className="pointer-events-none absolute -left-12 -top-12 size-44 rounded-full bg-emerald-500/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-12 -right-12 size-44 rounded-full bg-teal-500/15 blur-3xl" />

                {/* Top Glass Header */}
                <div className="relative flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                      <Clock className="size-3.5 text-emerald-400" />
                    </div>
                    <span className="text-[11px] font-black tracking-widest uppercase text-slate-300">
                      Time Picker
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 backdrop-blur-xs transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                {/* Glassmorphic Digital Time & AM/PM Capsule */}
                <div className="relative my-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] backdrop-blur-md">
                  <div className="flex items-center gap-1.5">
                    {/* Hour Display Glass Pill */}
                    <button
                      type="button"
                      onClick={() => setMode("hours")}
                      className={`rounded-xl px-3 py-1 font-mono text-3xl font-black transition-all ${
                        mode === "hours"
                          ? "border border-emerald-400/60 bg-gradient-to-b from-emerald-500/30 to-emerald-600/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)] scale-105"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      {String(hour12).padStart(2, "0")}
                    </button>

                    <span className="text-2xl font-black text-slate-500 animate-pulse">:</span>

                    {/* Minute Display Glass Pill */}
                    <button
                      type="button"
                      onClick={() => setMode("minutes")}
                      className={`rounded-xl px-3 py-1 font-mono text-3xl font-black transition-all ${
                        mode === "minutes"
                          ? "border border-emerald-400/60 bg-gradient-to-b from-emerald-500/30 to-emerald-600/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)] scale-105"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      {String(minute).padStart(2, "0")}
                    </button>
                  </div>

                  {/* AM / PM Segmented Switch */}
                  <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/40 p-1 text-[11px] font-black">
                    <button
                      type="button"
                      onClick={() => handleToggleAmPm(false)}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        !isPm
                          ? "bg-gradient-to-b from-emerald-400 to-emerald-500 text-slate-950 shadow-[0_0_14px_rgba(52,211,153,0.5)]"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAmPm(true)}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        isPm
                          ? "bg-gradient-to-b from-emerald-400 to-emerald-500 text-slate-950 shadow-[0_0_14px_rgba(52,211,153,0.5)]"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>

                {/* Subtitle / Mode Indicator */}
                <div className="mb-2 flex items-center justify-center gap-1.5 text-center">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-0.5 text-[11px] font-medium text-slate-300/90 backdrop-blur-xs">
                    <Sparkles className="size-3 text-emerald-400" />
                    {mode === "hours" ? "Tap an hour on the dial" : "Tap minutes on the dial"}
                  </span>
                </div>

                {/* Circular Glassmorphic Dial */}
                <div className="relative flex justify-center py-2">
                  <div
                    ref={clockFaceRef}
                    onClick={(e) => handleFaceClick(e.clientX, e.clientY)}
                    className="relative size-[250px] select-none rounded-full border border-white/15 bg-gradient-to-b from-white/[0.07] via-white/[0.02] to-black/50 shadow-[inset_0_2px_18px_rgba(0,0,0,0.7),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl cursor-pointer"
                  >
                    {/* Concentric Decorative Hairline Rings */}
                    <div className="absolute inset-4 rounded-full border border-white/[0.06] pointer-events-none" />
                    <div className="absolute inset-16 rounded-full border border-white/[0.04] pointer-events-none" />

                    {/* SVG Needle & Glass Lens Tip */}
                    <svg
                      className="absolute inset-0 size-full pointer-events-none z-10"
                      viewBox={`0 0 ${clockSize} ${clockSize}`}
                    >
                      <defs>
                        <linearGradient id="needleGlow" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.95" />
                        </linearGradient>
                        <filter id="lensGlow" x="-50%" y="-50%" width="200%" height="200%">
                          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#34d399" floodOpacity="0.6" />
                        </filter>
                      </defs>

                      {/* Needle Stem */}
                      <line
                        x1={center}
                        y1={center}
                        x2={handTipX}
                        y2={handTipY}
                        stroke="url(#needleGlow)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />

                      {/* Frosted Lens Tip Target */}
                      <circle
                        cx={handTipX}
                        cy={handTipY}
                        r="17"
                        fill="rgba(16, 185, 129, 0.2)"
                        stroke="#34d399"
                        strokeWidth="2"
                        filter="url(#lensGlow)"
                      />
                      <circle cx={handTipX} cy={handTipY} r="3" fill="#6ee7b7" />
                    </svg>

                    {/* Center Metallic Emerald Jewel Pivot */}
                    <div className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-600 ring-2 ring-slate-950 shadow-[0_0_14px_#34d399] z-30 pointer-events-none" />

                    {/* Render Dial Numbers */}
                    {mode === "hours"
                      ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
                          const angleRad = (h * 30 * Math.PI) / 180;
                          const x = center + radius * Math.sin(angleRad);
                          const y = center - radius * Math.cos(angleRad);
                          const isSelected = hour12 === h;

                          return (
                            <button
                              key={`hour-${h}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectHour(h);
                              }}
                              style={{
                                left: `${x}px`,
                                top: `${y}px`,
                              }}
                              className={`absolute size-8.5 -translate-x-1/2 -translate-y-1/2 rounded-full text-xs transition-all z-20 flex items-center justify-center ${
                                isSelected
                                  ? "font-black text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                                  : "font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              {h}
                            </button>
                          );
                        })
                      : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                          const angleRad = (m * 6 * Math.PI) / 180;
                          const x = center + radius * Math.sin(angleRad);
                          const y = center - radius * Math.cos(angleRad);
                          const isSelected = minute === m;

                          return (
                            <button
                              key={`minute-${m}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectMinute(m);
                              }}
                              style={{
                                left: `${x}px`,
                                top: `${y}px`,
                              }}
                              className={`absolute size-8.5 -translate-x-1/2 -translate-y-1/2 rounded-full text-xs transition-all z-20 flex items-center justify-center ${
                                isSelected
                                  ? "font-black text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                                  : "font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              {String(m).padStart(2, "0")}
                            </button>
                          );
                        })}

                    {/* Minute small precision pips */}
                    {mode === "minutes" &&
                      Array.from({ length: 60 }).map((_, i) => {
                        if (i % 5 === 0) return null; // Already rendered as major numbers
                        const dotRad = (i * 6 * Math.PI) / 180;
                        const x = center + radius * Math.sin(dotRad);
                        const y = center - radius * Math.cos(dotRad);
                        return (
                          <div
                            key={`tick-${i}`}
                            style={{
                              left: `${x}px`,
                              top: `${y}px`,
                            }}
                            className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25 pointer-events-none"
                          />
                        );
                      })}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="relative mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSetNow}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-slate-300 backdrop-blur-xs transition-all hover:bg-white/15 hover:text-white"
                    >
                      <RotateCcw className="size-3 text-emerald-400" />
                      Now
                    </button>
                    {!required ? (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-xl px-2.5 py-1.5 font-semibold text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-2 font-black text-slate-950 shadow-[0_4px_20px_rgba(16,185,129,0.4)] transition-all hover:from-emerald-400 hover:to-teal-300 hover:shadow-[0_4px_24px_rgba(16,185,129,0.5)] active:scale-95"
                  >
                    <Check className="size-3.5 stroke-[3]" />
                    Done
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
