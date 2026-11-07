import { describe, expect, it } from "vitest";
import { botStack, DEFAULT_POKER_RULES, parsePokerRules, pokerSummary } from "./table-rules";

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

  it("allows no maximum buy-in, but only when it's chosen", () => {
    const rules = { ...DEFAULT_POKER_RULES, maxBuyIn: null };
    expect(parsePokerRules(rules, 6)).toEqual({ ok: true, rules });
    const withoutOne: Record<string, unknown> = { ...DEFAULT_POKER_RULES };
    delete withoutOne.maxBuyIn;
    expect(parsePokerRules(withoutOne, 6).ok).toBe(false);
  });

  it("still limits the minimum buy-in with no maximum", () => {
    expect(parsePokerRules({ ...DEFAULT_POKER_RULES, maxBuyIn: null, minBuyIn: 2_000_000 }, 6).ok).toBe(false);
  });
});

describe("botStack", () => {
  it("is the maximum buy-in, or 100 big blinds without one", () => {
    expect(botStack(DEFAULT_POKER_RULES)).toBe(1_000);
    expect(botStack({ ...DEFAULT_POKER_RULES, bigBlind: 50, maxBuyIn: null })).toBe(5_000);
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
