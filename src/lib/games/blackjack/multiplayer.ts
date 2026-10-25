import { legalActions, type BlackjackAction, type BlackjackRound } from "./engine";
import type { BlackjackRules } from "./rules";

// Timing rules for tables with more than one player. Pure functions, so the
// server and tests share exactly the same logic.

/** How long a player has for each decision when others are waiting. */
export const TURN_SECONDS = 25;
/** How long betting stays open after the first bet at a multi-player table. */
export const BETTING_SECONDS = 15;

export type SeatState = {
  seatNumber: number;
  playerId: string;
  status: "active" | "sitting_out";
  pendingBet: number | null;
};

/** Players whose move the round is waiting for right now. */
export function waitingOn(rules: BlackjackRules, round: BlackjackRound): string[] {
  if (round.phase === "early") {
    return round.seats.filter((_, i) => legalActions(rules, round, i).length > 0).map((s) => s.playerId);
  }
  if (round.phase === "playing" && round.turn) return [round.seats[round.turn.seat].playerId];
  return [];
}

/**
 * When the current decision times out. Null means no timer: solo rounds wait
 * as long as the player likes. If someone we're waiting on has left the
 * table, the deadline is now, so their hand is finished for them right away.
 */
export function nextDeadline(
  rules: BlackjackRules,
  round: BlackjackRound,
  seatedPlayers: ReadonlySet<string>,
  now: Date,
): Date | null {
  const waiting = waitingOn(rules, round);
  if (waiting.length === 0) return null;
  if (waiting.every((id) => !seatedPlayers.has(id))) return now;
  if (round.seats.length < 2) return null;
  return new Date(now.getTime() + TURN_SECONDS * 1000);
}

/**
 * The moves to make for players who ran out of time or left: stand when it's
 * their turn, and decline insurance / early surrender. Returns them in order;
 * apply one at a time, since each can change who's up next.
 */
export function automaticAction(
  rules: BlackjackRules,
  round: BlackjackRound,
  seatedPlayers: ReadonlySet<string>,
  expired: boolean,
): BlackjackAction | null {
  for (let seat = 0; seat < round.seats.length; seat++) {
    const legal = legalActions(rules, round, seat);
    if (legal.length === 0) continue;
    if (!expired && seatedPlayers.has(round.seats[seat].playerId)) continue;
    if (round.phase === "early") return { type: "decline", seat };
    return { type: legal.includes("stand") ? "stand" : legal[0], seat };
  }
  return null;
}

/**
 * The seats to deal into the next round, or null if betting should stay open.
 * Deals once every active player has bet, or once the betting deadline passes
 * with at least one bet down. Players sitting out don't hold things up.
 */
export function seatsToDeal(seats: SeatState[], bettingDeadline: Date | null, now: Date): SeatState[] | null {
  const bettors = seats.filter((s) => s.pendingBet !== null).sort((a, b) => a.seatNumber - b.seatNumber);
  if (bettors.length === 0) return null;
  const everyoneIn = seats.every((s) => s.status === "sitting_out" || s.pendingBet !== null);
  const timeUp = bettingDeadline !== null && now >= bettingDeadline;
  return everyoneIn || timeUp ? bettors : null;
}
