import { describe, expect, it } from "vitest";
import { FrameMonitor, startingTier } from "./quality";

const run = (m: FrameMonitor, fps: number, frames: number) => {
  const changes = [];
  for (let i = 0; i < frames; i++) {
    const c = m.push(1 / fps);
    if (c) changes.push(c);
  }
  return changes;
};

describe("Gravity Garden quality", () => {
  it("starts laptops high, phones medium, and weak devices low", () => {
    expect(startingTier({ coarsePointer: false, width: 1440, cores: 8, memory: 8 })).toBe("high");
    expect(startingTier({ coarsePointer: true, width: 390, cores: 6 })).toBe("medium");
    expect(startingTier({ coarsePointer: false, width: 1280, cores: 4 })).toBe("medium");
    expect(startingTier({ coarsePointer: true, width: 390, cores: 2, memory: 2 })).toBe("low");
  });

  it("stays put at a smooth 60fps", () => {
    expect(run(new FrameMonitor("high"), 60, 2000)).toEqual([]);
  });

  it("ignores a short stutter", () => {
    const m = new FrameMonitor("high");
    run(m, 60, 300);
    expect(run(m, 20, 90)).toEqual([]);
    expect(run(m, 60, 600)).toEqual([]);
  });

  it("steps down one tier at a time when it stays slow, then stops at low", () => {
    const m = new FrameMonitor("high");
    expect(run(m, 30, 120 + 180)).toEqual(["medium"]);
    expect(run(m, 30, 120 + 180)).toEqual(["low"]);
    expect(run(m, 30, 2000)).toEqual([]);
    expect(m.tier).toBe("low");
  });
});
