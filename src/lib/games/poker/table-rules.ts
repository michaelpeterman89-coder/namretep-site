import { formatChips } from "@/lib/chips";
import type { PokerConfig } from "./engine";
import { VARIANTS, type VariantId } from "./variants";

// Settings for a poker table, stored in game_tables.rules.

export type PokerTableRules = {
  variant: VariantId;
  structure: "no-limit";
  smallBlind: number;
  bigBlind: number;
  ante: number;
  /** Smallest and largest stack you can sit down with. */
  minBuyIn: number;
  maxBuyIn: number;
  /** How many seats computer opponents fill (they leave room for real players). */
  bots: number;
};

export const POKER_LIMITS = { maxSeats: 9, maxBuyIn: 1_000_000 };

export const DEFAULT_POKER_RULES: PokerTableRules = {
  variant: "holdem",
  structure: "no-limit",
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  minBuyIn: 200,
  maxBuyIn: 1_000,
  bots: 3,
};

export type PokerRulesResult = { ok: true; rules: PokerTableRules } | { ok: false; error: string };

const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Checks poker settings from a form or the database and returns a clean copy. */
export function parsePokerRules(input: unknown, seats: number): PokerRulesResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Settings are missing." };
  const r = input as Record<string, unknown>;
  if (r.variant !== "holdem") return { ok: false, error: "Only Texas Hold'em is available right now." };
  if (r.structure !== "no-limit") return { ok: false, error: "Only No-Limit is available right now." };
  if (!whole(r.smallBlind) || r.smallBlind < 1) return { ok: false, error: "Small blind must be at least 1." };
  if (!whole(r.bigBlind) || r.bigBlind < r.smallBlind) {
    return { ok: false, error: "Big blind must be at least the small blind." };
  }
  const ante = r.ante ?? 0;
  if (!whole(ante) || ante < 0 || ante > r.bigBlind) return { ok: false, error: "Ante must be between 0 and the big blind." };
  if (!whole(r.minBuyIn) || r.minBuyIn < r.bigBlind * 10) {
    return { ok: false, error: "Minimum buy-in must be at least 10 big blinds." };
  }
  if (!whole(r.maxBuyIn) || r.maxBuyIn < r.minBuyIn || r.maxBuyIn > POKER_LIMITS.maxBuyIn) {
    return { ok: false, error: `Maximum buy-in must be between the minimum and ${formatChips(POKER_LIMITS.maxBuyIn)}.` };
  }
  if (!whole(r.bots) || r.bots < 0 || r.bots > seats - 1) {
    return { ok: false, error: "Bots can fill every seat but one (leave room for you)." };
  }
  return {
    ok: true,
    rules: {
      variant: r.variant,
      structure: r.structure,
      smallBlind: r.smallBlind,
      bigBlind: r.bigBlind,
      ante,
      minBuyIn: r.minBuyIn,
      maxBuyIn: r.maxBuyIn,
      bots: r.bots,
    },
  };
}

/** Engine settings for a hand at this table. */
export function engineConfig(rules: PokerTableRules): PokerConfig {
  return {
    variant: rules.variant,
    structure: rules.structure,
    smallBlind: rules.smallBlind,
    bigBlind: rules.bigBlind,
    ante: rules.ante,
  };
}

/** Short label like "NL Hold'em · 5/10" (also the key for stats). */
export function pokerSummary(rules: PokerTableRules): string {
  const name = VARIANTS[rules.variant].name.replace("Texas ", "");
  const ante = rules.ante > 0 ? ` · ante ${formatChips(rules.ante)}` : "";
  return `NL ${name} · ${formatChips(rules.smallBlind)}/${formatChips(rules.bigBlind)}${ante}`;
}
