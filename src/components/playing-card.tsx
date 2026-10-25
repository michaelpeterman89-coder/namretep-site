import type { Card } from "@/lib/games/blackjack";

const SUIT_SYMBOLS = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;
const SUIT_NAMES = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const;
const RANK_NAMES: Record<string, string> = { A: "Ace", T: "10", J: "Jack", Q: "Queen", K: "King" };

export type CardSize = "md" | "sm";

/** A card's name for screen readers, e.g. "Ace of spades". */
export function cardLabel(card: Card): string {
  const rank = card[0];
  return `${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[card[1] as keyof typeof SUIT_NAMES]}`;
}

/** Width and height of a card at each size (shared by the flip wrapper at the table). */
export const CARD_DIMENSIONS: Record<CardSize, string> = {
  md: "h-20 w-14 sm:h-28 sm:w-20",
  sm: "h-16 w-11 sm:h-20 sm:w-14",
};

const SIZES: Record<CardSize, { pad: string; corner: string; pip: string }> = {
  md: { pad: "p-1 sm:p-1.5", corner: "text-[0.6rem] sm:text-xs", pip: "text-xl sm:text-3xl" },
  sm: { pad: "p-0.5 sm:p-1", corner: "text-[0.5rem] sm:text-[0.6rem]", pip: "text-base sm:text-xl" },
};

/**
 * A face-up pixel card. With `animate`, it pops in (staggered by `index`);
 * the blackjack table turns that off and animates cards from the shoe itself.
 */
export function PlayingCard({
  card,
  index = 0,
  size = "md",
  animate = true,
}: {
  card: Card;
  index?: number;
  size?: CardSize;
  animate?: boolean;
}) {
  const rank = card[0];
  const suit = card[1] as keyof typeof SUIT_SYMBOLS;
  const label = rank === "T" ? "10" : rank;
  const red = suit === "h" || suit === "d";
  const s = SIZES[size];

  return (
    <div
      role="img"
      aria-label={cardLabel(card)}
      className={`card-face ${animate ? "card-deal" : ""} ${CARD_DIMENSIONS[size]} ${s.pad} flex flex-col justify-between font-display ${
        red ? "text-neon-magenta" : "text-ink"
      }`}
      style={animate ? { animationDelay: `${index * 90}ms` } : undefined}
    >
      <span className={`${s.corner} leading-none`}>
        {label}
        <br />
        {SUIT_SYMBOLS[suit]}
      </span>
      <span className={`self-center ${s.pip}`}>{SUIT_SYMBOLS[suit]}</span>
      <span className={`rotate-180 ${s.corner} leading-none`}>
        {label}
        <br />
        {SUIT_SYMBOLS[suit]}
      </span>
    </div>
  );
}

export function CardBack({
  index = 0,
  size = "md",
  animate = true,
}: {
  index?: number;
  size?: CardSize;
  animate?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label="Face-down card"
      className={`card-back ${animate ? "card-deal" : ""} ${CARD_DIMENSIONS[size]}`}
      style={animate ? { animationDelay: `${index * 90}ms` } : undefined}
    />
  );
}
