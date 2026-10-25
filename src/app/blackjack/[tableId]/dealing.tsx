"use client";

import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from "react";
import { CARD_DIMENSIONS, CardBack, PlayingCard, type CardSize } from "@/components/playing-card";
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

type PlanEntry = { delay: number; kind: "deal" | "flip" };
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

type DealContextValue = { shoeRef: RefObject<HTMLDivElement | null>; plan: DealPlan };
export const DealContext = createContext<DealContextValue>({ shoeRef: { current: null }, plan: EMPTY_PLAN });

/**
 * A card at the table. `card` null means face down. New cards fly in from
 * the shoe; a face-down card that gets a value flips over.
 */
export function DealtCard({ slot, card, size = "md" }: { slot: string; card: Card | null; size?: CardSize }) {
  const { shoeRef, plan } = useContext(DealContext);
  const entry = plan.entries.get(slot);
  const ref = useRef<HTMLDivElement>(null);
  const flown = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const shoe = shoeRef.current;
    if (flown.current || !el || !shoe || entry?.kind !== "deal") return;
    flown.current = true;
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

  const flipDelay = entry?.kind === "flip" ? entry.delay : 0;
  return (
    <div ref={ref} className={`flip-card ${CARD_DIMENSIONS[size]}`}>
      <div
        className="flip-inner"
        style={{ transform: card ? "rotateY(0deg)" : "rotateY(180deg)", transitionDelay: `${flipDelay}ms` }}
      >
        <div className="flip-face">{card && <PlayingCard card={card} size={size} animate={false} />}</div>
        <div className="flip-face flip-back">
          <CardBack size={size} animate={false} />
        </div>
      </div>
    </div>
  );
}

/** The card shoe the dealer deals from. */
export function Shoe({ cardsLeft }: { cardsLeft: number | null }) {
  const { shoeRef } = useContext(DealContext);
  return (
    <div className="absolute top-3 right-3 flex flex-col items-center gap-1 sm:top-5 sm:right-5" aria-hidden>
      <div ref={shoeRef} className="shoe" />
      {cardsLeft !== null && <span className="font-display text-[0.5rem] text-starlight/60">{cardsLeft}</span>}
    </div>
  );
}
