import { DEAL_FLIGHT_MS, DEAL_GAP_MS, FLIP_MS } from "@/components/card-table/dealing";
import type { BaccaratHand } from "@/lib/games/baccarat";

// When each part of a baccarat hand appears: four cards fly out face down
// (Player, Banker, Player, Banker), the Player's cards turn over, then the
// Banker's, then any third cards come out one at a time, and finally the
// result. Times are milliseconds after the hand arrives.

export const playerSlot = (i: number) => `bp:${i}`;
export const bankerSlot = (i: number) => `bb:${i}`;

/** A beat between steps, so each one reads on its own. */
const BEAT = 350;

export type Timeline = {
  /** When each card leaves the shoe. */
  dealAt: Map<string, number>;
  /** When the first two cards of each hand turn face up. */
  revealPlayerAt: number;
  revealBankerAt: number;
  /** When the winner, payouts, and new balance show. */
  doneAt: number;
};

export function baccaratTimeline(hand: Pick<BaccaratHand, "player" | "banker">): Timeline {
  const dealAt = new Map<string, number>();
  [playerSlot(0), bankerSlot(0), playerSlot(1), bankerSlot(1)].forEach((slot, i) => dealAt.set(slot, i * DEAL_GAP_MS));
  const revealPlayerAt = 3 * DEAL_GAP_MS + DEAL_FLIGHT_MS + BEAT;
  const revealBankerAt = revealPlayerAt + FLIP_MS + BEAT;
  let t = revealBankerAt + FLIP_MS + BEAT;
  if (hand.player.length === 3) {
    dealAt.set(playerSlot(2), t);
    t += DEAL_FLIGHT_MS + BEAT;
  }
  if (hand.banker.length === 3) {
    dealAt.set(bankerSlot(2), t);
    t += DEAL_FLIGHT_MS + BEAT;
  }
  return { dealAt, revealPlayerAt, revealBankerAt, doneAt: t };
}
