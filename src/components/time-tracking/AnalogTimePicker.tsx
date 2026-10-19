"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Check, Clock, RotateCcw, Sparkles, X } from "lucide-react";

export type AnalogTimePickerProps = {
  name?: string;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (e: {
    target: { name: string; value: string };
    currentTarget?: { name: string; value: string };
  }) => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  compact?: boolean;
  label?: string;
  ariaLabel?: string;
  inline?: boolean;
  onClose?: () => void;
};

// Converts "HH:mm" to { hour12, minute, isPm }
function parseTimeTo12(timeStr: string | null | undefined): {
  hour12: number;
  minute: number;
  isPm: boolean;
} {
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

// Converts { hour12, minute, isPm } to "HH:mm"
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
  inline = false,
  onClose,
}: AnalogTimePickerProps) {
  const generatedId = useId();
  const id = propId || generatedId;

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isControlled = controlledValue !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState<string>(
    () => defaultValue ?? ""
  );
  const activeValue = (isControlled ? controlledValue : uncontrolledValue) ?? "";

  const [isOpen, setIsOpen] = useState(inline);
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const [isDragging, setIsDragging] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSwitchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Parsed initial state
  const initialParsed = useMemo(() => parseTimeTo12(activeValue), [activeValue]);
  const [draftHour, setDraftHour] = useState(initialParsed.hour12);
  const [draftMinute, setDraftMinute] = useState(initialParsed.minute);
  const [draftPm, setDraftPm] = useState(initialParsed.isPm);

  // Sync draft state when active value changes
  useEffect(() => {
    const parsed = parseTimeTo12(activeValue);
    setDraftHour(parsed.hour12);
    setDraftMinute(parsed.minute);
    setDraftPm(parsed.isPm);
  }, [activeValue]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    const parsed = parseTimeTo12(activeValue);
    setDraftHour(parsed.hour12);
    setDraftMinute(parsed.minute);
    setDraftPm(parsed.isPm);
    setMode("hour");
    setIsOpen(true);
  };

  const handleClose = useCallback(() => {
    if (!inline) {
      setIsOpen(false);
    }
    onClose?.();
  }, [inline, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || inline) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, inline, handleClose]);

  // Commit helper
  const commitTime = useCallback(
    (h12: number, m: number, pm: boolean, closeOnCommit = false) => {
      const formatted = formatTo24(h12, m, pm);
      if (!isControlled) {
        setUncontrolledValue(formatted);
      }
      onValueChange?.(formatted);
      onChange?.({
        target: { name: name || "", value: formatted },
        currentTarget: { name: name || "", value: formatted },
      });
      if (closeOnCommit && !inline) {
        handleClose();
      }
    },
    [isControlled, name, onChange, onValueChange, inline, handleClose]
  );

  const handleSelectHour = useCallback(
    (h: number) => {
      setDraftHour(h);
      commitTime(h, draftMinute, draftPm, false);
    },
    [draftMinute, draftPm, commitTime]
  );

  const handleSelectMinute = useCallback(
    (m: number) => {
      setDraftMinute(m);
      commitTime(draftHour, m, draftPm, false);
    },
    [draftHour, draftPm, commitTime]
  );

  const handleToggleAmPm = useCallback(
    (pm: boolean) => {
      setDraftPm(pm);
      commitTime(draftHour, draftMinute, pm, false);
    },
    [draftHour, draftMinute, commitTime]
  );

  const handleSetNow = useCallback(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const isNowPm = h >= 12;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    setDraftHour(h12);
    setDraftMinute(m);
    setDraftPm(isNowPm);
    commitTime(h12, m, isNowPm, false);
    showToast(
      `Set to current time: ${String(h12).padStart(2, "0")}:${String(m).padStart(
        2,
        "0"
      )} ${isNowPm ? "PM" : "AM"}`
    );
  }, [commitTime, showToast]);

  const handleClear = useCallback(() => {
    setDraftHour(12);
    setDraftMinute(0);
    setDraftPm(false);
    if (!isControlled) {
      setUncontrolledValue("");
    }
    onValueChange?.("");
    onChange?.({
      target: { name: name || "", value: "" },
      currentTarget: { name: name || "", value: "" },
    });
    showToast("Time cleared");
    if (!inline) {
      handleClose();
    }
  }, [isControlled, name, onChange, onValueChange, inline, handleClose, showToast]);

  const handleDone = useCallback(() => {
    commitTime(draftHour, draftMinute, draftPm, true);
    showToast(
      `Selected: ${String(draftHour).padStart(2, "0")}:${String(
        draftMinute
      ).padStart(2, "0")} ${draftPm ? "PM" : "AM"}`
    );
  }, [draftHour, draftMinute, draftPm, commitTime, showToast]);

  // Pointer position calculation on the dial
  const handlePointerAt = useCallback(
    (clientX: number, clientY: number, autoSwitch = false) => {
      if (!dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = clientX - centerX;
      const dy = clientY - centerY;

      let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      if (mode === "hour") {
        let hour = Math.round(angle / 30);
        if (hour === 0) hour = 12;
        handleSelectHour(hour);

        if (autoSwitch) {
          if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
          autoSwitchTimerRef.current = setTimeout(() => {
            setMode("minute");
          }, 300);
        }
      } else {
        let min = Math.round(angle / 6);
        if (min === 60) min = 0;
        handleSelectMinute(min);
      }
    },
    [mode, handleSelectHour, handleSelectMinute]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    handlePointerAt(e.clientX, e.clientY, false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    handlePointerAt(e.clientX, e.clientY, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      handlePointerAt(e.clientX, e.clientY, mode === "hour");
    }
  };

  // Dial Geometry (viewBox: 240 x 240)
  const DIAL_RADIUS = 120;
  const NUM_RADIUS = 82;

  const currentAngleDeg = useMemo(() => {
    if (mode === "hour") {
      return (draftHour % 12) * 30;
    }
    return draftMinute * 6;
  }, [mode, draftHour, draftMinute]);

  const handRad = (currentAngleDeg * Math.PI) / 180;
  const targetX = DIAL_RADIUS + NUM_RADIUS * Math.sin(handRad);
  const targetY = DIAL_RADIUS - NUM_RADIUS * Math.cos(handRad);

  const displayTime = activeValue;

  // The Harmonized Card Widget Content
  const pickerCard = (
    <div
      className="harmonized-card relative w-full max-w-[370px] sm:max-w-[390px] rounded-[30px] sm:rounded-[34px] p-5 sm:p-6 text-slate-800 shadow-2xl transition-all duration-300"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl flex items-center justify-center border border-primary/20 bg-primary/10 shadow-2xs">
            <Clock className="size-4 text-primary stroke-[2.4]" />
          </div>
          <div>
            <span className="text-xs font-black tracking-[0.16em] uppercase text-foreground block">
              Time Picker
            </span>
            <span className="text-[10px] font-medium text-muted">
              Select Hours &amp; Minutes
            </span>
          </div>
        </div>

        {!inline ? (
          <button
            type="button"
            onClick={handleClose}
            className="size-8 rounded-full flex items-center justify-center border border-slate-200 bg-white/70 hover:bg-white text-slate-500 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer"
            aria-label="Close time picker"
          >
            <X className="size-4 stroke-[2.5]" />
          </button>
        ) : null}
      </div>

      {/* Digital Display Well */}
      <div className="digital-well rounded-2xl p-3 sm:p-3.5 mt-4 flex items-center justify-between shadow-soft">
        {/* Time Digits */}
        <div className="flex items-center gap-2">
          {/* Hour Box */}
          <button
            type="button"
            onClick={() => setMode("hour")}
            className={`w-[68px] sm:w-[72px] h-[60px] sm:h-[64px] rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-black font-mono tracking-tight transition-all cursor-pointer ${
              mode === "hour"
                ? "digit-box-active scale-102"
                : "text-slate-400 hover:text-slate-700 border-2 border-transparent"
            }`}
          >
            <span>{String(draftHour).padStart(2, "0")}</span>
          </button>

          <span className="text-2xl font-bold text-slate-400 select-none pb-1 animate-pulse">
            :
          </span>

          {/* Minute Box */}
          <button
            type="button"
            onClick={() => setMode("minute")}
            className={`w-[68px] sm:w-[72px] h-[60px] sm:h-[64px] rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-black font-mono tracking-tight transition-all cursor-pointer ${
              mode === "minute"
                ? "digit-box-active scale-102"
                : "text-slate-400 hover:text-slate-700 border-2 border-transparent"
            }`}
          >
            <span>{String(draftMinute).padStart(2, "0")}</span>
          </button>
        </div>

        {/* AM / PM Selector Switch */}
        <div className="period-switch flex flex-col p-1 rounded-xl gap-1 w-14 shadow-inner">
          <button
            type="button"
            onClick={() => handleToggleAmPm(false)}
            className={`py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
              !draftPm
                ? "period-pill-active"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => handleToggleAmPm(true)}
            className={`py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
              draftPm
                ? "period-pill-active"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {/* Mode Hint Pill */}
      <div className="flex justify-center mt-4 mb-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-slate-200/90 text-[11px] font-bold text-slate-600 shadow-2xs backdrop-blur-xs">
          <Sparkles className="size-3.5 text-primary animate-spin" style={{ animationDuration: "8s" }} />
          <span>
            {mode === "hour"
              ? "Tap an hour on the dial"
              : "Tap or drag minutes on the dial"}
          </span>
        </div>
      </div>

      {/* Analog Dial Stage */}
      <div className="flex justify-center my-2">
        <div
          ref={dialRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="dial-plate relative size-[230px] sm:size-[240px] rounded-full flex items-center justify-center select-none shadow-md touch-none"
        >
          {/* Outer Track Ring */}
          <div className="absolute inset-4 rounded-full border border-slate-300/40 pointer-events-none" />

          {/* Concentric Inner Dashed Track */}
          <div className="absolute inset-14 dial-ring-inner rounded-full pointer-events-none" />

          {/* Render Numbers on Dial */}
          <div className="absolute inset-0 pointer-events-none">
            {mode === "hour"
              ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
                  const rad = (h * 30 * Math.PI) / 180;
                  const xPct = ((DIAL_RADIUS + NUM_RADIUS * Math.sin(rad)) / (DIAL_RADIUS * 2)) * 100;
                  const yPct = ((DIAL_RADIUS - NUM_RADIUS * Math.cos(rad)) / (DIAL_RADIUS * 2)) * 100;
                  const isMatch = draftHour === h;

                  return (
                    <div
                      key={`hour-num-${h}`}
                      style={{ left: `${xPct}%`, top: `${yPct}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 size-8 flex items-center justify-center text-xs transition-all pointer-events-auto ${
                        isMatch
                          ? "text-primary font-black scale-125 z-20"
                          : "text-slate-600 font-bold hover:text-slate-900"
                      }`}
                    >
                      {h}
                    </div>
                  );
                })
              : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                  const rad = (m * 6 * Math.PI) / 180;
                  const xPct = ((DIAL_RADIUS + NUM_RADIUS * Math.sin(rad)) / (DIAL_RADIUS * 2)) * 100;
                  const yPct = ((DIAL_RADIUS - NUM_RADIUS * Math.cos(rad)) / (DIAL_RADIUS * 2)) * 100;
                  const isMatch = draftMinute === m;

                  return (
                    <div
                      key={`min-num-${m}`}
                      style={{ left: `${xPct}%`, top: `${yPct}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 size-8 flex items-center justify-center text-xs transition-all pointer-events-auto ${
                        isMatch
                          ? "text-primary font-black scale-125 z-20"
                          : "text-slate-600 font-bold hover:text-slate-900"
                      }`}
                    >
                      {String(m).padStart(2, "0")}
                    </div>
                  );
                })}

            {/* Precision Minute Minor Tick Dots */}
            {mode === "minute" &&
              Array.from({ length: 60 }).map((_, i) => {
                if (i % 5 === 0) return null;
                const rad = (i * 6 * Math.PI) / 180;
                const xPct = ((DIAL_RADIUS + NUM_RADIUS * Math.sin(rad)) / (DIAL_RADIUS * 2)) * 100;
                const yPct = ((DIAL_RADIUS - NUM_RADIUS * Math.cos(rad)) / (DIAL_RADIUS * 2)) * 100;
                return (
                  <div
                    key={`tick-${i}`}
                    style={{ left: `${xPct}%`, top: `${yPct}%` }}
                    className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 pointer-events-none"
                  />
                );
              })}
          </div>

          {/* SVG Clock Hand & Indicator */}
          <svg
            className="absolute inset-0 size-full pointer-events-none overflow-visible z-10"
            viewBox="0 0 240 240"
          >
            <defs>
              <linearGradient id="auroraHandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2E9B5F" />
                <stop offset="100%" stopColor="#48BB78" />
              </linearGradient>
            </defs>

            {/* Hand connection stem */}
            <line
              x1={DIAL_RADIUS}
              y1={DIAL_RADIUS}
              x2={targetX}
              y2={targetY}
              stroke="url(#auroraHandGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Selected node halo and outer ring */}
            <circle
              cx={targetX}
              cy={targetY}
              r="17"
              fill="rgba(46, 155, 95, 0.16)"
              stroke="#2E9B5F"
              strokeWidth="2"
              className="selected-node-ring"
            />
            <circle cx={targetX} cy={targetY} r="3" fill="#2E9B5F" />
          </svg>

          {/* Center Glowing Pivot Cap */}
          <div className="dial-pivot absolute size-4 rounded-full z-20 pointer-events-none" />
          <div className="absolute size-8 rounded-full bg-primary/20 blur-[5px] pointer-events-none" />
        </div>
      </div>

      {/* Action Bar Footer */}
      <div className="pt-4 mt-3 border-t border-slate-200/60 flex items-center justify-between">
        {/* Quick Shortcuts */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSetNow}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 px-3 py-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="size-3.5 text-primary" />
            <span>Now</span>
          </button>

          {!required ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors px-2 py-1.5 cursor-pointer"
            >
              Clear
            </button>
          ) : null}
        </div>

        {/* Done Button */}
        <button
          type="button"
          onClick={handleDone}
          className="btn-aurora-done flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs font-extrabold text-white tracking-wide shadow-md cursor-pointer"
        >
          <Check className="size-4 text-white stroke-[3]" />
          <span>Done</span>
        </button>
      </div>

      {/* Toast Notice inside card */}
      {toastMessage ? (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 text-white text-[11px] font-bold shadow-lg backdrop-blur-md animate-in fade-in zoom-in duration-150 z-30">
          <span className="size-1.5 rounded-full bg-primary animate-ping" />
          <span>{toastMessage}</span>
        </div>
      ) : null}
    </div>
  );

  // If inline, render directly without trigger or portal
  if (inline) {
    return (
      <div className={`relative inline-block ${className}`}>
        {name ? (
          <input
            type="hidden"
            name={name}
            value={activeValue}
            required={required}
            id={`${id}-hidden`}
          />
        ) : null}
        {pickerCard}
      </div>
    );
  }

  return (
    <div className={`relative inline-block w-full ${compact ? "min-w-0" : ""}`}>
      {/* Hidden input for Native Forms & Server Actions */}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={activeValue}
          required={required}
          id={`${id}-hidden`}
        />
      ) : null}

      {/* Trigger Button */}
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
            ? "flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface/90 px-2 text-xs font-bold text-foreground outline-none transition-all hover:border-primary/50 hover:shadow-2xs focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50 cursor-pointer"
            : "flex h-10 w-full items-center justify-between gap-2.5 rounded-xl border border-border bg-surface/90 px-3.5 text-sm font-semibold text-foreground outline-none transition-all hover:border-primary/50 hover:shadow-xs focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 cursor-pointer")
        }
      >
        <span className="flex items-center gap-2 truncate">
          <Clock className={compact ? "size-3 shrink-0 text-primary" : "size-4 shrink-0 text-primary"} />
          <span className={!displayTime ? "text-muted font-normal" : "font-extrabold tracking-wide"}>
            {displayTime || placeholder}
          </span>
        </span>
      </button>

      {/* Time Picker Modal via React Portal */}
      {isOpen && isClient
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
            >
              {/* Ultra-frosted Ambient Glass Backdrop */}
              <div
                className="fixed inset-0 bg-slate-950/45 backdrop-blur-md transition-opacity duration-300"
                onClick={handleClose}
              />

              {/* The Dialog Card */}
              <div className="relative z-10 animate-in zoom-in-95 duration-200">
                {pickerCard}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
