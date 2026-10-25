"use client";

// Little 8-bit sound effects, made in the browser with the Web Audio API.
// Nothing to download or license: every sound is built from simple tones
// and noise when it plays.

export const SOUND_KEY = "namretep:sound";

export type SoundName = "deal" | "flip" | "chip" | "win" | "blackjack" | "lose" | "push" | "turn" | "tick";

let context: AudioContext | null = null;
let master: GainNode | null = null;

function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.22;
    master.connect(context.destination);
  }
  // Browsers start audio paused until the player has clicked something.
  if (context.state === "suspended") void context.resume();
  return { ctx: context, out: master! };
}

/** A short tone with a quick attack and decay. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  { freq, start, length, type = "square", volume = 0.5, slideTo }: {
    freq: number;
    start: number;
    length: number;
    type?: OscillatorType;
    volume?: number;
    slideTo?: number;
  },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** A burst of filtered noise (card swishes and snaps). */
function noise(
  ctx: AudioContext,
  out: AudioNode,
  { start, length, from, to, volume = 0.5 }: { start: number; length: number; from: number; to: number; volume?: number },
) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(filter).connect(gain).connect(out);
  source.start(start);
}

const NOTES = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1567.98, A4: 440, F4: 349.23 };

/** Plays a sound effect, unless the player has turned sound off. */
export function playSound(name: SoundName) {
  if (!soundOn()) return;
  const a = audio();
  if (!a) return;
  const { ctx, out } = a;
  const t = ctx.currentTime;

  switch (name) {
    case "deal":
      noise(ctx, out, { start: t, length: 0.09, from: 5000, to: 1200, volume: 0.6 });
      break;
    case "flip":
      noise(ctx, out, { start: t, length: 0.04, from: 3000, to: 2000, volume: 0.5 });
      noise(ctx, out, { start: t + 0.07, length: 0.05, from: 2400, to: 1500, volume: 0.6 });
      break;
    case "chip":
      tone(ctx, out, { freq: 2600, start: t, length: 0.06, type: "triangle", volume: 0.35 });
      tone(ctx, out, { freq: 3400, start: t + 0.035, length: 0.07, type: "triangle", volume: 0.25 });
      break;
    case "win":
      [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6].forEach((freq, i) =>
        tone(ctx, out, { freq, start: t + i * 0.08, length: 0.14, volume: 0.3 }),
      );
      break;
    case "blackjack":
      [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6, NOTES.E6, NOTES.G6].forEach((freq, i) =>
        tone(ctx, out, { freq, start: t + i * 0.07, length: 0.16, volume: 0.3 }),
      );
      tone(ctx, out, { freq: NOTES.C6, start: t + 0.45, length: 0.5, type: "triangle", volume: 0.3 });
      break;
    case "lose":
      tone(ctx, out, { freq: NOTES.A4, start: t, length: 0.18, type: "triangle", volume: 0.25 });
      tone(ctx, out, { freq: NOTES.F4, start: t + 0.16, length: 0.3, type: "triangle", volume: 0.25, slideTo: 300 });
      break;
    case "push":
      tone(ctx, out, { freq: NOTES.G5, start: t, length: 0.1, type: "triangle", volume: 0.25 });
      tone(ctx, out, { freq: NOTES.G5, start: t + 0.12, length: 0.1, type: "triangle", volume: 0.25 });
      break;
    case "turn":
      tone(ctx, out, { freq: NOTES.E6, start: t, length: 0.12, type: "sine", volume: 0.35 });
      tone(ctx, out, { freq: NOTES.G6, start: t + 0.09, length: 0.18, type: "sine", volume: 0.3 });
      break;
    case "tick":
      tone(ctx, out, { freq: 1800, start: t, length: 0.03, type: "square", volume: 0.15 });
      break;
  }
}

/** Plays a sound after a delay (e.g. when a dealt card starts its flight). */
export function playSoundAt(name: SoundName, delayMs: number): () => void {
  if (delayMs <= 0) {
    playSound(name);
    return () => {};
  }
  const timer = setTimeout(() => playSound(name), delayMs);
  return () => clearTimeout(timer);
}
