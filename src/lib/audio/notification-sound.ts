"use client";

/**
 * Primary Notification Sound Player
 * Downloads and caches /sounds/ping-sound.mp3 locally on the user's device
 * and plays it with low latency using the Web Audio API / HTML5 Audio.
 */

const SOUND_URL = "/sounds/ping-sound.mp3";
const SOUND_CACHE_NAME = "clockwise-sound-cache-v1";

let sharedAudioContext: AudioContext | null = null;
let cachedAudioBuffer: AudioBuffer | null = null;
let localBlobUrl: string | null = null;
let htmlAudioElement: HTMLAudioElement | null = null;
let isDownloading = false;
let isDownloaded = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  try {
    if (!sharedAudioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioContext = new AudioCtx();
      }
    }
    if (sharedAudioContext && sharedAudioContext.state === "suspended") {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Downloads the primary notification sound and stores it locally in Cache Storage
 * and in memory (AudioBuffer & local Blob URL) for instant offline playback.
 */
export async function downloadAndCacheNotificationSound(): Promise<void> {
  if (typeof window === "undefined" || isDownloading || isDownloaded) return;
  isDownloading = true;

  try {
    let response: Response | undefined;

    // 1. Check local Cache Storage first
    if ("caches" in window) {
      try {
        const cache = await caches.open(SOUND_CACHE_NAME);
        const matched = await cache.match(SOUND_URL);
        if (matched) {
          response = matched;
        } else {
          // Download and persist in cache
          await cache.add(SOUND_URL);
          const newlyCached = await cache.match(SOUND_URL);
          if (newlyCached) {
            response = newlyCached;
          }
        }
      } catch {
        // Fallback to direct fetch
      }
    }

    if (!response) {
      response = await fetch(SOUND_URL);
    }

    const blob = await response.clone().blob();
    if (!localBlobUrl) {
      localBlobUrl = URL.createObjectURL(blob);
    }

    // Pre-decode audio buffer into Web Audio Context if available
    const arrayBuffer = await response.arrayBuffer();
    const ctx = getAudioContext();
    if (ctx) {
      try {
        cachedAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
      } catch {
        // decode failed or unsupported codec in AudioContext
      }
    }

    // Prepare HTMLAudioElement with local blob URL
    if (!htmlAudioElement) {
      htmlAudioElement = new Audio(localBlobUrl || SOUND_URL);
      htmlAudioElement.volume = 0.85;
      htmlAudioElement.load();
    }

    isDownloaded = true;
  } catch (err) {
    console.warn("Could not download notification sound locally:", err);
  } finally {
    isDownloading = false;
  }
}

// Automatically trigger local download when script runs in the browser
if (typeof window !== "undefined") {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    downloadAndCacheNotificationSound().catch(() => {});
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      downloadAndCacheNotificationSound().catch(() => {});
    });
  }
}

/**
 * Prime and unlock audio on user gesture (e.g. clicking "Allow Notifications" or "Enable")
 */
export function primeNotificationAudio(): void {
  if (typeof window === "undefined") return;

  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    downloadAndCacheNotificationSound().catch(() => {});

    if (!htmlAudioElement) {
      htmlAudioElement = new Audio(localBlobUrl || SOUND_URL);
      htmlAudioElement.volume = 0.85;
      htmlAudioElement.load();
    }
  } catch {
    // browser sandbox
  }
}

/**
 * Play the primary notification sound (/sounds/ping-sound.mp3)
 * Plays from local memory / cache with low latency.
 */
export function playNotificationPing(): void {
  if (typeof window === "undefined") return;

  // Ensure download is scheduled if not started yet
  if (!isDownloaded && !isDownloading) {
    downloadAndCacheNotificationSound().catch(() => {});
  }

  let played = false;

  // Attempt 1: Web Audio API with pre-decoded buffer (zero latency)
  try {
    const ctx = getAudioContext();
    if (ctx && cachedAudioBuffer && ctx.state !== "closed") {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createBufferSource();
      source.buffer = cachedAudioBuffer;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.85, ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.start(0);
      played = true;
    }
  } catch {
    played = false;
  }

  // Attempt 2: HTMLAudioElement with local blob or sound URL
  if (!played) {
    try {
      if (!htmlAudioElement) {
        htmlAudioElement = new Audio(localBlobUrl || SOUND_URL);
        htmlAudioElement.volume = 0.85;
      } else if (localBlobUrl && htmlAudioElement.src !== localBlobUrl) {
        htmlAudioElement.src = localBlobUrl;
      }
      htmlAudioElement.currentTime = 0;
      htmlAudioElement.play().catch(() => {});
    } catch {
      // ignore
    }
  }
}
