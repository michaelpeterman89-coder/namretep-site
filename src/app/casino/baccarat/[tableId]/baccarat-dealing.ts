import { DEAL_FLIGHT_MS, DEAL_GAP_MS, type PlanEntry } from "@/components/card-table/dealing";
import type { BaccaratState } from "@/lib/games/baccarat";
import type { Card } from "@/lib/games/deck";

// How a baccarat hand plays out on screen. Each update from the server says
// which cards are out and which are face up; this works out what to animate and
// when each card can be read, so totals and the result wait for the flips.

export const playerSlot = (i: number) => `bp:${i}`;
export const bankerSlot = (i: number) => `bb:${i}`;

/** A slow turn for the first four cards, and a slower one for a third card, which often decides the hand. */
export const FLIP_MS = 1_100;
export const THIRD_FLIP_MS = 1_800;
/** When several cards turn over at once, how far apart they start. */
const FLIP_STEP_MS = 500;
/** A beat between steps, so each one reads on its own. */
const BEAT_MS = 400;

export type Felt = { n: number; player: (Card | null)[]; banker: (Card | null)[] };

/** The cards on the felt: the hand being turned over, or else the last one. */
export function feltOf(state: BaccaratState): Felt | null {
  if (state.reveal) return { n: state.reveal.n, player: state.reveal.player, banker: state.reveal.banker };
  if (state.lastHand) return { n: state.lastHand.n, player: state.lastHand.hand.player, banker: state.lastHand.hand.banker };
  return null;
}

export type Tracker = {
  n: number;
  /** Cards already on the felt. */
  out: string[];
  /** When each face-up card has finished turning. */
  readableAt: Map<string, number>;
  entries: Map<string, PlanEntry>;
  /** When everything so far has landed and turned. */
  busyUntil: number;
  /** When the settled hand's result shows (null if it was already over when the page opened). */
  resultAt: number | null;
  /** Third cards turned over so far. */
  thirdFlips: number;
};

/** Cards in dealing order: Player, Banker, Player, Banker, then third cards. */
function feltSlots(felt: Felt): { slot: string; card: Card | null; third: boolean }[] {
  const at = (side: (Card | null)[], slot: (i: number) => string, i: number) =>
    i < side.length ? [{ slot: slot(i), card: side[i], third: i === 2 }] : [];
  return [0, 1, 2].flatMap((i) => [...at(felt.player, playerSlot, i), ...at(felt.banker, bankerSlot, i)]);
}

/** The table as it is when the page opens: nothing to animate. */
export function startTracker(felt: Felt | null): Tracker {
  const slots = felt ? feltSlots(felt) : [];
  return {
    n: felt?.n ?? 0,
    out: slots.map((s) => s.slot),
    readableAt: new Map(slots.filter((s) => s.card).map((s) => [s.slot, 0])),
    entries: new Map(),
    busyUntil: 0,
    resultAt: null,
    thirdFlips: 0,
  };
}

/** Works in the latest update from the server. `settled` means the felt's hand is over. */
export function advanceTracker(prev: Tracker, felt: Felt | null, settled: boolean, now: number, reduced: boolean): Tracker {
  if (!felt || felt.n < prev.n) return prev;
  const sameHand = felt.n === prev.n;
  if (sameHand && !settled && prev.out.length === feltSlots(felt).length && feltSlots(felt).every((s) => !s.card || prev.readableAt.has(s.slot))) {
    return prev;
  }
  const out = sameHand ? [...prev.out] : [];
  const readableAt = new Map(sameHand ? prev.readableAt : []);
  const entries = new Map(sameHand ? prev.entries : []);
  let busyUntil = sameHand ? Math.max(prev.busyUntil, now) : now;
  let thirdFlips = sameHand ? prev.thirdFlips : 0;
  const slots = feltSlots(felt);

  // Cards turning over, staggered if there are several.
  let flipAt = busyUntil;
  const newlyOut = slots.filter((s) => !out.includes(s.slot));
  for (const { slot, card, third } of slots) {
    if (!card || readableAt.has(slot) || newlyOut.some((s) => s.slot === slot)) continue;
    const flipMs = third ? THIRD_FLIP_MS : FLIP_MS;
    if (third) thirdFlips += 1;
    if (reduced) {
      readableAt.set(slot, now);
      continue;
    }
    entries.set(slot, { delay: flipAt - now, kind: "flip", flipMs });
    readableAt.set(slot, flipAt + flipMs);
    busyUntil = Math.max(busyUntil, flipAt + flipMs);
    flipAt += FLIP_STEP_MS;
  }

  // New cards fly out once those are done.
  let dealAt = busyUntil + (sameHand && newlyOut.length > 0 ? BEAT_MS : 0);
  for (const { slot, card } of newlyOut) {
    out.push(slot);
    if (reduced) {
      if (card) readableAt.set(slot, now);
      continue;
    }
    entries.set(slot, { delay: dealAt - now, kind: "deal" });
    if (card) readableAt.set(slot, dealAt + DEAL_FLIGHT_MS);
    busyUntil = Math.max(busyUntil, dealAt + DEAL_FLIGHT_MS);
    dealAt += DEAL_GAP_MS;
  }

  const alreadyTimed = sameHand ? prev.resultAt : null;
  const resultAt = !settled ? null : (alreadyTimed ?? (reduced ? now : busyUntil + BEAT_MS));
  return { n: felt.n, out, readableAt, entries, busyUntil, resultAt, thirdFlips };
}
