"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, Play, Pause, Maximize2, X, Palette } from "lucide-react";

export interface PaletteConfig {
  name: string;
  c1: string;
  c2: string;
  colors: Array<{ r: number; g: number; b: number; a: number }>;
}

export const PALETTES: PaletteConfig[] = [
  {
    name: "Sunset Aura",
    c1: "rgba(255, 65, 108, 0.85)", // Bold Neon Pink
    c2: "rgba(255, 145, 0, 0.85)", // Vivid Orange Amber
    colors: [
      { r: 255, g: 65, b: 108, a: 0.9 }, // Hot Coral
      { r: 255, g: 154, b: 68, a: 0.9 }, // Golden Tangerine
      { r: 168, g: 85, b: 247, a: 0.85 }, // Royal Purple
      { r: 236, g: 72, b: 153, a: 0.85 }, // Magenta
    ],
  },
  {
    name: "Cyber Teal & Lime",
    c1: "rgba(0, 210, 255, 0.85)",
    c2: "rgba(58, 123, 213, 0.85)",
    colors: [
      { r: 0, g: 210, b: 255, a: 0.9 }, // Bright Cyan
      { r: 59, g: 130, b: 246, a: 0.9 }, // Electric Blue
      { r: 16, g: 185, b: 129, a: 0.85 }, // Emerald Mint
      { r: 139, g: 92, b: 246, a: 0.85 }, // Violet
    ],
  },
  {
    name: "Electric Grape",
    c1: "rgba(192, 38, 211, 0.85)",
    c2: "rgba(99, 102, 241, 0.85)",
    colors: [
      { r: 192, g: 38, b: 211, a: 0.9 }, // Orchid Fuchsia
      { r: 99, g: 102, b: 241, a: 0.9 }, // Electric Indigo
      { r: 244, g: 63, b: 94, a: 0.85 }, // Strawberry
      { r: 79, g: 70, b: 229, a: 0.85 }, // Deep Purple
    ],
  },
  {
    name: "Solar Flare",
    c1: "rgba(234, 88, 12, 0.85)",
    c2: "rgba(234, 179, 8, 0.85)",
    colors: [
      { r: 249, g: 115, b: 22, a: 0.95 }, // Vivid Orange
      { r: 234, g: 179, b: 8, a: 0.9 }, // Sunflower Yellow
      { r: 239, g: 68, b: 68, a: 0.9 }, // Flame Red
      { r: 217, g: 70, b: 239, a: 0.8 }, // Pink Rose
    ],
  },
  {
    name: "Clockwise Emerald",
    c1: "rgba(46, 155, 95, 0.85)", // Primary Emerald
    c2: "rgba(250, 100, 0, 0.85)", // Accent Coral
    colors: [
      { r: 46, g: 155, b: 95, a: 0.9 }, // Primary Emerald
      { r: 72, g: 187, b: 120, a: 0.85 }, // Light Emerald
      { r: 250, g: 100, b: 0, a: 0.85 }, // Coral
      { r: 108, g: 92, b: 231, a: 0.85 }, // Iris
    ],
  },
];

class FluidBlob {
  color: { r: number; g: number; b: number; a: number };
  index: number;
  x = 0;
  y = 0;
  baseRadius = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  angleSpeed = 0;
  deformSpeed = 0;
  deformAmount = 0;
  time = 0;

  constructor(color: { r: number; g: number; b: number; a: number }, index: number, w: number, h: number) {
    this.color = color;
    this.index = index;
    this.reset(w, h);
  }

  reset(w: number, h: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.baseRadius = Math.min(w, h) * (0.28 + Math.random() * 0.14);
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vy = (Math.random() - 0.5) * 1.5;
    this.angle = Math.random() * Math.PI * 2;
    this.angleSpeed = 0.008 + Math.random() * 0.012;
    this.deformSpeed = 0.015 + Math.random() * 0.02;
    this.deformAmount = 0.25 + Math.random() * 0.2;
    this.time = Math.random() * 100;
  }

  update(isPlaying: boolean, w: number, h: number, mouse: { x: number; y: number }) {
    if (!isPlaying) return;

    this.time += this.deformSpeed;
    this.angle += this.angleSpeed;

    this.x += this.vx + Math.cos(this.angle) * 1.2;
    this.y += this.vy + Math.sin(this.angle) * 1.2;

    // Soft screen bounce
    const pad = this.baseRadius * 0.5;
    if (this.x < -pad) this.vx = Math.abs(this.vx);
    if (this.x > w + pad) this.vx = -Math.abs(this.vx);
    if (this.y < -pad) this.vy = Math.abs(this.vy);
    if (this.y > h + pad) this.vy = -Math.abs(this.vy);

    // Interaction with mouse cursor
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 320 && dist > 0) {
      const force = (320 - dist) / 320;
      this.x -= (dx / dist) * force * 3;
      this.y -= (dy / dist) * force * 3;
    }
  }

  draw(context: CanvasRenderingContext2D) {
    const currentRadius = this.baseRadius * (1 + Math.sin(this.time) * this.deformAmount);

    // Multi-stop radial gradient with sharp falloff to keep punch on white
    const gradient = context.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
      this.y,
      currentRadius
    );

    const { r, g, b, a } = this.color;
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a})`);
    gradient.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${a * 0.75})`);
    gradient.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, ${a * 0.25})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    context.save();
    context.fillStyle = gradient;
    context.beginPath();

    // 8-point squishing polygon for fluid blob outline
    const points = 8;
    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * Math.PI * 2;
      const radialOffset = Math.sin(this.time * 2 + i * 1.5) * (this.baseRadius * 0.18);
      const r_actual = currentRadius + radialOffset;
      const px = this.x + Math.cos(theta) * r_actual;
      const py = this.y + Math.sin(theta) * r_actual;

      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }

    context.closePath();
    context.fill();
    context.restore();
  }
}

class FollowerBlob extends FluidBlob {
  constructor(color: { r: number; g: number; b: number; a: number }, w: number, h: number) {
    super(color, 99, w, h);
    this.baseRadius = Math.min(w, h) * 0.2;
  }

  override update(_isPlaying: boolean, _w: number, _h: number, mouse: { x: number; y: number }) {
    this.x += (mouse.x - this.x) * 0.1;
    this.y += (mouse.y - this.y) * 0.1;
    this.time += 0.03;
  }
}

export default function LuminousFluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobsRef = useRef<FluidBlob[]>([]);
  const animIdRef = useRef<number | null>(null);

  const [paletteIndex, setPaletteIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const mouseRef = useRef({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 500,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 500,
    tx: typeof window !== "undefined" ? window.innerWidth / 2 : 500,
    ty: typeof window !== "undefined" ? window.innerHeight / 2 : 500,
  });

  // Load saved preference from localStorage
  useEffect(() => {
    try {
      const savedPalette = localStorage.getItem("clockwise_aura_palette");
      if (savedPalette !== null) {
        const idx = parseInt(savedPalette, 10);
        if (!isNaN(idx) && idx >= 0 && idx < PALETTES.length) {
          setPaletteIndex(idx);
        }
      }
      const savedMotion = localStorage.getItem("clockwise_aura_motion");
      if (savedMotion !== null) {
        setIsPlaying(savedMotion === "true");
      }
    } catch {
      // Ignore localStorage access issues
    }
  }, []);

  // Update CSS Variables and Blobs whenever Palette changes
  const applyPalette = useCallback((idx: number) => {
    setPaletteIndex(idx);
    try {
      localStorage.setItem("clockwise_aura_palette", idx.toString());
    } catch {
      // ignore
    }

    const palette = PALETTES[idx];
    document.documentElement.style.setProperty("--c1", palette.c1);
    document.documentElement.style.setProperty("--c2", palette.c2);

    if (canvasRef.current) {
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;
      const newBlobs: FluidBlob[] = palette.colors.map((c, i) => new FluidBlob(c, i, w, h));
      const cursorColor = palette.colors[0];
      const follower = new FollowerBlob({ ...cursorColor, a: 0.95 }, w, h);
      newBlobs.push(follower);
      blobsRef.current = newBlobs;
    }
  }, []);

  const toggleMotion = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("clockwise_aura_motion", next.toString());
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const enterZen = useCallback(() => {
    setIsZenMode(true);
    setIsControlsOpen(false);
    document.body.classList.add("zen-mode");
  }, []);

  const exitZen = useCallback(() => {
    setIsZenMode(false);
    document.body.classList.remove("zen-mode");
  }, []);

  // Keyboard shortcut: Esc to exit Zen Mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && document.body.classList.contains("zen-mode")) {
        exitZen();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exitZen]);

  // Canvas Lifecycle & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Initial palette initialization
    const palette = PALETTES[paletteIndex];
    document.documentElement.style.setProperty("--c1", palette.c1);
    document.documentElement.style.setProperty("--c2", palette.c2);

    const initialBlobs: FluidBlob[] = palette.colors.map((c, i) => new FluidBlob(c, i, width, height));
    const cursorColor = palette.colors[0];
    const follower = new FollowerBlob({ ...cursorColor, a: 0.95 }, width, height);
    initialBlobs.push(follower);
    blobsRef.current = initialBlobs;

    // Pointer tracker
    function handlePointerMove(e: PointerEvent) {
      mouseRef.current.tx = e.clientX;
      mouseRef.current.ty = e.clientY;
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    // Window resize
    function handleResize() {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      blobsRef.current.forEach((b) => b.reset(width, height));
    }
    window.addEventListener("resize", handleResize);

    // Main animation loop
    function animate() {
      if (!ctx || !canvas) return;

      // Smooth lerp mouse
      mouseRef.current.x += (mouseRef.current.tx - mouseRef.current.x) * 0.12;
      mouseRef.current.y += (mouseRef.current.ty - mouseRef.current.y) * 0.12;

      // Clear with pure white
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Draw all organic blobs
      const currentBlobs = blobsRef.current;
      for (let i = 0; i < currentBlobs.length; i++) {
        currentBlobs[i].update(isPlayingRef.current, width, height, mouseRef.current);
        currentBlobs[i].draw(ctx);
      }

      animIdRef.current = requestAnimationFrame(animate);
    }

    animIdRef.current = requestAnimationFrame(animate);

    // Visibility change (pause when tab hidden to save CPU/battery)
    function handleVisibility() {
      if (document.hidden) {
        if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      } else {
        animIdRef.current = requestAnimationFrame(animate);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    };
  }, [paletteIndex]);

  const currentPalette = PALETTES[paletteIndex] || PALETTES[0];

  return (
    <>
      {/* Background Interactive Stage: Fixed & Pointer-Events-None so UI clicks pass through */}
      <div className="canvas-container" aria-hidden="true">
        <canvas ref={canvasRef} id="blobCanvas" />
        <div className="css-blobs-layer">
          <div className="morph-blob blob-alpha" />
          <div className="morph-blob blob-beta" />
        </div>
      </div>

      {/* Floating Zen Mode Close Trigger */}
      {isZenMode ? (
        <button
          type="button"
          onClick={exitZen}
          className="fixed bottom-6 right-6 z-50 glass-pill px-5 py-2.5 rounded-full text-xs font-black text-slate-900 shadow-2xl hover:bg-white transition-all cursor-pointer flex items-center gap-2 animate-in fade-in zoom-in duration-200"
        >
          <X className="size-4 text-slate-700" />
          <span>Exit Zen View (Esc)</span>
        </button>
      ) : null}

      {/* Floating Aura Customizer Trigger & Popover */}
      <div className="hide-in-zen fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2">
        {/* Expanded Popover */}
        {isControlsOpen ? (
          <div className="glass-card rounded-2xl p-4 shadow-2xl border border-white/80 w-72 sm:w-80 space-y-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Luminous Aura
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsControlsOpen(false)}
                className="grid size-6 place-items-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-white/60 transition-colors cursor-pointer"
                aria-label="Close aura controls"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Palette Pills */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Aura Color Palette
              </label>
              <div className="grid grid-cols-5 gap-2 pt-1">
                {PALETTES.map((p, idx) => {
                  const isSelected = idx === paletteIndex;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPalette(idx)}
                      title={p.name}
                      className={`group relative h-9 w-full rounded-xl transition-all cursor-pointer shadow-xs ${
                        isSelected
                          ? "ring-2 ring-slate-900 ring-offset-2 scale-105 shadow-md"
                          : "opacity-75 hover:opacity-100 hover:scale-102"
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${p.c1}, ${p.c2})`,
                      }}
                    />
                  );
                })}
              </div>
              <p className="text-[11px] font-extrabold text-slate-800 pt-0.5">
                {currentPalette.name}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
              <button
                type="button"
                onClick={toggleMotion}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 py-2 text-xs font-bold text-slate-800 hover:bg-white transition shadow-2xs cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <Pause className="size-3.5 text-slate-600" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 text-emerald-600" />
                    <span>Resume</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={enterZen}
                title="Zen View: Hide UI to enjoy fluid background"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 transition shadow-xs cursor-pointer"
              >
                <Maximize2 className="size-3.5" />
                <span>Zen View</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Minimal Pill Button */}
        <button
          type="button"
          onClick={() => setIsControlsOpen((prev) => !prev)}
          className="glass-pill flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-800 shadow-md hover:bg-white hover:shadow-lg transition-all cursor-pointer group"
          title="Customize Organic Fluid Background"
        >
          <span
            className="size-2.5 rounded-full animate-pulse shrink-0 ring-1 ring-slate-400/40"
            style={{
              background: `linear-gradient(135deg, ${currentPalette.c1}, ${currentPalette.c2})`,
            }}
          />
          <span className="hidden sm:inline text-[11px] font-bold text-slate-500">Aura:</span>
          <span className="text-[11px] font-extrabold text-slate-800 group-hover:text-slate-950">
            {currentPalette.name}
          </span>
          <Sparkles className="size-3 text-slate-500 group-hover:text-slate-900 transition-colors" />
        </button>
      </div>
    </>
  );
}
