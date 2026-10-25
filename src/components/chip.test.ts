import { describe, expect, it } from "vitest";
import { chipBreakdown, DENOMINATIONS } from "./chip";

const values = (amount: number, max?: number) => chipBreakdown(amount, max).map((d) => d.value);

describe("chipBreakdown", () => {
  it("uses the biggest chips first", () => {
    expect(values(135)).toEqual([100, 25, 5, 5]);
    expect(values(1)).toEqual([1]);
    expect(values(1_250)).toEqual([1_000, 100, 100, 25, 25]);
  });

  it("caps the stack height", () => {
    expect(values(9, 3)).toEqual([5, 1, 1]);
    expect(values(999)).toHaveLength(8);
  });

  it("is empty for nothing", () => {
    expect(values(0)).toEqual([]);
  });

  it("has denominations in increasing order", () => {
    const v = DENOMINATIONS.map((d) => d.value);
    expect(v).toEqual([...v].sort((a, b) => a - b));
  });
});
