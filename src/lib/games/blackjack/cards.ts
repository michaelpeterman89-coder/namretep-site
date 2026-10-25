import { secureRandomInt, shuffle, type RandomInt } from "@/lib/random";

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** A card as a short code: rank then suit, e.g. "Ah" (ace of hearts), "Td" (ten of diamonds). */
export type Card = `${Rank}${Suit}`;

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

/** Blackjack value counting aces as 1. */
export function cardValue(card: Card): number {
  const rank = rankOf(card);
  if (rank === "A") return 1;
  if (rank === "T" || rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export type HandValue = {
  total: number;
  /** True when an ace is being counted as 11. */
  soft: boolean;
};

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let hasAce = false;
  for (const card of cards) {
    total += cardValue(card);
    if (rankOf(card) === "A") hasAce = true;
  }
  if (hasAce && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

/** Exactly two cards totalling 21. (Whether it pays as blackjack also depends on splits.) */
export function isTwoCard21(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21;
}

// ---------- Shoe ----------

export type Shoe = {
  /** Undealt cards; the next card dealt is cards[0]. */
  cards: Card[];
  /** Number of cards in a full shoe, used to find the shuffle point. */
  size: number;
};

export function buildDecks(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push(`${rank}${suit}`);
    }
  }
  return cards;
}

export function newShoe(decks: number, randomInt: RandomInt = secureRandomInt): Shoe {
  return { cards: shuffle(buildDecks(decks), randomInt), size: decks * 52 };
}

/** True once the dealt share of the shoe reaches the cut card (e.g. 0.75 = 75%). */
export function shoeNeedsShuffle(shoe: Shoe, penetration: number): boolean {
  return shoe.size - shoe.cards.length >= Math.floor(shoe.size * penetration);
}
