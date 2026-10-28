"use client";

/**
 * iPhone Notification Ping Sound Player
 * Synthesizes the iconic crisp Apple iOS notification chime / ping using Web Audio API
 * with fallback to pre-rendered high-definition WAV audio (/sounds/iphone-ping.wav).
 */

let sharedAudioContext: AudioContext | null = null;
let htmlAudioElement: HTMLAudioElement | null = null;

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
 * Prime and unlock audio on user gesture (e.g. clicking "Allow Notifications" or "Enable")
 */
export function primeNotificationAudio(): void {
  if (typeof window === "undefined") return;

  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (!htmlAudioElement) {
      htmlAudioElement = new Audio("/sounds/iphone-ping.wav");
      htmlAudioElement.volume = 0.85;
      htmlAudioElement.load();
    }
  } catch {
    // browser sandbox
  }
}

/**
 * Play the iconic iPhone notification ping sound.
 * Plays crisp crystalline dual chime: G6 (1568Hz), C7 (2093Hz) + E7 (2637Hz) shimmer.
 */
export function playNotificationPing(): void {
  if (typeof window === "undefined") return;

  let playedViaWebAudio = false;

  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state !== "closed") {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(0.75, now + 0.003);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      masterGain.connect(ctx.destination);

      // Acoustic chime harmonic frequencies of iPhone Ping
      const freqs = [
        { freq: 1568, gain: 0.65 }, // G6 fundamental
        { freq: 2093, gain: 0.55 }, // C7 prominent fifth
        { freq: 2637, gain: 0.35 }, // E7 glassy ring
        { freq: 4186, gain: 0.18 }, // Octave shimmer
      ];

      freqs.forEach(({ freq, gain }) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        oscGain.gain.setValueAtTime(gain, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + (freq > 2500 ? 0.35 : 0.52));

        osc.connect(oscGain);
        oscGain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.55);
      });

      playedViaWebAudio = true;
    }
  } catch {
    playedViaWebAudio = false;
  }

  // Fallback to HTML5 audio if Web Audio is unavailable or blocked
  if (!playedViaWebAudio) {
    try {
      if (!htmlAudioElement) {
        htmlAudioElement = new Audio("/sounds/iphone-ping.wav");
        htmlAudioElement.volume = 0.85;
      }
      htmlAudioElement.currentTime = 0;
      htmlAudioElement.play().catch(() => {});
    } catch {
      // ignore
    }
  }
}
