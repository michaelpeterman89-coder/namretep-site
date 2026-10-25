import { describe, expect, it } from "vitest";
import { secureRandomInt, shuffle } from "./random";

describe("secureRandomInt", () => {
  it("stays within range and hits every value", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = secureRandomInt(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      seen.add(n);
    }
    expect(seen.size).toBe(6);
  });

  it.each([0, -1, 1.5, 2 ** 32 + 1])("rejects %s", (max) => {
    expect(() => secureRandomInt(max)).toThrow(RangeError);
  });
});

describe("shuffle", () => {
  it("keeps every item and doesn't change the input", () => {
    const input = Array.from({ length: 52 }, (_, i) => i);
    const result = shuffle(input);
    expect(input).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });

  it("is a correct Fisher–Yates walk", () => {
    // Always picking index 0 rotates the array: [a,b,c,d] -> [b,c,d,a].
    expect(shuffle(["a", "b", "c", "d"], () => 0)).toEqual(["b", "c", "d", "a"]);
    // Always picking i (the current slot) leaves it unchanged.
    expect(shuffle(["a", "b", "c", "d"], (max) => max - 1)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts each item in each position roughly equally often", () => {
    const trials = 30_000;
    const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (let t = 0; t < trials; t++) {
      shuffle([0, 1, 2, 3]).forEach((item, position) => counts[item][position]++);
    }
    for (const row of counts) {
      for (const count of row) {
        // Expected 7,500 each; allow a generous margin so the test never flakes.
        expect(count).toBeGreaterThan(7000);
        expect(count).toBeLessThan(8000);
      }
    }
  });
});
