import type { PokerHand } from "./engine";

// Pure rules for running hands at a poker table (the server stores and
// commits; these decide).

/** How long a person has to act when another person is waiting on them. */
export const POKER_TURN_SECONDS = 25;
/** Bots "think" this long so their moves don't land instantly. */
export const BOT_THINK_MS = 1200;
/** Pause after a hand so everyone can see the result before the next deal. */
export const HAND_PAUSE_MS = 6000;

const isBot = (playerId: string) => playerId.startsWith("bot:");

/**
 * Index (into `seatNumbers`, in seat order) of the next button: the first
 * seat after the previous button's seat number, wrapping around.
 */
export function nextButtonIndex(seatNumbers: number[], previousButtonSeat: number | null): number {
  if (previousButtonSeat === null) return 0;
  const after = seatNumbers.findIndex((n) => n > previousButtonSeat);
  return after === -1 ? 0 : after;
}

/**
 * When the current decision times out. `present` is everyone still sitting
 * at the table (not leaving). Bots get a short thinking pause; people get a
 * timer only if another person is in the hand; someone who left is due now.
 */
export function pokerDeadline(hand: PokerHand, present: ReadonlySet<string>, now: Date): Date | null {
  if (hand.phase === "complete" || hand.toAct === null) return null;
  const actor = hand.seats[hand.toAct].playerId;
  if (isBot(actor)) return new Date(now.getTime() + BOT_THINK_MS);
  if (!present.has(actor)) return now;
  const otherPeople = hand.seats.filter((s) => !isBot(s.playerId) && s.playerId !== actor && !s.folded).length;
  return otherPeople > 0 ? new Date(now.getTime() + POKER_TURN_SECONDS * 1000) : null;
}

export type PokerStat = {
  player_id: string;
  game: "holdem";
  rules_key: string;
  net: number;
  counters: { vpip: number; pfr: number; showdowns: number; showdown_wins: number };
};

/**
 * Stats for each person (bots skipped) in a finished hand. "vpip" = put
 * money in before the flop by choice (blinds don't count); "pfr" = raised
 * before the flop.
 */
export function pokerHandStats(hand: PokerHand, startStacks: number[], rulesKey: string): PokerStat[] {
  if (hand.phase !== "complete" || !hand.result) return [];
  const shown = new Set(hand.result.shown);
  return hand.seats.flatMap((seat, i) => {
    if (isBot(seat.playerId)) return [];
    const preflop = hand.log.filter((e) => e.seat === i && e.street === "preflop");
    const net = seat.stack - startStacks[i];
    const atShowdown = shown.has(i) && shown.size > 1;
    return [
      {
        player_id: seat.playerId,
        game: "holdem" as const,
        rules_key: rulesKey,
        net,
        counters: {
          vpip: preflop.some((e) => e.action === "call" || e.action === "raise" || e.action === "bet") ? 1 : 0,
          pfr: preflop.some((e) => e.action === "raise" || e.action === "bet") ? 1 : 0,
          showdowns: atShowdown ? 1 : 0,
          showdown_wins: atShowdown && hand.result!.payouts[i] > 0 ? 1 : 0,
        },
      },
    ];
  });
}
