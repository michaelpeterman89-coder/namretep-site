export const DECK_OPTIONS = [1, 2, 4, 6, 8] as const;
export const PAYOUT_OPTIONS = ["3:2", "6:5", "1:1"] as const;
export const DOUBLE_OPTIONS = ["any", "9-11", "10-11"] as const;
export const SPLIT_HANDS_OPTIONS = [2, 3, 4] as const;
export const SURRENDER_OPTIONS = ["none", "late", "early"] as const;
export const PENETRATION_MIN = 0.5;
export const PENETRATION_MAX = 0.85;

/** Game rules for one blackjack table. Seats and bet limits live on the table itself. */
export type BlackjackRules = {
  decks: (typeof DECK_OPTIONS)[number];
  /** H17 when true, S17 when false. */
  dealerHitsSoft17: boolean;
  blackjackPayout: (typeof PAYOUT_OPTIONS)[number];
  /** False = European no-hole-card: the dealer takes a second card only after players act. */
  dealerPeeks: boolean;
  doubleOn: (typeof DOUBLE_OPTIONS)[number];
  doubleAfterSplit: boolean;
  /** Most hands a player can have from one starting hand by splitting. */
  maxSplitHands: (typeof SPLIT_HANDS_OPTIONS)[number];
  resplitAces: boolean;
  hitSplitAces: boolean;
  surrender: (typeof SURRENDER_OPTIONS)[number];
  insurance: boolean;
  /** Share of the shoe dealt before reshuffling, from 0.5 to 0.85. */
  penetration: number;
};

export const DEFAULT_RULES: BlackjackRules = {
  decks: 6,
  dealerHitsSoft17: false,
  blackjackPayout: "3:2",
  dealerPeeks: true,
  doubleOn: "any",
  doubleAfterSplit: true,
  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  surrender: "late",
  insurance: true,
  penetration: 0.75,
};

/** Blackjack payout as [numerator, denominator], e.g. 3:2 -> [3, 2]. */
export function payoutRatio(payout: BlackjackRules["blackjackPayout"]): [number, number] {
  const [num, den] = payout.split(":").map(Number);
  return [num, den];
}

// ---------- Validation ----------

export type ParseResult = { ok: true; rules: BlackjackRules } | { ok: false; error: string };

function oneOf<T>(options: readonly T[], value: unknown): value is T {
  return options.includes(value as T);
}

/** Checks rules coming from outside (a form, the database) and returns a clean copy. */
export function parseRules(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Rules are missing." };
  const r = input as Record<string, unknown>;

  if (!oneOf(DECK_OPTIONS, r.decks)) return { ok: false, error: "Decks must be 1, 2, 4, 6, or 8." };
  if (typeof r.dealerHitsSoft17 !== "boolean") return { ok: false, error: "Choose S17 or H17." };
  if (!oneOf(PAYOUT_OPTIONS, r.blackjackPayout)) return { ok: false, error: "Invalid blackjack payout." };
  if (typeof r.dealerPeeks !== "boolean") return { ok: false, error: "Choose whether the dealer peeks." };
  if (!oneOf(DOUBLE_OPTIONS, r.doubleOn)) return { ok: false, error: "Invalid double down rule." };
  if (typeof r.doubleAfterSplit !== "boolean") return { ok: false, error: "Choose whether DAS is allowed." };
  if (!oneOf(SPLIT_HANDS_OPTIONS, r.maxSplitHands)) return { ok: false, error: "Max split hands must be 2, 3, or 4." };
  if (typeof r.resplitAces !== "boolean") return { ok: false, error: "Choose whether aces can be re-split." };
  if (typeof r.hitSplitAces !== "boolean") return { ok: false, error: "Choose whether split aces can be hit." };
  if (!oneOf(SURRENDER_OPTIONS, r.surrender)) return { ok: false, error: "Invalid surrender rule." };
  if (typeof r.insurance !== "boolean") return { ok: false, error: "Choose whether insurance is offered." };
  if (
    typeof r.penetration !== "number" ||
    !(r.penetration >= PENETRATION_MIN && r.penetration <= PENETRATION_MAX)
  ) {
    return { ok: false, error: "Shuffle point must be between 50% and 85%." };
  }

  return {
    ok: true,
    rules: {
      decks: r.decks,
      dealerHitsSoft17: r.dealerHitsSoft17,
      blackjackPayout: r.blackjackPayout,
      dealerPeeks: r.dealerPeeks,
      doubleOn: r.doubleOn,
      doubleAfterSplit: r.doubleAfterSplit,
      maxSplitHands: r.maxSplitHands,
      resplitAces: r.resplitAces,
      hitSplitAces: r.hitSplitAces,
      surrender: r.surrender,
      insurance: r.insurance,
      penetration: r.penetration,
    },
  };
}

// ---------- Summary ----------

/** Short label like "6D · S17 · 3:2 · DAS · LS". Only notable rules are listed. */
export function rulesSummary(rules: BlackjackRules): string {
  const parts: string[] = [
    `${rules.decks}D`,
    rules.dealerHitsSoft17 ? "H17" : "S17",
    rules.blackjackPayout,
  ];
  if (!rules.dealerPeeks) parts.push("ENHC");
  if (rules.doubleOn === "9-11") parts.push("D9-11");
  if (rules.doubleOn === "10-11") parts.push("D10-11");
  if (rules.doubleAfterSplit) parts.push("DAS");
  if (rules.maxSplitHands !== 4) parts.push(`SP${rules.maxSplitHands}`);
  if (rules.resplitAces) parts.push("RSA");
  if (rules.hitSplitAces) parts.push("HSA");
  if (rules.surrender === "late") parts.push("LS");
  if (rules.surrender === "early") parts.push("ES");
  return parts.join(" · ");
}

// ---------- House edge ----------

/**
 * Approximate house edge (in percent) for perfect basic strategy.
 *
 * Starts from a 6-deck, S17, 3:2, DAS, split-to-4, no-surrender game (~0.40%)
 * and adds the commonly published effect of each rule change. The effects
 * interact slightly, so treat the result as a guide, not an exact figure.
 */
export function houseEdge(rules: BlackjackRules): number {
  const BASE = 0.4;
  const DECKS: Record<BlackjackRules["decks"], number> = { 1: -0.48, 2: -0.19, 4: -0.06, 6: 0, 8: 0.02 };
  const PAYOUT: Record<BlackjackRules["blackjackPayout"], number> = { "3:2": 0, "6:5": 1.39, "1:1": 2.27 };
  const DOUBLE: Record<BlackjackRules["doubleOn"], number> = { any: 0, "9-11": 0.09, "10-11": 0.18 };
  const SPLIT_HANDS: Record<BlackjackRules["maxSplitHands"], number> = { 2: 0.1, 3: 0.03, 4: 0 };
  const SURRENDER: Record<BlackjackRules["surrender"], number> = { none: 0, late: -0.08, early: -0.62 };

  let edge = BASE + DECKS[rules.decks] + PAYOUT[rules.blackjackPayout] + DOUBLE[rules.doubleOn];
  edge += SPLIT_HANDS[rules.maxSplitHands] + SURRENDER[rules.surrender];
  if (rules.dealerHitsSoft17) edge += 0.22;
  if (!rules.dealerPeeks) edge += 0.11;
  if (!rules.doubleAfterSplit) edge += 0.14;
  if (rules.resplitAces) edge -= 0.08;
  if (rules.hitSplitAces) edge -= 0.19;

  return Math.round(edge * 100) / 100;
}
