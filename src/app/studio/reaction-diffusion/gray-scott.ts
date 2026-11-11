// The Gray-Scott reaction-diffusion model: two chemicals, A and B, spread out
// on a grid. A is fed in everywhere, B eats A to make more of itself (A + 2B →
// 3B), and B slowly dies off. How fast A is fed ("feed") and how fast B dies
// ("kill") decide what grows: coral, splitting cells, mazes, or ripples.
//
// Plain TypeScript with no browser APIs, so tests and the thumbnail script can
// use it too. The grid wraps around at the edges.

export type Preset = {
  key: string;
  name: string;
  feed: number;
  kill: number;
  /** Colour stops from no B (first) to lots of B (last), as hex. */
  colors: readonly string[];
};

export const PRESETS: readonly Preset[] = [
  { key: "coral", name: "Coral", feed: 0.0545, kill: 0.062, colors: ["#06041a", "#2a2163", "#ff3ea5", "#ffcf3e"] },
  { key: "cells", name: "Cells", feed: 0.0367, kill: 0.0649, colors: ["#06041a", "#1a1442", "#3ef0ff", "#ece8ff"] },
  { key: "maze", name: "Maze", feed: 0.029, kill: 0.057, colors: ["#06041a", "#0d2b1f", "#3edc6a", "#ffcf3e"] },
  { key: "ripples", name: "Ripples", feed: 0.018, kill: 0.051, colors: ["#06041a", "#2a2163", "#3ef0ff", "#ff3ea5"] },
];

/** How fast each chemical spreads. B spreads at half A's speed. */
const DIFFUSE_A = 1.0;
const DIFFUSE_B = 0.5;

export class GrayScott {
  readonly width: number;
  readonly height: number;
  a: Float32Array;
  b: Float32Array;
  private nextA: Float32Array;
  private nextB: Float32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.a = new Float32Array(n).fill(1);
    this.b = new Float32Array(n);
    this.nextA = new Float32Array(n);
    this.nextB = new Float32Array(n);
  }

  /** Back to a blank dish: all A, no B. */
  clear() {
    this.a.fill(1);
    this.b.fill(0);
  }

  /** Drops a round blob of B centred on (x, y), in grid cells. */
  drop(x: number, y: number, radius: number) {
    const { width, height } = this;
    const r2 = radius * radius;
    for (let dy = -Math.ceil(radius); dy <= radius; dy++) {
      for (let dx = -Math.ceil(radius); dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const cx = (((Math.round(x) + dx) % width) + width) % width;
        const cy = (((Math.round(y) + dy) % height) + height) % height;
        const i = cy * width + cx;
        this.b[i] = 1;
        this.a[i] = 0;
      }
    }
  }

  /** Drops `count` blobs at random spots. `random` returns 0 to 1. */
  scatter(count: number, radius: number, random: () => number = Math.random) {
    for (let i = 0; i < count; i++) this.drop(random() * this.width, random() * this.height, radius);
  }

  /** Moves the simulation forward `steps` ticks. */
  step(feed: number, kill: number, steps = 1) {
    const { width: w, height: h } = this;
    for (let s = 0; s < steps; s++) {
      const a = this.a;
      const b = this.b;
      const na = this.nextA;
      const nb = this.nextB;
      for (let y = 0; y < h; y++) {
        const up = ((y - 1 + h) % h) * w;
        const row = y * w;
        const down = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const left = (x - 1 + w) % w;
          const right = (x + 1) % w;
          const i = row + x;
          // 3×3 blur: neighbours 0.2 each, corners 0.05 each, minus the cell itself.
          const lapA =
            0.2 * (a[up + x] + a[down + x] + a[row + left] + a[row + right]) +
            0.05 * (a[up + left] + a[up + right] + a[down + left] + a[down + right]) -
            a[i];
          const lapB =
            0.2 * (b[up + x] + b[down + x] + b[row + left] + b[row + right]) +
            0.05 * (b[up + left] + b[up + right] + b[down + left] + b[down + right]) -
            b[i];
          const ai = a[i];
          const bi = b[i];
          const react = ai * bi * bi;
          const nextA = ai + DIFFUSE_A * lapA - react + feed * (1 - ai);
          const nextB = bi + DIFFUSE_B * lapB + react - (kill + feed) * bi;
          na[i] = nextA < 0 ? 0 : nextA > 1 ? 1 : nextA;
          nb[i] = nextB < 0 ? 0 : nextB > 1 ? 1 : nextB;
        }
      }
      this.a = na;
      this.b = nb;
      this.nextA = a;
      this.nextB = b;
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A 256-step colour ramp through the preset's stops, as [r, g, b] triples.
 * Index 0 is no B, 255 is the most B the patterns usually reach.
 */
export function colorRamp(colors: readonly string[]): Uint8ClampedArray {
  const stops = colors.map(hexToRgb);
  const ramp = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    const f = t - k;
    for (let c = 0; c < 3; c++) ramp[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  return ramp;
}

/** Patterns rarely push B past this, so it maps to the brightest colour. */
const B_FULL = 0.4;

/** Paints the grid into RGBA pixels (one pixel per cell). */
export function paint(sim: GrayScott, ramp: Uint8ClampedArray, rgba: Uint8ClampedArray) {
  const b = sim.b;
  for (let i = 0; i < b.length; i++) {
    const level = Math.min(255, Math.round((b[i] / B_FULL) * 255)) * 3;
    const p = i * 4;
    rgba[p] = ramp[level];
    rgba[p + 1] = ramp[level + 1];
    rgba[p + 2] = ramp[level + 2];
    rgba[p + 3] = 255;
  }
}
