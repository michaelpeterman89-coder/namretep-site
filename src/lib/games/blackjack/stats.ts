import { isBust } from "./cards";
import {
  isPlayerBlackjack,
  legalActions,
  seatReturned,
  seatWagered,
  type BlackjackAction,
  type BlackjackRound,
} from "./engine";
import { rulesSummary, type BlackjackRules } from "./rules";
import { bookDecision } from "./strategy";

/** One seat's result for a finished round, as stored by record_game_stats. */
export type RoundStat = {
  player_id: string;
  game: "blackjack";
  rules_key: string;
  net: number;
  counters: { blackjacks: number; busts: number; doubles: number; splits: number; surrenders: number };
};

/** Stats for each seat once the round is settled (empty before that). Seats that used a hint don't count. */
export function roundStats(rules: BlackjackRules, round: BlackjackRound): RoundStat[] {
  if (round.phase !== "settled") return [];
  const rulesKey = rulesSummary(rules);
  return round.seats.filter((seat) => !seat.hintUsed).map((seat) => ({
    player_id: seat.playerId,
    game: "blackjack",
    rules_key: rulesKey,
    net: seatReturned(seat) - seatWagered(seat),
    counters: {
      blackjacks: seat.hands.filter(isPlayerBlackjack).length,
      busts: seat.hands.filter((h) => !h.surrendered && isBust(h.cards)).length,
      doubles: seat.hands.filter((h) => h.doubled).length,
      splits: seat.hands.length - 1,
      surrenders: seat.hands.filter((h) => h.surrendered).length,
    },
  }));
}

/** One player decision compared with basic strategy, as stored in blackjack_decisions. */
export type DecisionRecord = {
  player_id: string;
  rules_key: string;
  phase: "early" | "playing";
  situation_key: string;
  situation: string;
  action: string;
  book_action: string;
  on_book: boolean;
  hints_enabled: boolean;
};

/**
 * The book play for this seat's current decision, from its own cards and the
 * dealer's upcard only. Null when it isn't their move or there's no real choice.
 */
export function bookFor(rules: BlackjackRules, round: BlackjackRound, seatIndex: number) {
  if (round.phase === "settled") return null;
  const seat = round.seats[seatIndex];
  if (!seat) return null;
  const hand = round.phase === "early" ? seat.hands[0] : seat.hands[round.turn?.hand ?? 0];
  return bookDecision(rules, {
    phase: round.phase,
    cards: hand.cards,
    dealerUpcard: round.dealer[0],
    legal: legalActions(rules, round, seatIndex),
  });
}

/** The round with this seat marked as having used a hint. */
export function withHintUsed(round: BlackjackRound, seatIndex: number): BlackjackRound {
  return { ...round, seats: round.seats.map((s, i) => (i === seatIndex ? { ...s, hintUsed: true } : s)) };
}

/**
 * Checks an action against the book, using the round as it was *before* the
 * action. Returns null when there was no real choice to make.
 */
export function judgeDecision(
  rules: BlackjackRules,
  before: BlackjackRound,
  action: BlackjackAction,
  hintsEnabled: boolean,
): DecisionRecord | null {
  if (before.phase === "settled") return null;
  const seat = before.seats[action.seat];
  if (!seat) return null;
  const book = bookFor(rules, before, action.seat);
  if (!book) return null;

  return {
    player_id: seat.playerId,
    rules_key: rulesSummary(rules),
    phase: before.phase,
    situation_key: book.key,
    situation: book.situation,
    action: action.type,
    book_action: book.action,
    on_book: action.type === book.action,
    hints_enabled: hintsEnabled || seat.hintUsed === true,
  };
}
