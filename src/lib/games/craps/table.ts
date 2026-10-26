import type { BetResult, RollEvent } from "./engine";

// Table-level craps rules: timing, passing the dice, and stats per roll.

/** Time for the dice to land and pay before anyone rolls again (solo play). */
export const ROLL_PAUSE_MS = 2_500;
/** With other players at the table: time for everyone to bet before the next roll. */
export const BETTING_MS = 8_000;
/** A shooter who doesn't roll for this long (with others waiting) passes the dice. */
export const SHOOTER_TIMEOUT_MS = 30_000;

/** When the next roll is allowed, given how many players are seated. */
export function nextRollAt(now: number, seatedPlayers: number): Date {
  return new Date(now + (seatedPlayers > 1 ? BETTING_MS : ROLL_PAUSE_MS));
}

/**
 * The next shooter, going round the table by seat number. With no current
 * shooter (or one who left), the dice go to the first seated player after
 * `afterSeat`.
 */
export function nextShooter(seated: { seatNumber: number; playerId: string }[], afterSeat: number | null): string | null {
  if (seated.length === 0) return null;
  const order = [...seated].sort((a, b) => a.seatNumber - b.seatNumber);
  if (afterSeat === null) return order[0].playerId;
  return (order.find((s) => s.seatNumber > afterSeat) ?? order[0]).playerId;
}

export type CrapsStatLine = { player_id: string; game: "craps"; rules_key: string; net: number; counters: Record<string, number> };

/**
 * Each player's result for one roll: chips won minus chips lost on bets that
 * were decided. Each line counts as one roll played (for anyone whose bets
 * were decided, and for the shooter).
 */
export function crapsRollStats(
  results: BetResult[],
  shooterId: string | null,
  event: RollEvent,
  rulesKey: string,
): CrapsStatLine[] {
  const lines = new Map<string, CrapsStatLine>();
  const line = (playerId: string) => {
    let l = lines.get(playerId);
    if (!l) {
      l = { player_id: playerId, game: "craps", rules_key: rulesKey, net: 0, counters: {} };
      lines.set(playerId, l);
    }
    return l;
  };
  const add = (l: CrapsStatLine, key: string, n = 1) => (l.counters[key] = (l.counters[key] ?? 0) + n);

  for (const r of results) {
    if (r.outcome === "moved" || (r.outcome === "push" && r.credit === 0)) continue;
    const l = line(r.playerId);
    if (r.outcome === "win") {
      l.net += r.winnings;
      add(l, "bets_won");
      if (r.kind === "fire") add(l, "fire_wins");
      if (r.kind === "allSmall" || r.kind === "allTall" || r.kind === "makeEmAll") add(l, "small_tall_wins");
      if (r.kind === "hop") add(l, "hop_wins");
    } else if (r.outcome === "lose") {
      l.net -= r.amount;
      add(l, "bets_lost");
    }
  }

  if (shooterId) {
    // The shooter's counters ride on their stats line, so a roll they shot
    // counts as a roll played even if none of their bets were decided.
    const l = line(shooterId);
    add(l, "rolls_shot");
    if (event === "pointMade") add(l, "points_made");
    if (event === "sevenOut") add(l, "sevens_out");
  }
  return [...lines.values()];
}
