import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, houseEdge, parseRules, rulesSummary, type BlackjackRules } from "./rules";

const rules = (overrides: Partial<BlackjackRules> = {}): BlackjackRules => ({ ...DEFAULT_RULES, ...overrides });

describe("parseRules", () => {
  it("accepts valid rules and drops unknown fields", () => {
    const result = parseRules({ ...DEFAULT_RULES, sneaky: "extra" });
    expect(result).toEqual({ ok: true, rules: DEFAULT_RULES });
  });

  it.each<[string, unknown]>([
    ["missing input", null],
    ["3 decks", { ...DEFAULT_RULES, decks: 3 }],
    ["decks as text", { ...DEFAULT_RULES, decks: "6" }],
    ["unknown payout", { ...DEFAULT_RULES, blackjackPayout: "2:1" }],
    ["5 split hands", { ...DEFAULT_RULES, maxSplitHands: 5 }],
    ["90% penetration", { ...DEFAULT_RULES, penetration: 0.9 }],
    ["NaN penetration", { ...DEFAULT_RULES, penetration: NaN }],
    ["missing S17/H17", { ...DEFAULT_RULES, dealerHitsSoft17: undefined }],
  ])("rejects %s", (_label, input) => {
    expect(parseRules(input).ok).toBe(false);
  });
});

describe("rulesSummary", () => {
  it("summarizes the default table", () => {
    expect(rulesSummary(DEFAULT_RULES)).toBe("6D · S17 · 3:2 · DAS · LS");
  });

  it("lists every unusual rule", () => {
    const summary = rulesSummary(
      rules({
        decks: 1,
        dealerHitsSoft17: true,
        blackjackPayout: "6:5",
        dealerPeeks: false,
        doubleOn: "10-11",
        doubleAfterSplit: false,
        maxSplitHands: 2,
        resplitAces: true,
        hitSplitAces: true,
        surrender: "early",
      }),
    );
    expect(summary).toBe("1D · H17 · 6:5 · ENHC · D10-11 · SP2 · RSA · HSA · ES");
  });
});

describe("houseEdge", () => {
  it("is about 0.3% for the default table", () => {
    expect(houseEdge(DEFAULT_RULES)).toBeCloseTo(0.32, 2);
  });

  it("gets worse with player-unfriendly rules", () => {
    const base = houseEdge(DEFAULT_RULES);
    expect(houseEdge(rules({ blackjackPayout: "6:5" }))).toBeCloseTo(base + 1.39, 2);
    expect(houseEdge(rules({ dealerHitsSoft17: true }))).toBeGreaterThan(base);
    expect(houseEdge(rules({ decks: 8 }))).toBeGreaterThan(houseEdge(rules({ decks: 1 })));
    expect(houseEdge(rules({ surrender: "none" }))).toBeGreaterThan(base);
  });
});
