import { describe, expect, it } from "vitest";
import { DEFAULT_POKER_RULES, parsePokerRules, pokerSummary } from "./table-rules";

describe("parsePokerRules", () => {
  it("accepts the defaults and drops unknown fields", () => {
    expect(parsePokerRules({ ...DEFAULT_POKER_RULES, extra: 1 }, 6)).toEqual({ ok: true, rules: DEFAULT_POKER_RULES });
  });

  it.each<[string, Record<string, unknown>, number]>([
    ["Omaha (not offered yet)", { variant: "omaha" }, 6],
    ["a zero small blind", { smallBlind: 0 }, 6],
    ["a big blind below the small blind", { smallBlind: 10, bigBlind: 5 }, 6],
    ["a tiny minimum buy-in", { minBuyIn: 50 }, 6],
    ["a max buy-in below the min", { maxBuyIn: 100 }, 6],
    ["bots in every seat", { bots: 6 }, 6],
    ["fractional chips", { bigBlind: 10.5 }, 6],
  ])("rejects %s", (_label, change, seats) => {
    expect(parsePokerRules({ ...DEFAULT_POKER_RULES, ...change }, seats).ok).toBe(false);
  });
});

describe("pokerSummary", () => {
  it("labels the stakes", () => {
    expect(pokerSummary(DEFAULT_POKER_RULES)).toBe("NL Hold'em · 5/10");
    expect(pokerSummary({ ...DEFAULT_POKER_RULES, smallBlind: 50, bigBlind: 100, ante: 10 })).toBe(
      "NL Hold'em · 50/100 · ante 10",
    );
  });
});
