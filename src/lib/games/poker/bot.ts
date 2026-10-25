import { buildDecks, suitOf, type Card } from "@/lib/games/deck";
import { bestHand, rankValue } from "./evaluator";
import { actionOptions, type PokerAction, type PublicHand } from "./engine";
import { VARIANTS } from "./variants";

// Simple computer opponents. A bot only ever sees what a human in its seat
// would see (a PublicHand from its own point of view), so it can't cheat.
// Before the flop it rates its two cards with the Chen formula; after the
// flop it estimates how often it wins by dealing out the rest at random.

/** Returns a number in [0, 1). Injected so tests can be repeatable. */
export type Rng = () => number;

// ---------- Preflop: Chen formula ----------

/** Bill Chen's quick rating of two hole cards: about -1 (72 offsuit) to 20 (AA). */
export function chenScore(a: Card, b: Card): number {
  const points = (v: number) => (v === 14 ? 10 : v === 13 ? 8 : v === 12 ? 7 : v === 11 ? 6 : v / 2);
  const [hi, lo] = [rankValue(a), rankValue(b)].sort((x, y) => y - x);
  let score = points(hi);
  if (hi === lo) return Math.max(5, score * 2);
  if (suitOf(a) === suitOf(b)) score += 2;
  const gap = hi - lo - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) score += 1;
  return Math.ceil(score);
}

// ---------- Postflop: how often does this hand win? ----------

/**
 * Estimates the chance of winning (ties count as half) against `opponents`
 * random hands, by dealing out unknown cards `samples` times.
 */
export function estimateEquity(
  hole: Card[],
  board: Card[],
  opponents: number,
  rng: Rng,
  samples = 300,
  rule: "best-five" | "omaha" = "best-five",
): number {
  const holeCount = hole.length; // opponents hold as many cards as we do
  const known = new Set<string>([...hole, ...board]);
  const unknown = buildDecks(1).filter((c) => !known.has(c));
  let wins = 0;
  for (let n = 0; n < samples; n++) {
    // Partial shuffle: just enough cards for opponents and the rest of the board.
    const need = opponents * holeCount + (5 - board.length);
    const pool = [...unknown];
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const fullBoard = [...board, ...pool.slice(opponents * holeCount, need)];
    const mine = bestHand(hole, fullBoard, rule).score;
    let best = 0;
    let tied = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = bestHand(pool.slice(o * holeCount, (o + 1) * holeCount), fullBoard, rule).score;
      if (theirs > best) {
        best = theirs;
        tied = 0;
      }
      if (theirs === mine) tied++;
    }
    if (mine > best) wins += 1;
    else if (mine === best) wins += 1 / (tied + 1);
  }
  return wins / samples;
}

// ---------- Decisions ----------

type Position = "early" | "middle" | "late";

function positionOf(view: PublicHand, seat: number): Position {
  const n = view.seats.length;
  const fromButton = (seat - view.button + n) % n; // 0 = button, 1 = small blind, ...
  if (fromButton === 0 || n <= 3) return "late";
  return fromButton >= n - 2 ? "late" : fromButton <= 3 ? "early" : "middle";
}

/** Keeps a "raise to" amount inside the legal range; near-all-in becomes all-in. */
function raiseTo(amount: number, range: { min: number; max: number }): number {
  const to = Math.max(range.min, Math.min(range.max, Math.round(amount)));
  return to >= range.max * 0.8 ? range.max : to;
}

/**
 * The bot's move for `seat`. `view` must be the hand as seen from that seat
 * (publicHand(hand, botPlayerId)).
 */
export function botDecision(view: PublicHand, seat: number, rng: Rng = Math.random): PokerAction {
  const options = actionOptions(view, seat);
  if (!options) throw new Error("It isn't this bot's turn.");
  const me = view.seats[seat];
  const toCall = options.call;
  const pot = view.pot;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const bb = view.config.bigBlind;
  const opponents = view.seats.filter((s, i) => i !== seat && !s.folded).length;
  const position = positionOf(view, seat);

  const check: PokerAction = { type: "check", seat };
  const call: PokerAction = { type: "call", seat };
  const fold: PokerAction = { type: "fold", seat };
  const passive = options.check ? check : fold;
  const raise = (amount: number): PokerAction =>
    options.raise ? { type: "raise", seat, amount: raiseTo(amount, options.raise) } : options.call > 0 ? call : check;

  if (view.street === "preflop") {
    const [a, b] = me.hole;
    const chen = chenScore(a, b) + (position === "late" ? 1 : position === "early" ? -1 : 0);
    const raised = view.currentBet > bb;
    const cheap = toCall <= Math.max(bb * 3, me.stack * 0.05);

    if (chen >= 12) return raise(raised ? view.currentBet * 3 : bb * 3 + toCall);
    if (chen >= 9) return raised && !cheap ? (chen >= 10 ? call : passive) : raise(view.currentBet + bb * 2.5);
    if (chen >= 7) return cheap ? (options.check ? check : call) : passive;
    if (chen >= 5 && position === "late" && !raised) return rng() < 0.4 ? raise(bb * 2.5) : options.check ? check : call;
    // Now and then, steal the blinds from late position with anything.
    if (!raised && position === "late" && rng() < 0.08) return raise(bb * 2.5);
    return passive;
  }

  const rule = VARIANTS[view.config.variant].handRule;
  const equity = estimateEquity(me.hole, view.board, Math.max(1, opponents), rng, 250, rule);
  const betSize = (fraction: number) => view.currentBet + Math.max(options.raise?.min ?? 0, pot * fraction);

  if (equity > 0.8) return rng() < 0.15 && toCall > 0 ? call : raise(betSize(0.75)); // strong: build the pot
  if (equity > 0.6) {
    if (toCall === 0) return rng() < 0.7 ? raise(betSize(0.5)) : check;
    return equity > potOdds + 0.1 ? call : passive;
  }
  if (toCall > 0) return equity > potOdds + 0.05 ? call : fold;
  // Nothing much: usually check, sometimes bluff when few players are left.
  if (opponents <= 2 && rng() < 0.1) return raise(betSize(0.5));
  return check;
}

/** Labels for bot seats. */
export const BOT_NAMES = ["Zorp", "Blip-9", "Qwex", "Nebbo", "Vrill", "Orbix", "Kesh", "Tuul", "Xyra"];
