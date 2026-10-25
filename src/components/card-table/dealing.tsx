"use client";

import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from "react";
import { ChipStack, DENOMINATIONS, type ChipSize } from "@/components/chip";
import { CARD_DIMENSIONS, CardBack, PlayingCard, type CardSize } from "@/components/playing-card";
import { playSound, playSoundAt } from "@/lib/sound";
import type { Card } from "@/lib/games/blackjack/cards";
import type { PublicRound } from "@/lib/games/blackjack/engine";

// Dealing animation: each new card flies out of the shoe to its spot, one at
// a time in real dealing order, and the dealer's hole card flips over when
// revealed. A "plan" lists the delay for every card that changed in the
// latest update, plus how long the whole thing takes (so the table can hold
// back totals and results until the cards have landed).

export const DEAL_GAP_MS = 450;
export const DEAL_FLIGHT_MS = 550;
export const FLIP_MS = 650;

export type PlanEntry = { delay: number; kind: "deal" | "flip" };
export type DealPlan = { entries: Map<string, PlanEntry>; durationMs: number };
export const EMPTY_PLAN: DealPlan = { entries: new Map(), durationMs: 0 };

export const dealerSlot = (i: number) => `d:${i}`;
export const playerSlot = (playerId: string, hand: number, i: number) => `p:${playerId}:${hand}:${i}`;

type RoundLike = { roundId: string; view: PublicRound };
/** A card position and what's in it (null = face down). */
type Slot = { key: string; card: Card | null };

/** Every card position on the table, players first, then the dealer. */
function slots(view: PublicRound): Slot[] {
  const result: Slot[] = [];
  for (const seat of view.seats) {
    seat.hands.forEach((hand, h) =>
      hand.cards.forEach((card, i) => result.push({ key: playerSlot(seat.playerId, h, i), card })),
    );
  }
  const dealerCards = view.dealer.length + view.dealerHidden;
  for (let i = 0; i < dealerCards; i++) result.push({ key: dealerSlot(i), card: view.dealer[i] ?? null });
  return result;
}

/** The order a fresh round is dealt: a card to each player, dealer up, second cards, hole card. */
function openingOrder(view: PublicRound): string[] {
  const firstHands = view.seats.map((s) => s.playerId);
  return [
    ...firstHands.map((id) => playerSlot(id, 0, 0)),
    dealerSlot(0),
    ...firstHands.map((id) => playerSlot(id, 0, 1)),
    dealerSlot(1),
  ];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Works out which cards to animate going from `prev` to `next`, and when. */
export function computePlan(prev: RoundLike | null, next: RoundLike | null, reducedMotion: boolean): DealPlan {
  if (!next || reducedMotion) return EMPTY_PLAN;
  const sameRound = prev?.roundId === next.roundId;
  const before = new Map(sameRound && prev ? slots(prev.view).map((s) => [s.key, s.card] as const) : []);

  const changed: { key: string; kind: PlanEntry["kind"] }[] = [];
  for (const slot of slots(next.view)) {
    if (!before.has(slot.key)) {
      // The first card of a split hand is moved, not dealt.
      const [, , hand, index] = slot.key.split(":");
      if (slot.key.startsWith("p:") && hand !== "0" && index === "0" && sameRound) continue;
      changed.push({ key: slot.key, kind: "deal" });
    } else {
      const was = before.get(slot.key);
      if (was === null && slot.card !== null) changed.push({ key: slot.key, kind: "flip" });
      // A different card in the same spot (after a split) is a fresh deal.
      else if (was !== slot.card) changed.push({ key: slot.key, kind: "deal" });
    }
  }

  if (!sameRound) {
    const order = openingOrder(next.view);
    const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
    changed.sort((a, b) => rank(a.key) - rank(b.key));
  }

  const entries = new Map<string, PlanEntry>();
  let t = 0;
  let end = 0;
  for (const item of changed) {
    entries.set(item.key, { delay: t, kind: item.kind });
    end = t + (item.kind === "flip" ? FLIP_MS : DEAL_FLIGHT_MS);
    t += item.kind === "flip" ? FLIP_MS : DEAL_GAP_MS;
  }
  return { entries, durationMs: end };
}

// ---------- Paying out and clearing the table ----------

// After the last card lands, the dealer settles one hand at a time (from
// the last seat back to the first, like a real table), shows the results,
// then sweeps the cards to the discard tray before betting reopens.

export const SETTLE_PAUSE_MS = 400;
export const PAY_GAP_MS = 450;
export const PAY_FLIGHT_MS = 500;
export const RESULT_HOLD_MS = 2000;
export const CLEAR_MS = 650;

export type Settlement = {
  roundId: string;
  /** When each hand ("playerId:handIndex") is paid or collected. */
  payAt: Map<string, number>;
  /** When results ("You won 20!") and the new balance show. */
  resultsAt: number;
  /** When the cards and chips start leaving the table. */
  clearAt: number;
  /** When the table is empty and betting opens. */
  clearedAt: number;
};

export const handKey = (playerId: string, hand: number) => `${playerId}:${hand}`;

/** The payout timeline for a settled round whose cards finish landing at `dealEndsAt`. */
export function computeSettlement(round: RoundLike, dealEndsAt: number, reducedMotion: boolean): Settlement {
  const hands = round.view.seats.flatMap((seat) => seat.hands.map((_, h) => handKey(seat.playerId, h))).reverse();
  const pause = reducedMotion ? 0 : SETTLE_PAUSE_MS;
  const gap = reducedMotion ? 0 : PAY_GAP_MS;
  const flight = reducedMotion ? 0 : PAY_FLIGHT_MS;
  const start = dealEndsAt + pause;
  const payAt = new Map(hands.map((key, i) => [key, start + i * gap] as const));
  const resultsAt = start + Math.max(0, hands.length - 1) * gap + flight;
  const clearAt = resultsAt + RESULT_HOLD_MS;
  return { roundId: round.roundId, payAt, resultsAt, clearAt, clearedAt: clearAt + (reducedMotion ? 0 : CLEAR_MS) };
}

/** A round that's already finished when the page opens: show the table cleared. */
export function alreadyCleared(roundId: string): Settlement {
  return { roundId, payAt: new Map(), resultsAt: 0, clearAt: 0, clearedAt: 0 };
}

type Refs = {
  shoeRef: RefObject<HTMLDivElement | null>;
  discardRef: RefObject<HTMLDivElement | null>;
  trayRef: RefObject<HTMLDivElement | null>;
};
type DealContextValue = Refs & { plan: DealPlan; settlement: Settlement | null };
export const DealContext = createContext<DealContextValue>({
  shoeRef: { current: null },
  discardRef: { current: null },
  trayRef: { current: null },
  plan: EMPTY_PLAN,
  settlement: null,
});

function centerOffset(from: Element, to: Element) {
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  return { dx: a.left + a.width / 2 - (b.left + b.width / 2), dy: a.top + a.height / 2 - (b.top + b.height / 2) };
}

const waitUntil = (at: number) => Math.max(0, at - Date.now());

/**
 * A card at the table. `card` null means face down. New cards fly in from
 * the shoe; a face-down card that gets a value flips over.
 */
export function DealtCard({ slot, card, size = "md" }: { slot: string; card: Card | null; size?: CardSize }) {
  const { shoeRef, discardRef, plan, settlement } = useContext(DealContext);
  const clearAt = settlement?.clearAt;
  const entry = plan.entries.get(slot);
  const ref = useRef<HTMLDivElement>(null);
  const flown = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const shoe = shoeRef.current;
    if (flown.current || !el || !shoe || entry?.kind !== "deal") return;
    flown.current = true;
    playSoundAt("deal", entry.delay);
    const from = shoe.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(0.7)`, opacity: 0.4 },
        { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 1 },
      ],
      { duration: DEAL_FLIGHT_MS, delay: entry.delay, easing: "cubic-bezier(0.25, 0.9, 0.3, 1.05)", fill: "backwards" },
    );
  }, [entry, shoeRef]);

  // When the dealer clears the table, sweep the card into the discard tray.
  useLayoutEffect(() => {
    const el = ref.current;
    const discard = discardRef.current;
    if (!el || !discard || clearAt === undefined || clearAt <= Date.now() - CLEAR_MS) return;
    const { dx, dy } = centerOffset(discard, el);
    const sweep = el.animate(
      [
        { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(12deg) scale(0.5)`, opacity: 0 },
      ],
      { duration: CLEAR_MS, delay: waitUntil(clearAt), easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" },
    );
    return () => sweep.cancel();
  }, [clearAt, discardRef]);

  const flipped = useRef(false);
  useLayoutEffect(() => {
    if (flipped.current || entry?.kind !== "flip" || !card) return;
    flipped.current = true;
    playSoundAt("flip", entry.delay);
  }, [entry, card]);

  const flipDelay = entry?.kind === "flip" ? entry.delay : 0;
  return (
    <div ref={ref} className={`flip-card ${CARD_DIMENSIONS[size]}`}>
      <div
        className="flip-inner"
        style={{ transform: card ? "rotateY(0deg)" : "rotateY(180deg)", transitionDelay: `${flipDelay}ms` }}
      >
        <div className="flip-face" aria-hidden={!card}>
          {card && <PlayingCard card={card} size={size} animate={false} />}
        </div>
        <div className="flip-face flip-back" aria-hidden={Boolean(card)}>
          <CardBack size={size} animate={false} />
        </div>
      </div>
    </div>
  );
}

/**
 * A stack of chips that can slide in from the dealer's tray (a payout),
 * slide out to it (a lost bet), and slide off toward the player when the
 * table clears (collecting winnings).
 */
export function MovingStack({
  amount,
  size,
  from,
  to,
  leaveAt,
}: {
  amount: number;
  size: ChipSize;
  from?: "tray";
  to?: "tray";
  leaveAt?: number;
}) {
  const { trayRef } = useContext(DealContext);
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const tray = trayRef.current;
    if (!el || !tray || (!from && !to)) return;
    playSound("chip");
    const { dx, dy } = centerOffset(tray, el);
    const away = { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0 };
    const here = { transform: "translate(0, 0) scale(1)", opacity: 1 };
    const move = el.animate(from ? [away, here] : [here, away], {
      duration: PAY_FLIGHT_MS,
      easing: "cubic-bezier(0.3, 0.8, 0.3, 1)",
      fill: "forwards",
    });
    return () => move.cancel();
  }, [from, to, trayRef]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || leaveAt === undefined) return;
    const collect = el.animate(
      [
        { transform: "translate(0, 0)", opacity: 1 },
        { transform: "translate(0, 3rem)", opacity: 0 },
      ],
      { duration: CLEAR_MS, delay: waitUntil(leaveAt), easing: "ease-in", fill: "forwards" },
    );
    return () => collect.cancel();
  }, [leaveAt]);

  return (
    <span ref={ref} className="inline-flex">
      <ChipStack amount={amount} size={size} />
    </span>
  );
}

/** The dealer's chip rack, where lost bets go and payouts come from. */
export function ChipTray() {
  const { trayRef } = useContext(DealContext);
  return (
    <div ref={trayRef} className="chip-tray" aria-hidden>
      {DENOMINATIONS.slice(0, 6).map((d) => (
        <span key={d.value} style={{ background: d.face }} />
      ))}
    </div>
  );
}

/** Where used cards go when the table is cleared (opposite the shoe). */
export function DiscardTray() {
  const { discardRef } = useContext(DealContext);
  return (
    <div className="absolute top-3 left-3 sm:top-5 sm:left-5" aria-hidden>
      <div ref={discardRef} className="discard" />
    </div>
  );
}

/** The card shoe the dealer deals from. */
export function Shoe({
  cardsLeft,
  className = "top-3 right-3 sm:top-5 sm:right-5",
}: {
  cardsLeft: number | null;
  /** Where the shoe sits on the table (position classes). */
  className?: string;
}) {
  const { shoeRef } = useContext(DealContext);
  return (
    <div className={`absolute flex flex-col items-center gap-1 ${className}`} aria-hidden>
      <div ref={shoeRef} className="shoe" />
      {cardsLeft !== null && <span className="font-display text-[0.5rem] text-starlight/70">{cardsLeft}</span>}
    </div>
  );
}
