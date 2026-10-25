// Standard 52-card deck shared by every card game (blackjack, poker, ...).

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** A card as a short code: rank then suit, e.g. "Ah" (ace of hearts), "Td" (ten of diamonds). */
export type Card = `${Rank}${Suit}`;

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

/** One or more full decks, in order (shuffle before dealing). */
export function buildDecks(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push(`${rank}${suit}`);
    }
  }
  return cards;
}
