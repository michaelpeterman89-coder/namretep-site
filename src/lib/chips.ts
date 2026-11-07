// Keep in sync with public.claim_daily_refill() in supabase/migrations.
export const STARTING_CHIPS = 10_000;
export const REFILL_LOW_THRESHOLD = 2_500;
export const REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type RefillStatus =
  | { kind: "available" }
  | { kind: "not-low" }
  | { kind: "cooldown"; availableAt: Date };

/**
 * Whether a player can claim the daily refill. Mirrors the database check so
 * the UI can explain why the button is disabled; the database has the final say.
 */
export function getRefillStatus(chips: number, lastRefillAt: Date | null, now: Date): RefillStatus {
  if (chips >= REFILL_LOW_THRESHOLD) return { kind: "not-low" };
  if (lastRefillAt) {
    const availableAt = new Date(lastRefillAt.getTime() + REFILL_COOLDOWN_MS);
    if (availableAt > now) return { kind: "cooldown", availableAt };
  }
  return { kind: "available" };
}

export function formatChips(chips: number): string {
  return chips.toLocaleString("en-US");
}

/** A table's limits for showing: "10–500", or "10+ (no max)" when there's no maximum (null). */
export function formatLimits(min: number, max: number | null): string {
  return max === null ? `${formatChips(min)}+ (no max)` : `${formatChips(min)}–${formatChips(max)}`;
}

/** The allowed range in a sentence: "Bet must be {this}." */
export function limitsInWords(min: number, max: number | null): string {
  return max === null ? `at least ${formatChips(min)}` : `between ${formatChips(min)} and ${formatChips(max)}`;
}
