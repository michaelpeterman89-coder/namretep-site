import type { Card } from "@/lib/games/deck";
import {
  betNotOffered,
  CUT_CARD,
  dealHand,
  isMainBet,
  settleBet,
  type BaccaratBetKind,
  type BaccaratHand,
  type BetOutcome,
} from "./engine";
import { rankOf } from "@/lib/games/deck";
import type { RoadResult } from "./roads";
import type { BaccaratRules } from "./rules";

// A baccarat table between and during hands: bets on the felt, who's ready,
// the last hand, and the scoreboard for the current shoe. Pure functions;
// the server stores the state and moves the chips.

/** With other players: time to bet after the first bet before the cards come out. */
export const BETTING_MS = 15_000;
/** Time for the cards and payouts to show before the next hand can be dealt. */
export const HAND_PAUSE_MS = 7_000;

export type BaccaratBet = { playerId: string; kind: BaccaratBetKind; amount: number };

export type BetResult = BaccaratBet & { outcome: BetOutcome; winnings: number; credit: number };

export type LastHand = {
  /** Hand number at this table (so browsers can tell a new hand from an old one). */
  n: number;
  hand: BaccaratHand;
  results: BetResult[];
  /** This hand started a fresh shoe (the scoreboard was cleared). */
  newShoe: boolean;
};

export type BaccaratState = {
  bets: BaccaratBet[];
  /** Players who pressed Deal (multiplayer waits for everyone with a bet). */
  ready: string[];
  handNumber: number;
  lastHand: LastHand | null;
  /** Results this shoe, for the scoreboards. */
  history: RoadResult[];
  cardsLeft: number;
  /** When the last hand was dealt (ISO), so the next waits for the payout to show. */
  dealtAt: string | null;
};

export function newBaccaratState(cardsLeft: number): BaccaratState {
  return { bets: [], ready: [], handNumber: 0, lastHand: null, history: [], cardsLeft, dealtAt: null };
}

export class IllegalBaccaratBet extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalBaccaratBet";
  }
}

export type Limits = { minBet: number; maxBet: number };

/** Adds chips to a bet (one bet per player per kind). */
export function addBet(
  state: BaccaratState,
  rules: BaccaratRules,
  limits: Limits,
  playerId: string,
  kind: BaccaratBetKind,
  amount: number,
): BaccaratState {
  const notOffered = betNotOffered(rules, kind);
  if (notOffered) throw new IllegalBaccaratBet(notOffered);
  if (!Number.isInteger(amount) || amount < 1) throw new IllegalBaccaratBet("Bets must be at least 1 chip.");
  const existing = state.bets.find((b) => b.playerId === playerId && b.kind === kind);
  const total = (existing?.amount ?? 0) + amount;
  // The table minimum is for Player and Banker; the Tie and side bets need only 1 chip.
  if ((kind === "player" || kind === "banker") && total < limits.minBet) {
    throw new IllegalBaccaratBet(`The table minimum is ${limits.minBet}.`);
  }
  if (total > limits.maxBet) throw new IllegalBaccaratBet(`The table maximum is ${limits.maxBet}.`);
  const bets = existing
    ? state.bets.map((b) => (b === existing ? { ...b, amount: total } : b))
    : [...state.bets, { playerId, kind, amount }];
  return { ...state, bets, ready: state.ready.filter((id) => id !== playerId) };
}

/** Takes the player's bets down (all of them, or one kind). Returns the refund. */
export function removeBets(
  state: BaccaratState,
  playerId: string,
  kind?: BaccaratBetKind,
): { state: BaccaratState; refund: number } {
  const gone = state.bets.filter((b) => b.playerId === playerId && (!kind || b.kind === kind));
  return {
    state: {
      ...state,
      bets: state.bets.filter((b) => !gone.includes(b)),
      ready: state.ready.filter((id) => id !== playerId),
    },
    refund: gone.reduce((s, b) => s + b.amount, 0),
  };
}

/** The player's bets from the last hand, to place again. */
export function lastBetsOf(state: BaccaratState, playerId: string): BaccaratBet[] {
  return (state.lastHand?.results ?? [])
    .filter((r) => r.playerId === playerId)
    .map((r) => ({ playerId, kind: r.kind, amount: r.amount }));
}

/** Players with chips on the felt. */
export const bettors = (state: BaccaratState) => [...new Set(state.bets.map((b) => b.playerId))];

/** Everyone with a bet has pressed Deal. */
export const allReady = (state: BaccaratState) => {
  const who = bettors(state);
  return who.length > 0 && who.every((id) => state.ready.includes(id));
};

export type DealOutcome = {
  state: BaccaratState;
  /** Cards left in the shoe after this hand. */
  shoe: Card[];
  hand: BaccaratHand;
  /** Chips going back to each player. */
  credits: Map<string, number>;
  results: BetResult[];
};

/**
 * Deals a hand from the shoe and settles every bet. A shoe below the cut card
 * is replaced by `freshShoe()` first (and the scoreboard starts over).
 */
export function dealAndSettle(
  state: BaccaratState,
  rules: BaccaratRules,
  shoe: Card[],
  freshShoe: () => Card[],
  now: Date,
): DealOutcome {
  const newShoe = shoe.length < CUT_CARD;
  const cards = newShoe ? freshShoe() : [...shoe];
  let i = 0;
  const hand = dealHand(() => cards[i++]);

  const results: BetResult[] = state.bets.map((b) => ({ ...b, ...settleBet(rules, b.kind, b.amount, hand) }));
  const credits = new Map<string, number>();
  for (const r of results) if (r.credit > 0) credits.set(r.playerId, (credits.get(r.playerId) ?? 0) + r.credit);

  const road: RoadResult = {
    winner: hand.winner,
    playerPair: rankOf(hand.player[0]) === rankOf(hand.player[1]),
    bankerPair: rankOf(hand.banker[0]) === rankOf(hand.banker[1]),
    natural: hand.natural,
    total: hand.winner === "banker" ? hand.bankerTotal : hand.playerTotal,
  };
  const handNumber = state.handNumber + 1;
  return {
    state: {
      bets: [],
      ready: [],
      handNumber,
      lastHand: { n: handNumber, hand, results, newShoe },
      history: [...(newShoe ? [] : state.history), road],
      cardsLeft: cards.length - i,
      dealtAt: now.toISOString(),
    },
    shoe: cards.slice(i),
    hand,
    credits,
    results,
  };
}

export type BaccaratStatLine = {
  player_id: string;
  game: "baccarat";
  rules_key: string;
  net: number;
  counters: Record<string, number>;
};

/** One stats line per player who bet on the hand. */
export function baccaratHandStats(results: BetResult[], hand: BaccaratHand, rulesKey: string): BaccaratStatLine[] {
  const lines = new Map<string, BaccaratStatLine>();
  for (const r of results) {
    let l = lines.get(r.playerId);
    if (!l) {
      l = { player_id: r.playerId, game: "baccarat", rules_key: rulesKey, net: 0, counters: {} };
      lines.set(r.playerId, l);
    }
    l.net += r.credit - r.amount;
    const key = isMainBet(r.kind) ? `${r.kind}_bets` : "side_bets";
    l.counters[key] = (l.counters[key] ?? 0) + 1;
    if (r.outcome === "win") {
      const wonKey = isMainBet(r.kind) ? `${r.kind}_wins` : "side_wins";
      l.counters[wonKey] = (l.counters[wonKey] ?? 0) + 1;
    }
  }
  for (const l of lines.values()) {
    if (hand.natural) l.counters.naturals = 1;
  }
  return [...lines.values()];
}
