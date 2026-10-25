import { rankOf, suitOf, type Card, type Rank } from "@/lib/games/deck";

// Poker hand evaluation. A five-card hand becomes one number: higher always
// beats lower, ties are true ties. Variants differ only in which five cards a
// player may use (see HandRule).

export const CATEGORIES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;
export type Category = (typeof CATEGORIES)[number];

const RANK_VALUE: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

export function rankValue(card: Card): number {
  return RANK_VALUE[rankOf(card)];
}

/** Packs a category and up to five tie-break ranks into one comparable number. */
function encode(category: number, ranks: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (ranks[i] ?? 0);
  return score;
}

export function categoryOf(score: number): Category {
  return CATEGORIES[Math.floor(score / 16 ** 5)];
}

/** Score of exactly five cards. */
export function scoreFive(cards: readonly Card[]): number {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));

  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Groups by size, then by rank: e.g. KKK77 -> [K×3, 7×2].
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map(([v]) => v);

  let straightHigh = 0;
  if (groups.length === 5) {
    if (values[0] - values[4] === 4) straightHigh = values[0];
    else if (values[0] === 14 && values[1] === 5) straightHigh = 5; // A-2-3-4-5, the "wheel"
  }

  if (straightHigh && flush) return encode(8, [straightHigh]);
  if (groups[0][1] === 4) return encode(7, byGroup);
  if (groups[0][1] === 3 && groups[1][1] === 2) return encode(6, byGroup);
  if (flush) return encode(5, values);
  if (straightHigh) return encode(4, [straightHigh]);
  if (groups[0][1] === 3) return encode(3, byGroup);
  if (groups[0][1] === 2 && groups[1][1] === 2) return encode(2, byGroup);
  if (groups[0][1] === 2) return encode(1, byGroup);
  return encode(0, values);
}

/**
 * Which cards a player may use:
 * - "best-five": any five of their cards plus the board (Hold'em, Stud)
 * - "omaha": exactly two of their own cards and exactly three from the board
 */
export type HandRule = "best-five" | "omaha";

function combinations<T>(items: readonly T[], k: number): T[][] {
  const result: T[][] = [];
  const pick = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i <= items.length - (k - chosen.length); i++) {
      chosen.push(items[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return result;
}

export type BestHand = { score: number; cards: Card[]; category: Category; description: string };

/** The best five-card hand a player can make under the variant's rule. */
export function bestHand(hole: readonly Card[], board: readonly Card[], rule: HandRule = "best-five"): BestHand {
  let candidates: Card[][];
  if (rule === "omaha") {
    candidates = [];
    for (const mine of combinations(hole, 2)) {
      for (const shared of combinations(board, 3)) candidates.push([...mine, ...shared]);
    }
  } else {
    candidates = combinations([...hole, ...board], 5);
  }
  if (candidates.length === 0) throw new Error("Not enough cards for a five-card hand");

  let best = candidates[0];
  let bestScore = scoreFive(best);
  for (const hand of candidates.slice(1)) {
    const s = scoreFive(hand);
    if (s > bestScore) {
      bestScore = s;
      best = hand;
    }
  }
  return { score: bestScore, cards: best, category: categoryOf(bestScore), description: describe(bestScore) };
}

// ---------- Names ----------

const SINGULAR: Record<number, string> = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight",
  9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
const plural = (v: number) => (v === 6 ? "Sixes" : `${SINGULAR[v]}s`);

/** Tie-break ranks back out of a score. */
function ranksOf(score: number): number[] {
  const ranks: number[] = [];
  let rest = score;
  for (let i = 0; i < 5; i++) {
    ranks.unshift(rest % 16);
    rest = Math.floor(rest / 16);
  }
  return ranks;
}

/** Plain-English name, e.g. "Full House, Kings full of Sevens". */
export function describe(score: number): string {
  const [a, b] = ranksOf(score);
  switch (categoryOf(score)) {
    case "Straight Flush":
      return a === 14 ? "Royal Flush" : `Straight Flush, ${SINGULAR[a]} high`;
    case "Four of a Kind":
      return `Four of a Kind, ${plural(a)}`;
    case "Full House":
      return `Full House, ${plural(a)} full of ${plural(b)}`;
    case "Flush":
      return `Flush, ${SINGULAR[a]} high`;
    case "Straight":
      return `Straight, ${SINGULAR[a]} high`;
    case "Three of a Kind":
      return `Three of a Kind, ${plural(a)}`;
    case "Two Pair":
      return `Two Pair, ${plural(a)} and ${plural(b)}`;
    case "Pair":
      return `Pair of ${plural(a)}`;
    default:
      return `High Card, ${SINGULAR[a]}`;
  }
}
