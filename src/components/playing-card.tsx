import type { Card } from "@/lib/games/blackjack";

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

// Each suit is drawn as pixel art (the pixel font has no suit symbols, and
// borrowed ones come out a different size). "x" is a filled pixel.
const SUIT_PIXELS = {
  h: [".xx.xx.", "xxxxxxx", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."],
  d: ["...x...", "..xxx..", ".xxxxx.", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."],
  s: ["...x...", "..xxx..", ".xxxxx.", "xxxxxxx", "xxxxxxx", ".x.x.x.", "...x...", "..xxx.."],
  c: ["..xxx..", "..xxx..", "xx.x.xx", "xxxxxxx", "xx.x.xx", "...x...", "..xxx.."],
} as const;

type Suit = keyof typeof SUIT_PIXELS;

/** One suit symbol in the current text color. Size it with a height class. */
function SuitIcon({ suit, className }: { suit: Suit; className: string }) {
  const rows = SUIT_PIXELS[suit];
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      shapeRendering="crispEdges"
      className={`block w-auto fill-current ${className}`}
    >
      {rows.flatMap((row, y) =>
        [...row].map((pixel, x) => (pixel === "x" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)),
      )}
    </svg>
  );
}

// Corners are pinned to opposite corners and the big suit to the centre, so
// they can never run into each other.
const SIZES: Record<CardSize, { corner: string; cornerFlip: string; rank: string; cornerSuit: string; pip: string }> = {
  md: {
    corner: "top-1 left-1 sm:top-1.5 sm:left-1.5",
    cornerFlip: "bottom-1 right-1 sm:bottom-1.5 sm:right-1.5",
    rank: "text-[0.6rem] sm:text-xs",
    cornerSuit: "h-2 sm:h-2.5",
    pip: "h-5 sm:h-8",
  },
  sm: {
    corner: "top-0.5 left-0.5 sm:top-1 sm:left-1",
    cornerFlip: "bottom-0.5 right-0.5 sm:bottom-1 sm:right-1",
    rank: "text-[0.5rem] sm:text-[0.6rem]",
    cornerSuit: "h-1.5 sm:h-2",
    pip: "h-4 sm:h-5",
  },
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
  const suit = card[1] as Suit;
  const label = rank === "T" ? "10" : rank;
  const red = suit === "h" || suit === "d";
  const s = SIZES[size];
  const corner = (
    <>
      <span className={`${s.rank} leading-none`}>{label}</span>
      <SuitIcon suit={suit} className={s.cornerSuit} />
    </>
  );

  return (
    <div
      role="img"
      aria-label={cardLabel(card)}
      className={`card-face relative ${animate ? "card-deal" : ""} ${CARD_DIMENSIONS[size]} font-display ${
        red ? "text-neon-magenta" : "text-ink"
      }`}
      style={animate ? { animationDelay: `${index * 90}ms` } : undefined}
    >
      <span className={`absolute ${s.corner} flex flex-col items-center gap-0.5`}>{corner}</span>
      <SuitIcon suit={suit} className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${s.pip}`} />
      <span className={`absolute ${s.cornerFlip} flex rotate-180 flex-col items-center gap-0.5`}>
        {corner}
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
