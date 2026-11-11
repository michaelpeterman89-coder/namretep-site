import { describe, expect, it } from "vitest";
import { GrayScott, PRESETS, colorRamp, paint } from "./gray-scott";

const total = (arr: Float32Array) => arr.reduce((s, v) => s + v, 0);

describe("Gray-Scott simulation", () => {
  it("stays blank when nothing is dropped in", () => {
    const sim = new GrayScott(20, 20);
    sim.step(0.0545, 0.062, 50);
    expect(total(sim.b)).toBe(0);
    expect(total(sim.a)).toBe(400);
  });

  it("drops a round blob of B, wrapping around the edges", () => {
    const sim = new GrayScott(20, 20);
    sim.drop(0, 0, 2);
    expect(sim.b[0]).toBe(1);
    expect(sim.b[19]).toBe(1); // wrapped to the right edge
    expect(sim.b[19 * 20]).toBe(1); // wrapped to the bottom edge
    expect(sim.b[10 * 20 + 10]).toBe(0);
  });

  it("grows and spreads a pattern for every preset, keeping values between 0 and 1", () => {
    for (const p of PRESETS) {
      // Real dishes are 100+ cells wide; on tiny grids ripples wrap round and cancel out.
      const sim = new GrayScott(80, 80);
      sim.drop(40, 40, 4);
      sim.step(p.feed, p.kill, 2000);
      const b = Array.from(sim.b);
      expect(b.every((v) => v >= 0 && v <= 1), p.name).toBe(true);
      expect(b.filter((v) => v > 0.1).length, p.name).toBeGreaterThan(0);
    }
  });

  it("paints no B as the first colour and full B as the last", () => {
    const sim = new GrayScott(2, 1);
    sim.b[1] = 1;
    const rgba = new Uint8ClampedArray(8);
    paint(sim, colorRamp(["#000000", "#ffffff"]), rgba);
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
});
