import { secureRandomInt, shuffle, type RandomInt } from "@/lib/random";
import {
  buildDecks,
  cardValue,
  handValue,
  isBust,
  isTwoCard21,
  newShoe,
  rankOf,
  shoeNeedsShuffle,
  type Card,
  type Shoe,
} from "./cards";
import { payoutRatio, type BlackjackRules } from "./rules";

// ---------- State ----------

export type HandOutcome = "blackjack" | "win" | "push" | "lose" | "bust" | "surrender";

export type PlayerHand = {
  cards: Card[];
  /** Chips riding on this hand, including any double. */
  bet: number;
  doubled: boolean;
  surrendered: boolean;
  /** Created by splitting (a two-card 21 here is not a blackjack). */
  fromSplit: boolean;
  /** Created by splitting aces. */
  splitAces: boolean;
  /** No more actions on this hand. */
  done: boolean;
  outcome?: HandOutcome;
  /** Chips paid back at settlement, including the returned stake. 0 = lost. */
  returned?: number;
};

export type Seat = {
  playerId: string;
  /** The original bet; insurance costs half of this. */
  baseBet: number;
  hands: PlayerHand[];
  /** Chips put on insurance, or 0 if declined / not offered. */
  insurance: number;
  insuranceReturned?: number;
  /** Has made (or didn't need to make) the pre-peek choice: insurance / early surrender. */
  earlyDecided: boolean;
};

/**
 * - "early": waiting for players to choose insurance / early surrender before
 *   the dealer checks for blackjack. Seats decide in any order.
 * - "playing": players act one hand at a time, in seat order.
 * - "settled": the dealer has played and every bet is paid out.
 */
export type Phase = "early" | "playing" | "settled";

export type BlackjackRound = {
  phase: Phase;
  shoe: Shoe;
  /** The dealer's cards. dealer[0] is the upcard; the rest stay hidden until settled. */
  dealer: Card[];
  seats: Seat[];
  turn: { seat: number; hand: number } | null;
  /** The dealer checked for blackjack and didn't have it. */
  peeked: boolean;
  dealerBlackjack: boolean;
  /** The shoe was reshuffled before this round. */
  reshuffled: boolean;
};

export type EarlyAction = { type: "insurance" | "decline" | "surrender"; seat: number };
export type PlayAction = { type: "hit" | "stand" | "double" | "split" | "surrender"; seat: number };
export type BlackjackAction = EarlyAction | PlayAction;
export type ActionType = BlackjackAction["type"];

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}

// ---------- Helpers ----------

function isTenValue(card: Card) {
  return cardValue(card) === 10;
}

function upcardIsAce(round: BlackjackRound) {
  return rankOf(round.dealer[0]) === "A";
}

/** A natural that pays as blackjack (not a 21 made after splitting). */
export function isPlayerBlackjack(hand: PlayerHand): boolean {
  return !hand.fromSplit && isTwoCard21(hand.cards);
}

function draw(round: BlackjackRound, rules: BlackjackRules, randomInt: RandomInt): Card {
  if (round.shoe.cards.length === 0) {
    // Ran out mid-round (many seats, deep shuffle point): reshuffle every card
    // that isn't currently on the table.
    const remaining = buildDecks(rules.decks);
    const onTable = [...round.dealer, ...round.seats.flatMap((s) => s.hands.flatMap((h) => h.cards))];
    for (const card of onTable) remaining.splice(remaining.indexOf(card), 1);
    round.shoe = { cards: shuffle(remaining, randomInt), size: rules.decks * 52 };
  }
  return round.shoe.cards.shift()!;
}

function insuranceCost(seat: Seat) {
  return Math.floor(seat.baseBet / 2);
}

function canDoubleTotal(rules: BlackjackRules, cards: readonly Card[]) {
  if (rules.doubleOn === "any") return true;
  const { total, soft } = handValue(cards);
  if (soft) return false;
  return rules.doubleOn === "9-11" ? total >= 9 && total <= 11 : total >= 10 && total <= 11;
}

function canSplitHand(rules: BlackjackRules, seat: Seat, hand: PlayerHand) {
  if (hand.cards.length !== 2 || seat.hands.length >= rules.maxSplitHands) return false;
  const [a, b] = hand.cards;
  if (cardValue(a) !== cardValue(b)) return false;
  if (rankOf(a) === "A" && hand.splitAces && !rules.resplitAces) return false;
  return true;
}

/** A hand finishes on its own when it hits 21, busts, or is a split ace that can't act. */
function finishesAutomatically(rules: BlackjackRules, seat: Seat, hand: PlayerHand) {
  if (handValue(hand.cards).total >= 21) return true;
  return hand.splitAces && !rules.hitSplitAces && !canSplitHand(rules, seat, hand);
}

// ---------- Legal actions ----------

/** What the given seat may do right now. Empty if it isn't their move. */
export function legalActions(rules: BlackjackRules, round: BlackjackRound, seatIndex: number): ActionType[] {
  const seat = round.seats[seatIndex];
  if (!seat) return [];

  if (round.phase === "early") {
    if (seat.earlyDecided) return [];
    const actions: ActionType[] = [];
    if (rules.insurance && upcardIsAce(round) && insuranceCost(seat) > 0) actions.push("insurance");
    if (rules.surrender === "early" && !isPlayerBlackjack(seat.hands[0])) actions.push("surrender");
    actions.push("decline");
    return actions;
  }

  if (round.phase !== "playing" || round.turn?.seat !== seatIndex) return [];
  const hand = seat.hands[round.turn.hand];
  const actions: ActionType[] = [];

  const lockedSplitAce = hand.splitAces && !rules.hitSplitAces;
  if (!lockedSplitAce) actions.push("hit");
  actions.push("stand");

  if (
    !lockedSplitAce &&
    hand.cards.length === 2 &&
    (!hand.fromSplit || rules.doubleAfterSplit) &&
    canDoubleTotal(rules, hand.cards)
  ) {
    actions.push("double");
  }

  if (canSplitHand(rules, seat, hand)) actions.push("split");

  if (rules.surrender !== "none" && seat.hands.length === 1 && hand.cards.length === 2 && !hand.fromSplit) {
    actions.push("surrender");
  }

  return actions;
}

/** Extra chips the player must put up to take this action (0 for most actions). */
export function actionCost(round: BlackjackRound, action: BlackjackAction): number {
  const seat = round.seats[action.seat];
  if (!seat) return 0;
  if (action.type === "insurance") return insuranceCost(seat);
  if ((action.type === "double" || action.type === "split") && round.turn) {
    return seat.hands[round.turn.hand].bet;
  }
  return 0;
}

// ---------- Starting a round ----------

export type SeatBet = { playerId: string; bet: number };

/**
 * Shuffles if needed, deals two cards to each seat and the dealer (just one
 * for the dealer in no-peek games), and moves to the first decision.
 */
export function startRound(
  rules: BlackjackRules,
  shoe: Shoe | null,
  bets: readonly SeatBet[],
  randomInt: RandomInt = secureRandomInt,
): BlackjackRound {
  if (bets.length < 1 || bets.length > 7) throw new IllegalActionError("A round needs 1–7 seats.");
  for (const { bet } of bets) {
    if (!Number.isInteger(bet) || bet <= 0) throw new IllegalActionError("Bets must be positive whole numbers.");
  }

  const reshuffled = !shoe || shoe.size !== rules.decks * 52 || shoeNeedsShuffle(shoe, rules.penetration);
  const round: BlackjackRound = {
    phase: "playing",
    shoe: reshuffled ? newShoe(rules.decks, randomInt) : structuredClone(shoe!),
    dealer: [],
    seats: bets.map(({ playerId, bet }) => ({
      playerId,
      baseBet: bet,
      hands: [
        { cards: [], bet, doubled: false, surrendered: false, fromSplit: false, splitAces: false, done: false },
      ],
      insurance: 0,
      earlyDecided: true,
    })),
    turn: null,
    peeked: false,
    dealerBlackjack: false,
    reshuffled,
  };

  // Deal like a real table: one card to each seat, dealer upcard, second card
  // to each seat, then the dealer's hole card.
  for (const seat of round.seats) seat.hands[0].cards.push(draw(round, rules, randomInt));
  round.dealer.push(draw(round, rules, randomInt));
  for (const seat of round.seats) seat.hands[0].cards.push(draw(round, rules, randomInt));
  if (rules.dealerPeeks) round.dealer.push(draw(round, rules, randomInt));

  for (const seat of round.seats) {
    if (isPlayerBlackjack(seat.hands[0])) seat.hands[0].done = true;
  }

  const up = round.dealer[0];
  const offerInsurance = rules.insurance && rankOf(up) === "A";
  const offerEarlySurrender = rules.surrender === "early" && rules.dealerPeeks && (rankOf(up) === "A" || isTenValue(up));
  if (offerInsurance || offerEarlySurrender) {
    round.phase = "early";
    for (let i = 0; i < round.seats.length; i++) {
      round.seats[i].earlyDecided = false;
      // Skip seats whose only option would be "decline".
      if (legalActions(rules, round, i).length === 1) round.seats[i].earlyDecided = true;
    }
    if (round.seats.some((s) => !s.earlyDecided)) return round;
  }

  afterEarlyDecisions(rules, round, randomInt);
  return round;
}

/** Dealer checks for blackjack (if this game peeks), then play begins. */
function afterEarlyDecisions(rules: BlackjackRules, round: BlackjackRound, randomInt: RandomInt) {
  const up = round.dealer[0];
  if (rules.dealerPeeks && (rankOf(up) === "A" || isTenValue(up))) {
    if (isTwoCard21(round.dealer)) {
      settle(rules, round, randomInt);
      return;
    }
    round.peeked = true;
  }
  round.phase = "playing";
  round.turn = { seat: 0, hand: 0 };
  advance(rules, round, randomInt);
}

/**
 * Moves the turn to the next hand that needs a decision, dealing the second
 * card to split hands as they come up. Settles the round when nobody is left.
 */
function advance(rules: BlackjackRules, round: BlackjackRound, randomInt: RandomInt) {
  let { seat: s, hand: h } = round.turn ?? { seat: 0, hand: 0 };
  while (s < round.seats.length) {
    const seat = round.seats[s];
    while (h < seat.hands.length) {
      const hand = seat.hands[h];
      if (hand.cards.length === 1) hand.cards.push(draw(round, rules, randomInt));
      if (!hand.done && finishesAutomatically(rules, seat, hand)) hand.done = true;
      if (!hand.done) {
        round.turn = { seat: s, hand: h };
        return;
      }
      h++;
    }
    s++;
    h = 0;
  }
  settle(rules, round, randomInt);
}

// ---------- Actions ----------

/** Applies one player action and returns the new round. Throws IllegalActionError if not allowed. */
export function applyAction(
  rules: BlackjackRules,
  current: BlackjackRound,
  action: BlackjackAction,
  randomInt: RandomInt = secureRandomInt,
): BlackjackRound {
  if (!legalActions(rules, current, action.seat).includes(action.type)) {
    throw new IllegalActionError(`"${action.type}" isn't allowed right now.`);
  }

  const round = structuredClone(current);
  const seat = round.seats[action.seat];

  if (round.phase === "early") {
    if (action.type === "insurance") seat.insurance = insuranceCost(seat);
    if (action.type === "surrender") {
      seat.hands[0].surrendered = true;
      seat.hands[0].done = true;
    }
    seat.earlyDecided = true;
    if (round.seats.every((s) => s.earlyDecided)) afterEarlyDecisions(rules, round, randomInt);
    return round;
  }

  const handIndex = round.turn!.hand;
  const hand = seat.hands[handIndex];

  switch (action.type) {
    case "hit":
      hand.cards.push(draw(round, rules, randomInt));
      if (handValue(hand.cards).total >= 21) hand.done = true;
      break;
    case "stand":
      hand.done = true;
      break;
    case "double":
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(draw(round, rules, randomInt));
      hand.done = true;
      break;
    case "split": {
      const [first, second] = hand.cards;
      const aces = rankOf(first) === "A";
      const makeHand = (card: Card): PlayerHand => ({
        cards: [card],
        bet: hand.bet,
        doubled: false,
        surrendered: false,
        fromSplit: true,
        splitAces: aces,
        done: false,
      });
      seat.hands.splice(handIndex, 1, makeHand(first), makeHand(second));
      break;
    }
    case "surrender":
      hand.surrendered = true;
      hand.done = true;
      break;
  }

  advance(rules, round, randomInt);
  return round;
}

// ---------- Dealer play and settlement ----------

function dealerMustHit(rules: BlackjackRules, cards: readonly Card[]) {
  const { total, soft } = handValue(cards);
  return total < 17 || (total === 17 && soft && rules.dealerHitsSoft17);
}

function settle(rules: BlackjackRules, round: BlackjackRound, randomInt: RandomInt) {
  // No-peek games: the dealer's second card comes now.
  if (round.dealer.length === 1) round.dealer.push(draw(round, rules, randomInt));

  round.dealerBlackjack = isTwoCard21(round.dealer);
  const hands = round.seats.flatMap((s) => s.hands);
  const anyLiveHand = hands.some((h) => !h.surrendered && !isBust(h.cards) && !isPlayerBlackjack(h));

  if (!round.dealerBlackjack && anyLiveHand) {
    while (dealerMustHit(rules, round.dealer)) round.dealer.push(draw(round, rules, randomInt));
  }

  for (const seat of round.seats) {
    for (const hand of seat.hands) {
      Object.assign(hand, settleHand(rules, hand, round.dealer, round.dealerBlackjack));
      hand.done = true;
    }
    seat.insuranceReturned = round.dealerBlackjack ? seat.insurance * 3 : 0;
  }

  round.phase = "settled";
  round.turn = null;
}

function settleHand(
  rules: BlackjackRules,
  hand: PlayerHand,
  dealer: readonly Card[],
  dealerBlackjack: boolean,
): { outcome: HandOutcome; returned: number } {
  if (hand.surrendered) {
    // Late surrender only beats a dealer blackjack when the dealer peeked first,
    // which settles the round before anyone can surrender. Without a peek, a
    // late surrender against a blackjack loses the full bet.
    if (dealerBlackjack && rules.surrender === "late") return { outcome: "lose", returned: 0 };
    return { outcome: "surrender", returned: Math.floor(hand.bet / 2) };
  }

  const playerBlackjack = isPlayerBlackjack(hand);
  if (dealerBlackjack) {
    return playerBlackjack ? { outcome: "push", returned: hand.bet } : { outcome: "lose", returned: 0 };
  }
  if (playerBlackjack) {
    const [num, den] = payoutRatio(rules.blackjackPayout);
    return { outcome: "blackjack", returned: hand.bet + Math.floor((hand.bet * num) / den) };
  }

  const player = handValue(hand.cards).total;
  if (player > 21) return { outcome: "bust", returned: 0 };

  const dealerTotal = handValue(dealer).total;
  if (dealerTotal > 21 || player > dealerTotal) return { outcome: "win", returned: hand.bet * 2 };
  if (player === dealerTotal) return { outcome: "push", returned: hand.bet };
  return { outcome: "lose", returned: 0 };
}

// ---------- Totals and what players may see ----------

/** Chips the seat has put in this round (bets, doubles, splits, insurance). */
export function seatWagered(seat: Seat): number {
  return seat.hands.reduce((sum, h) => sum + h.bet, 0) + seat.insurance;
}

/** Chips paid back to the seat at settlement. */
export function seatReturned(seat: Seat): number {
  return seat.hands.reduce((sum, h) => sum + (h.returned ?? 0), 0) + (seat.insuranceReturned ?? 0);
}

export type PublicRound = Omit<BlackjackRound, "shoe" | "dealer"> & {
  /** The dealer's visible cards: just the upcard until the round is settled. */
  dealer: Card[];
  /** Face-down dealer cards not shown in `dealer`. */
  dealerHidden: number;
  cardsLeftInShoe: number;
};

/**
 * The round as players are allowed to see it: no undealt cards and no hole
 * card until settlement. Only ever send this to the browser.
 */
export function publicView(round: BlackjackRound): PublicRound {
  const { shoe, dealer, ...rest } = round;
  const visible = round.phase === "settled" ? dealer : dealer.slice(0, 1);
  return {
    ...structuredClone(rest),
    dealer: [...visible],
    dealerHidden: dealer.length - visible.length,
    cardsLeftInShoe: shoe.cards.length,
  };
}
