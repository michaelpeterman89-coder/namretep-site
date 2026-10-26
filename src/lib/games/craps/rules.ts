import { formatChips } from "@/lib/chips";

// Settings for a craps table, stored in game_tables.rules, and the payout
// tables they lead to. Payouts are written as [win, per] — e.g. [7, 6] means
// "pays 7 for every 6 bet".

export type CrapsVariant = "standard" | "crapless";
/** How much odds you may take behind a line bet. "345" = 3x on 4/10, 4x on 5/9, 5x on 6/8. */
export type OddsLimit = "1" | "2" | "345" | "5" | "10" | "100";

export type CrapsRules = {
  variant: CrapsVariant;
  odds: OddsLimit;
  /** What the field pays on 12 (2 always pays double). */
  field12: 2 | 3;
  /** Buy/lay commission: taken only from wins, or up front when the bet is made. */
  vig: "win" | "upfront";
  /** One-roll proposition bets and hardways. */
  props: boolean;
  hops: boolean;
  fireBet: boolean;
  /** All Small, All Tall, and Make 'Em All. */
  allSmallTall: boolean;
};

export const DEFAULT_CRAPS_RULES: CrapsRules = {
  variant: "standard",
  odds: "345",
  field12: 3,
  vig: "win",
  props: true,
  hops: true,
  fireBet: true,
  allSmallTall: true,
};

export const ODDS_LIMITS: Record<OddsLimit, string> = {
  "1": "1x",
  "2": "2x",
  "345": "3-4-5x",
  "5": "5x",
  "10": "10x",
  "100": "100x",
};

export type Ratio = readonly [win: number, per: number];

/** Every total that can be a point. Crapless adds 2, 3, 11, and 12. */
export function pointNumbers(variant: CrapsVariant): number[] {
  return variant === "crapless" ? [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] : [4, 5, 6, 8, 9, 10];
}

/** True odds of rolling `n` before a 7, as [win, per] for a bet on the number. */
export const TRUE_ODDS: Record<number, Ratio> = {
  2: [6, 1],
  3: [3, 1],
  4: [2, 1],
  5: [3, 2],
  6: [6, 5],
  8: [6, 5],
  9: [3, 2],
  10: [2, 1],
  11: [3, 1],
  12: [6, 1],
};

/** Place bet payouts (a little less than true odds: that's the house edge). */
export const PLACE_PAYS: Record<number, Ratio> = {
  2: [11, 2],
  3: [11, 4],
  4: [9, 5],
  5: [7, 5],
  6: [7, 6],
  8: [7, 6],
  9: [7, 5],
  10: [9, 5],
  11: [11, 4],
  12: [11, 2],
};

/** One-roll proposition payouts. */
export const PROP_PAYS = {
  any7: [4, 1],
  anyCraps: [7, 1],
  two: [30, 1],
  three: [15, 1],
  yo: [15, 1],
  twelve: [30, 1],
  hopEasy: [15, 1],
  hopHard: [30, 1],
} as const satisfies Record<string, Ratio>;

export const HARDWAY_PAYS: Record<number, Ratio> = { 4: [7, 1], 6: [9, 1], 8: [9, 1], 10: [7, 1] };

/** Fire Bet: pays by how many different points (4–10) the shooter made. */
export const FIRE_PAYS: Record<number, Ratio> = { 4: [24, 1], 5: [249, 1], 6: [999, 1] };

export const ALL_SMALL_TALL_PAYS = { allSmall: [34, 1], allTall: [34, 1], makeEmAll: [175, 1] } as const satisfies Record<
  string,
  Ratio
>;

/** The most odds you may take behind a line bet on `point`, as a multiple of the line bet. */
export function maxOddsMultiple(rules: CrapsRules, point: number): number {
  if (rules.odds !== "345") return Number(rules.odds);
  if (point === 6 || point === 8) return 5;
  if (point === 5 || point === 9) return 4;
  return 3;
}

/**
 * Lay odds (against the point) are limited by what they would win: the same
 * as the most a player could win taking odds on that number.
 */
export function maxLayOddsWin(rules: CrapsRules, point: number, flat: number): number {
  const [win, per] = TRUE_ODDS[point];
  return Math.floor((maxOddsMultiple(rules, point) * flat * win) / per);
}

/** Pays `amount` at `ratio`, rounding down (casinos never pay fractions of a chip). */
export function pay(amount: number, [win, per]: Ratio): number {
  return Math.floor((amount * win) / per);
}

/** Commission on buy and lay bets: 5%, at least 1 chip. */
export function commission(base: number): number {
  return Math.max(1, Math.floor(base * 0.05));
}

/** House edge (%) on the Pass Line for this variant. */
export function passLineEdge(rules: CrapsRules): number {
  return rules.variant === "crapless" ? 5.38 : 1.41;
}

/** A short label for the table list, e.g. "Craps · 3-4-5x · Field 3x". */
export function crapsSummary(rules: CrapsRules): string {
  const parts = [rules.variant === "crapless" ? "Crapless" : "Craps", `${ODDS_LIMITS[rules.odds]} odds`, `Field 12 pays ${rules.field12}x`];
  return parts.join(" · ");
}

export type CrapsRulesResult = { ok: true; rules: CrapsRules } | { ok: false; error: string };

/** Checks craps settings from a form or the database and returns a clean copy. */
export function parseCrapsRules(input: unknown): CrapsRulesResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Settings are missing." };
  const r = input as Record<string, unknown>;
  if (r.variant !== "standard" && r.variant !== "crapless") return { ok: false, error: "Pick craps or crapless craps." };
  if (typeof r.odds !== "string" || !(r.odds in ODDS_LIMITS)) return { ok: false, error: "Pick how much odds are allowed." };
  if (r.field12 !== 2 && r.field12 !== 3) return { ok: false, error: "The field pays 2x or 3x on 12." };
  if (r.vig !== "win" && r.vig !== "upfront") return { ok: false, error: "Pick when buy and lay commission is charged." };
  for (const key of ["props", "hops", "fireBet", "allSmallTall"] as const) {
    if (typeof r[key] !== "boolean") return { ok: false, error: "Choose which bonus bets are offered." };
  }
  return {
    ok: true,
    rules: {
      variant: r.variant,
      odds: r.odds as OddsLimit,
      field12: r.field12,
      vig: r.vig,
      props: r.props as boolean,
      hops: r.hops as boolean,
      fireBet: r.fireBet as boolean,
      allSmallTall: r.allSmallTall as boolean,
    },
  };
}

/** The table's bet limits, e.g. "Bets 5–500". */
export function betLimits(minBet: number, maxBet: number): string {
  return `Bets ${formatChips(minBet)}–${formatChips(maxBet)}`;
}
