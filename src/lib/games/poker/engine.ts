import { buildDecks, type Card } from "@/lib/games/deck";
import { secureRandomInt, shuffle, type RandomInt } from "@/lib/random";
import { bestHand } from "./evaluator";
import { VARIANTS, type BettingStructure, type StreetName, type VariantId } from "./variants";

// One hand of poker, as pure data. Like the blackjack engine: startHand()
// and applyAction() take a state and return a new one; nothing here knows
// about the database or the screen.

export type PokerConfig = {
  variant: VariantId;
  structure: BettingStructure;
  smallBlind: number;
  bigBlind: number;
  ante: number;
};

export type PokerSeat = {
  playerId: string;
  /** Chips behind (not yet put in the pot). */
  stack: number;
  hole: Card[];
  /** Chips put in on the current street. */
  committed: number;
  /** Chips put in over the whole hand (antes included). */
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted on this street. */
  acted: boolean;
  /** The bet level when this player last acted (for the "short all-in doesn't reopen" rule). */
  actedAtLevel: number;
};

export type LogEntry = {
  street: StreetName;
  seat: number;
  action: "ante" | "small-blind" | "big-blind" | "fold" | "check" | "call" | "bet" | "raise";
  /** Chips this action added to the pot. */
  amount: number;
  allIn: boolean;
};

export type PotResult = {
  amount: number;
  eligible: number[];
  winners: number[];
  /** Winning hand's name, or null if everyone else folded (or it was an uncalled bet). */
  hand: string | null;
};

export type HandResult = {
  pots: PotResult[];
  /** Chips won by each seat (including their own money back). */
  payouts: number[];
  /** Seats whose cards are shown at showdown. */
  shown: number[];
  /** Each seat's best hand name at showdown (null if folded or no showdown). */
  hands: (string | null)[];
};

export type PokerHand = {
  config: PokerConfig;
  streetIndex: number;
  street: StreetName;
  phase: "betting" | "complete";
  deck: Card[];
  board: Card[];
  seats: PokerSeat[];
  /** Index of the dealer button in `seats`. */
  button: number;
  toAct: number | null;
  /** Highest amount anyone must match on this street. */
  currentBet: number;
  /** Smallest legal raise increment (size of the last full bet or raise). */
  minRaise: number;
  /** Bet level after the last full bet or raise. */
  fullRaiseLevel: number;
  log: LogEntry[];
  result: HandResult | null;
};

export type PokerActionType = "fold" | "check" | "call" | "raise";
/** For "raise", `amount` is the total this player will have in on this street ("raise to"). */
export type PokerAction = { type: PokerActionType; seat: number; amount?: number };

export class IllegalPokerAction extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalPokerAction";
  }
}

// ---------- Small helpers ----------

const next = (hand: PokerHand, i: number) => (i + 1) % hand.seats.length;

function highestCommitted(hand: PokerHand): number {
  return Math.max(0, ...hand.seats.filter((s) => !s.folded).map((s) => s.committed));
}

function canStillBet(s: PokerSeat) {
  return !s.folded && !s.allIn;
}

/** Does this seat still have a decision to make on this street? */
function needsToAct(hand: PokerHand, i: number): boolean {
  const s = hand.seats[i];
  if (!canStillBet(s)) return false;
  const othersCanBet = hand.seats.some((o, j) => j !== i && canStillBet(o));
  // Alone against all-ins: only act if there's something left to call.
  if (!othersCanBet) return s.committed < highestCommitted(hand);
  return !s.acted || s.committed < hand.currentBet;
}

/** The next seat after `from` (going left) that needs to act, or null. */
function nextToAct(hand: PokerHand, from: number): number | null {
  for (let k = 1; k <= hand.seats.length; k++) {
    const i = (from + k) % hand.seats.length;
    if (needsToAct(hand, i)) return i;
  }
  return null;
}

function put(hand: PokerHand, i: number, amount: number, action: LogEntry["action"], countsAsBet = true) {
  const s = hand.seats[i];
  const pay = Math.min(amount, s.stack);
  s.stack -= pay;
  s.total += pay;
  if (countsAsBet) s.committed += pay;
  if (s.stack === 0) s.allIn = true;
  hand.log.push({ street: hand.street, seat: i, action, amount: pay, allIn: s.allIn });
}

/** Deals a street's cards: hole cards one at a time starting left of the button, then the board. */
function dealStreet(hand: PokerHand) {
  const spec = VARIANTS[hand.config.variant].streets[hand.streetIndex];
  for (let round = 0; round < spec.hole; round++) {
    for (let k = 1; k <= hand.seats.length; k++) {
      const s = hand.seats[(hand.button + k) % hand.seats.length];
      if (!s.folded) s.hole.push(hand.deck.shift()!);
    }
  }
  if (spec.board > 0) {
    hand.deck.shift(); // burn a card, like a real dealer
    for (let n = 0; n < spec.board; n++) hand.board.push(hand.deck.shift()!);
  }
}

// ---------- Starting a hand ----------

export type StartOptions = { randomInt?: RandomInt; deck?: Card[] };

/**
 * Starts a hand: shuffles, posts antes and blinds, deals hole cards, and
 * finds the first player to act. `players` are in seat order; `button` is the
 * index of the dealer button among them.
 */
export function startHand(
  config: PokerConfig,
  players: readonly { playerId: string; stack: number }[],
  button: number,
  options: StartOptions = {},
): PokerHand {
  const variant = VARIANTS[config.variant];
  if (players.length < variant.minPlayers || players.length > variant.maxPlayers) {
    throw new IllegalPokerAction(`${variant.name} needs ${variant.minPlayers}–${variant.maxPlayers} players.`);
  }
  if (players.some((p) => !Number.isInteger(p.stack) || p.stack <= 0)) {
    throw new IllegalPokerAction("Every player needs chips to play a hand.");
  }
  if (!Number.isInteger(button) || button < 0 || button >= players.length) {
    throw new IllegalPokerAction("Invalid button position.");
  }

  const hand: PokerHand = {
    config,
    streetIndex: 0,
    street: variant.streets[0].name,
    phase: "betting",
    deck: options.deck ? [...options.deck] : shuffle(buildDecks(1), options.randomInt ?? secureRandomInt),
    board: [],
    seats: players.map((p) => ({
      playerId: p.playerId,
      stack: p.stack,
      hole: [],
      committed: 0,
      total: 0,
      folded: false,
      allIn: false,
      acted: false,
      actedAtLevel: 0,
    })),
    button,
    toAct: null,
    currentBet: config.bigBlind,
    minRaise: config.bigBlind,
    fullRaiseLevel: config.bigBlind,
    log: [],
    result: null,
  };

  if (config.ante > 0) hand.seats.forEach((_, i) => put(hand, i, config.ante, "ante", false));

  // Heads-up, the button posts the small blind.
  const smallBlind = hand.seats.length === 2 ? button : next(hand, button);
  const bigBlind = next(hand, smallBlind);
  if (!hand.seats[smallBlind].allIn) put(hand, smallBlind, config.smallBlind, "small-blind");
  if (!hand.seats[bigBlind].allIn) put(hand, bigBlind, config.bigBlind, "big-blind");

  dealStreet(hand);
  hand.toAct = nextToAct(hand, bigBlind);
  if (hand.toAct === null) finishStreet(hand);
  return hand;
}

// ---------- Choices and actions ----------

export type ActionOptions = {
  fold: boolean;
  check: boolean;
  /** Chips needed to call (0 = nothing to call). Capped at the player's stack. */
  call: number;
  /** Allowed "raise to" range, or null if raising isn't possible. */
  raise: { min: number; max: number } | null;
};

/** What the seat may do right now, or null if it isn't their turn. */
export function actionOptions(hand: PokerHand, seat: number): ActionOptions | null {
  if (hand.phase !== "betting" || hand.toAct !== seat) return null;
  const s = hand.seats[seat];
  const toCall = Math.max(0, hand.currentBet - s.committed);
  const maxTo = s.committed + s.stack;
  const othersCanRespond = hand.seats.some((o, j) => j !== seat && canStillBet(o));
  const reopened = !s.acted || s.actedAtLevel < hand.fullRaiseLevel;

  let raise: ActionOptions["raise"] = null;
  if (othersCanRespond && reopened && maxTo > hand.currentBet) {
    raise = { min: Math.min(hand.currentBet + hand.minRaise, maxTo), max: maxTo };
  }
  return { fold: toCall > 0, check: toCall === 0, call: Math.min(toCall, s.stack), raise };
}

export function applyAction(current: PokerHand, action: PokerAction): PokerHand {
  const options = actionOptions(current, action.seat);
  if (!options) throw new IllegalPokerAction("It isn't your turn.");

  const hand = structuredClone(current);
  const s = hand.seats[action.seat];

  switch (action.type) {
    case "fold":
      if (!options.fold) throw new IllegalPokerAction("Nothing to fold against: check instead.");
      s.folded = true;
      hand.log.push({ street: hand.street, seat: action.seat, action: "fold", amount: 0, allIn: false });
      break;
    case "check":
      if (!options.check) throw new IllegalPokerAction("You can't check: there's a bet to call.");
      hand.log.push({ street: hand.street, seat: action.seat, action: "check", amount: 0, allIn: false });
      break;
    case "call":
      if (options.call <= 0) throw new IllegalPokerAction("Nothing to call.");
      put(hand, action.seat, options.call, "call");
      break;
    case "raise": {
      const to = action.amount;
      if (!options.raise || to === undefined || !Number.isInteger(to)) {
        throw new IllegalPokerAction("You can't raise now.");
      }
      if (to < options.raise.min || to > options.raise.max) {
        throw new IllegalPokerAction(`Raise to between ${options.raise.min} and ${options.raise.max}.`);
      }
      const increment = to - hand.currentBet;
      // A full raise sets the new minimum and lets everyone raise again; a
      // short all-in raise doesn't.
      if (increment >= hand.minRaise) {
        hand.minRaise = increment;
        hand.fullRaiseLevel = to;
      }
      const opening = hand.currentBet === 0;
      hand.currentBet = to;
      put(hand, action.seat, to - s.committed, opening ? "bet" : "raise");
      break;
    }
  }

  s.acted = true;
  s.actedAtLevel = hand.currentBet;
  advance(hand, action.seat);
  return hand;
}

function advance(hand: PokerHand, from: number) {
  const live = hand.seats.filter((s) => !s.folded);
  if (live.length === 1) {
    awardFoldOut(hand);
    return;
  }
  const following = nextToAct(hand, from);
  if (following !== null) {
    hand.toAct = following;
    return;
  }
  finishStreet(hand);
}

/** Moves to the next street (running out the board if nobody can bet), or to showdown. */
function finishStreet(hand: PokerHand) {
  const streets = VARIANTS[hand.config.variant].streets;
  for (;;) {
    if (hand.streetIndex === streets.length - 1) {
      showdown(hand);
      return;
    }
    for (const s of hand.seats) {
      s.committed = 0;
      s.acted = false;
      s.actedAtLevel = 0;
    }
    hand.currentBet = 0;
    hand.minRaise = hand.config.bigBlind;
    hand.fullRaiseLevel = 0;
    hand.streetIndex++;
    hand.street = streets[hand.streetIndex].name;
    dealStreet(hand);
    const first = nextToAct(hand, hand.button);
    if (first !== null) {
      hand.toAct = first;
      return;
    }
  }
}

// ---------- Pots and showdown ----------

/**
 * Splits everyone's chips into a main pot and side pots. Each pot lists the
 * seats still in the hand that put in enough to win it.
 */
export function buildPots(seats: readonly PokerSeat[]): { amount: number; eligible: number[] }[] {
  const levels = [...new Set(seats.filter((s) => s.total > 0).map((s) => s.total))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let previous = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of seats) amount += Math.max(0, Math.min(s.total, level) - previous);
    const eligible = seats.flatMap((s, i) => (!s.folded && s.total >= level ? [i] : []));
    previous = level;
    if (amount === 0) continue;
    const last = pots.at(-1);
    // Chips from folded players above everyone still in go to the last pot.
    if (eligible.length === 0 && last) last.amount += amount;
    // Same contenders as the pot before: one pot, not two.
    else if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

function awardFoldOut(hand: PokerHand) {
  const winner = hand.seats.findIndex((s) => !s.folded);
  const amount = hand.seats.reduce((sum, s) => sum + s.total, 0);
  const payouts = hand.seats.map((_, i) => (i === winner ? amount : 0));
  hand.seats[winner].stack += amount;
  hand.result = {
    pots: [{ amount, eligible: [winner], winners: [winner], hand: null }],
    payouts,
    shown: [],
    hands: hand.seats.map(() => null),
  };
  hand.phase = "complete";
  hand.toAct = null;
}

function showdown(hand: PokerHand) {
  const rule = VARIANTS[hand.config.variant].handRule;
  const best = hand.seats.map((s) => (s.folded ? null : bestHand(s.hole, hand.board, rule)));
  const payouts = hand.seats.map(() => 0);
  // Leftover chips from a split go to the first winner left of the button.
  const orderFromButton = hand.seats.map((_, k) => (hand.button + 1 + k) % hand.seats.length);

  const pots: PotResult[] = buildPots(hand.seats).map(({ amount, eligible }) => {
    if (eligible.length === 1) {
      payouts[eligible[0]] += amount;
      return { amount, eligible, winners: eligible, hand: null }; // uncalled bet returned
    }
    const top = Math.max(...eligible.map((i) => best[i]!.score));
    const winners = orderFromButton.filter((i) => eligible.includes(i) && best[i]!.score === top);
    const share = Math.floor(amount / winners.length);
    let leftover = amount - share * winners.length;
    for (const w of winners) {
      payouts[w] += share + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
    }
    return { amount, eligible, winners: [...winners].sort((a, b) => a - b), hand: best[winners[0]]!.description };
  });

  hand.seats.forEach((s, i) => (s.stack += payouts[i]));
  hand.result = {
    pots,
    payouts,
    shown: hand.seats.flatMap((s, i) => (s.folded ? [] : [i])),
    hands: best.map((b) => b?.description ?? null),
  };
  hand.phase = "complete";
  hand.toAct = null;
}

// ---------- What players may see ----------

export type PublicSeat = Omit<PokerSeat, "hole"> & { hole: Card[]; holeCount: number };
export type PublicHand = Omit<PokerHand, "deck" | "seats"> & { seats: PublicSeat[]; pot: number };

/**
 * The hand as one player may see it: their own hole cards, everyone's cards
 * that were shown at showdown, and nothing from the deck.
 */
export function publicHand(hand: PokerHand, viewerId: string | null): PublicHand {
  const { deck, seats, ...rest } = hand;
  void deck;
  const shown = new Set(hand.result?.shown ?? []);
  return {
    ...structuredClone(rest),
    pot: seats.reduce((sum, s) => sum + s.total, 0),
    seats: seats.map((s, i) => ({
      ...structuredClone(s),
      hole: s.playerId === viewerId || shown.has(i) ? [...s.hole] : [],
      holeCount: s.hole.length,
    })),
  };
}
