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

import { useZenMode } from "../zen/ZenModeContext";

export default function LuminousFluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobsRef = useRef<FluidBlob[]>([]);
  const animIdRef = useRef<number | null>(null);

  const { paletteIndex, setPaletteIndex } = useZenMode();
  const [isPlaying, setIsPlaying] = useState(true);

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
      const savedMotion = localStorage.getItem("clockwise_aura_motion");
      if (savedMotion !== null) {
        setIsPlaying(savedMotion === "true");
      }
    } catch {
      // Ignore localStorage access issues
    }
  }, []);

  // Sync blobs and CSS Variables whenever Palette changes
  useEffect(() => {
    const palette = PALETTES[paletteIndex] || PALETTES[0];
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
  }, [paletteIndex]);

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

  // Canvas Lifecycle & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Initial palette initialization
    const palette = PALETTES[paletteIndex] || PALETTES[0];
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
    </>
  );
}
