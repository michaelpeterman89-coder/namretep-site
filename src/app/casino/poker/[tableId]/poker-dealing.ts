import { DEAL_FLIGHT_MS, DEAL_GAP_MS, EMPTY_PLAN, FLIP_MS, type DealPlan, type PlanEntry } from "@/components/card-table/dealing";
import type { Card } from "@/lib/games/deck";
import type { PublicHand } from "@/lib/games/poker";

// Which poker cards to animate between two updates: new hole cards and board
// cards fly out of the shoe (in real dealing order for a new hand), and cards
// turned over at showdown flip together.

export const holeSlot = (playerId: string, i: number) => `h:${playerId}:${i}`;
export const boardSlot = (i: number) => `b:${i}`;

type HandLike = { id: string; view: PublicHand };
type Slot = { key: string; card: Card | null };

function slots(view: PublicHand): Slot[] {
  const result: Slot[] = [];
  for (const seat of view.seats) {
    if (seat.folded) continue; // folded cards are mucked
    for (let i = 0; i < seat.holeCount; i++) result.push({ key: holeSlot(seat.playerId, i), card: seat.hole[i] ?? null });
  }
  view.board.forEach((card, i) => result.push({ key: boardSlot(i), card }));
  return result;
}

/** A new hand is dealt one card at a time around the table, starting left of the button. */
function dealingOrder(view: PublicHand): string[] {
  const n = view.seats.length;
  const holeCards = Math.max(0, ...view.seats.map((s) => s.holeCount));
  const order: string[] = [];
  for (let c = 0; c < holeCards; c++) {
    for (let k = 1; k <= n; k++) order.push(holeSlot(view.seats[(view.button + k) % n].playerId, c));
  }
  view.board.forEach((_, i) => order.push(boardSlot(i)));
  return order;
}

export function computePokerPlan(prev: HandLike | null, next: HandLike | null, reducedMotion: boolean): DealPlan {
  if (!next || reducedMotion) return EMPTY_PLAN;
  const sameHand = prev?.id === next.id;
  const before = new Map(sameHand && prev ? slots(prev.view).map((s) => [s.key, s.card] as const) : []);

  const deals: string[] = [];
  const flips: string[] = [];
  for (const slot of slots(next.view)) {
    if (!before.has(slot.key)) deals.push(slot.key);
    else if (before.get(slot.key) === null && slot.card !== null) flips.push(slot.key);
  }
  if (!sameHand) {
    const order = dealingOrder(next.view);
    deals.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  const entries = new Map<string, PlanEntry>();
  let t = 0;
  let end = 0;
  for (const key of deals) {
    entries.set(key, { delay: t, kind: "deal" });
    end = t + DEAL_FLIGHT_MS;
    t += DEAL_GAP_MS;
  }
  // Showdown: everyone's cards turn over together.
  for (const key of flips) entries.set(key, { delay: t, kind: "flip" });
  if (flips.length > 0) end = t + FLIP_MS;
  return { entries, durationMs: end };
}
