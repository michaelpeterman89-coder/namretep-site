import { describe, expect, it } from "vitest";
import {
  commission,
  crapsSummary,
  DEFAULT_CRAPS_RULES,
  maxLayOddsWin,
  maxOddsMultiple,
  parseCrapsRules,
  pay,
  pointNumbers,
} from "./rules";

describe("parseCrapsRules", () => {
  it("accepts the defaults and returns a clean copy", () => {
    const result = parseCrapsRules({ ...DEFAULT_CRAPS_RULES, extra: "ignored" });
    expect(result).toEqual({ ok: true, rules: DEFAULT_CRAPS_RULES });
  });

  it("rejects bad settings with a helpful message", () => {
    expect(parseCrapsRules(null)).toMatchObject({ ok: false });
    expect(parseCrapsRules({ ...DEFAULT_CRAPS_RULES, variant: "bubble" })).toMatchObject({ ok: false, error: /crapless/ });
    expect(parseCrapsRules({ ...DEFAULT_CRAPS_RULES, odds: "7" })).toMatchObject({ ok: false, error: /odds/ });
    expect(parseCrapsRules({ ...DEFAULT_CRAPS_RULES, field12: 4 })).toMatchObject({ ok: false, error: /12/ });
    expect(parseCrapsRules({ ...DEFAULT_CRAPS_RULES, vig: "never" })).toMatchObject({ ok: false });
    expect(parseCrapsRules({ ...DEFAULT_CRAPS_RULES, hops: "yes" })).toMatchObject({ ok: false, error: /bonus/ });
  });
});

describe("odds limits", () => {
  it("3-4-5x depends on the point; other limits are flat", () => {
    expect([4, 5, 6, 8, 9, 10].map((n) => maxOddsMultiple(DEFAULT_CRAPS_RULES, n))).toEqual([3, 4, 5, 5, 4, 3]);
    expect(maxOddsMultiple({ ...DEFAULT_CRAPS_RULES, odds: "10" }, 6)).toBe(10);
  });

  it("lay odds can win the same as the most you could win taking odds", () => {
    // 3-4-5x always lets the odds win 6x the line bet.
    for (const n of [4, 5, 6]) expect(maxLayOddsWin(DEFAULT_CRAPS_RULES, n, 10)).toBe(60);
  });
});

describe("helpers", () => {
  it("rounds payouts down and charges at least 1 chip of commission", () => {
    expect(pay(5, [6, 5])).toBe(6);
    expect(pay(7, [7, 6])).toBe(8);
    expect(commission(10)).toBe(1);
    expect(commission(100)).toBe(5);
  });

  it("lists the point numbers for each variant", () => {
    expect(pointNumbers("standard")).toEqual([4, 5, 6, 8, 9, 10]);
    expect(pointNumbers("crapless")).toEqual([2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
  });

  it("summarises the table", () => {
    expect(crapsSummary(DEFAULT_CRAPS_RULES)).toBe("Craps · 3-4-5x odds · Field 12 pays 3x");
    expect(crapsSummary({ ...DEFAULT_CRAPS_RULES, variant: "crapless", odds: "100" })).toMatch(/^Crapless · 100x/);
  });
});
