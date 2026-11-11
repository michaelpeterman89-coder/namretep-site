// Picks how fancy to draw things, and steps down if the device can't keep up.
// Plain TypeScript so it's testable.

export type Tier = "high" | "medium" | "low";
export const TIER_ORDER: readonly Tier[] = ["high", "medium", "low"];

export type QualitySettings = {
  /** Cap on screen pixels per CSS pixel. */
  pixelRatio: number;
  /** Bloom resolution as a fraction of the screen (0 = bloom off). */
  bloomScale: number;
  /** Multisampled anti-aliasing samples for the HDR buffer. */
  msaa: number;
  lensFlare: boolean;
  /** Sphere detail for planets. */
  segments: number;
  /** Width of generated planet surface textures (height is half). */
  textureWidth: number;
  /** Points kept per orbit trail. */
  trailPoints: number;
  backdrop: "4k" | "2k";
};

export const TIERS: Record<Tier, QualitySettings> = {
  high: { pixelRatio: 2, bloomScale: 1, msaa: 4, lensFlare: true, segments: 64, textureWidth: 1024, trailPoints: 900, backdrop: "4k" },
  medium: { pixelRatio: 1.5, bloomScale: 0.5, msaa: 0, lensFlare: false, segments: 40, textureWidth: 512, trailPoints: 500, backdrop: "2k" },
  low: { pixelRatio: 1, bloomScale: 0.35, msaa: 0, lensFlare: false, segments: 24, textureWidth: 256, trailPoints: 250, backdrop: "2k" },
};

export type DeviceHints = {
  /** A touch screen is the main pointer (phones, tablets). */
  coarsePointer: boolean;
  /** Viewport width, CSS px. */
  width: number;
  /** navigator.hardwareConcurrency, if known. */
  cores?: number;
  /** navigator.deviceMemory in GB, if known (Chrome only). */
  memory?: number;
};

/** Where to start: phones and small or weak devices begin at medium, really weak ones at low. */
export function startingTier({ coarsePointer, width, cores, memory }: DeviceHints): Tier {
  if ((cores !== undefined && cores <= 2) || (memory !== undefined && memory <= 2)) return "low";
  if (coarsePointer || width < 768 || (cores !== undefined && cores <= 4) || (memory !== undefined && memory <= 4))
    return "medium";
  return "high";
}

/** Below this average frame rate, step down a tier. */
const SLOW_FPS = 45;
/** Frames per check. About 1.5 seconds at 60fps. */
const WINDOW = 90;
/** Slow windows in a row before stepping down, so one hiccup doesn't count. */
const STRIKES = 2;
/** Ignore the first frames while textures upload and shaders compile. */
const WARMUP = 120;

/**
 * Watches frame times. `push` returns the tier to switch to when it's time to
 * step down, otherwise null. It never steps back up by itself, so quality
 * doesn't flicker between tiers.
 */
export class FrameMonitor {
  private frames = 0;
  private sum = 0;
  private strikes = 0;
  private seen = 0;

  constructor(public tier: Tier) {}

  push(seconds: number): Tier | null {
    if (++this.seen <= WARMUP) return null;
    this.sum += seconds;
    if (++this.frames < WINDOW) return null;
    const fps = this.frames / this.sum;
    this.frames = 0;
    this.sum = 0;
    this.strikes = fps < SLOW_FPS ? this.strikes + 1 : 0;
    if (this.strikes < STRIKES) return null;
    this.strikes = 0;
    const next = TIER_ORDER[TIER_ORDER.indexOf(this.tier) + 1];
    if (!next) return null;
    this.tier = next;
    this.seen = 0; // let the new settings settle before judging again
    return next;
  }

  /** The player picked a tier by hand; start watching from there. */
  reset(tier: Tier) {
    this.tier = tier;
    this.frames = 0;
    this.sum = 0;
    this.strikes = 0;
    this.seen = 0;
  }
}
