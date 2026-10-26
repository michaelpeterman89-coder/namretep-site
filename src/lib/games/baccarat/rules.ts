// Settings for a baccarat table, stored in game_tables.rules, plus the fixed
// drawing rules every casino uses.

export type BaccaratVariant = "classic" | "super6" | "ez";

export type BaccaratRules = {
  /** classic: Banker pays 19:20 (5% commission). super6: no commission, a Banker 6 pays half. ez: no commission, a Banker 3-card 7 pushes. */
  variant: BaccaratVariant;
  decks: 6 | 8;
  tiePays: 8 | 9;
  /** Player Pair, Banker Pair, Either Pair, Perfect Pair. */
  pairs: boolean;
  dragonBonus: boolean;
  /** Dragon 7 and Panda 8 (EZ Baccarat tables only). */
  dragon7Panda8: boolean;
  bigSmall: boolean;
};

export const DEFAULT_BACCARAT_RULES: BaccaratRules = {
  variant: "classic",
  decks: 8,
  tiePays: 8,
  pairs: true,
  dragonBonus: true,
  dragon7Panda8: true,
  bigSmall: true,
};

export const VARIANT_NAMES: Record<BaccaratVariant, string> = {
  classic: "Classic",
  super6: "No-commission (Super 6)",
  ez: "EZ Baccarat",
};

/** A short label for the table list, e.g. "Baccarat · Classic · 8D · Tie 8:1". */
export function baccaratSummary(rules: BaccaratRules): string {
  return ["Baccarat", VARIANT_NAMES[rules.variant], `${rules.decks}D`, `Tie ${rules.tiePays}:1`].join(" · ");
}

/** House edge (%) on the Banker bet for this version (8 decks). */
export function bankerEdge(rules: BaccaratRules): number {
  return rules.variant === "classic" ? 1.06 : rules.variant === "super6" ? 1.46 : 1.02;
}

export type BaccaratRulesResult = { ok: true; rules: BaccaratRules } | { ok: false; error: string };

/** Checks baccarat settings from a form or the database and returns a clean copy. */
export function parseBaccaratRules(input: unknown): BaccaratRulesResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Settings are missing." };
  const r = input as Record<string, unknown>;
  if (r.variant !== "classic" && r.variant !== "super6" && r.variant !== "ez") {
    return { ok: false, error: "Pick classic, no-commission, or EZ baccarat." };
  }
  if (r.decks !== 6 && r.decks !== 8) return { ok: false, error: "The shoe holds 6 or 8 decks." };
  if (r.tiePays !== 8 && r.tiePays !== 9) return { ok: false, error: "Tie pays 8:1 or 9:1." };
  for (const key of ["pairs", "dragonBonus", "dragon7Panda8", "bigSmall"] as const) {
    if (typeof r[key] !== "boolean") return { ok: false, error: "Choose which side bets are offered." };
  }
  return {
    ok: true,
    rules: {
      variant: r.variant,
      decks: r.decks,
      tiePays: r.tiePays,
      pairs: r.pairs as boolean,
      dragonBonus: r.dragonBonus as boolean,
      // Dragon 7 and Panda 8 belong to EZ Baccarat.
      dragon7Panda8: r.variant === "ez" && (r.dragon7Panda8 as boolean),
      bigSmall: r.bigSmall as boolean,
    },
  };
}

// ---------- Drawing rules (the same at every casino) ----------

/** The Player draws a third card on 0–5 and stands on 6–7 (8–9 is a natural). */
export const playerDraws = (total: number) => total <= 5;

/**
 * Whether the Banker draws, given its total and the Player's third card
 * (null if the Player stood).
 */
export function bankerDraws(total: number, playerThird: number | null): boolean {
  if (playerThird === null) return total <= 5;
  if (total <= 2) return true;
  if (total === 3) return playerThird !== 8;
  if (total === 4) return playerThird >= 2 && playerThird <= 7;
  if (total === 5) return playerThird >= 4 && playerThird <= 7;
  if (total === 6) return playerThird === 6 || playerThird === 7;
  return false;
}
