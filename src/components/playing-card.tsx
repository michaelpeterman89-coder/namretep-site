import type { Card } from "@/lib/games/blackjack";

const SUIT_SYMBOLS = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;
const SUIT_NAMES = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const;
const RANK_NAMES: Record<string, string> = { A: "Ace", T: "10", J: "Jack", Q: "Queen", K: "King" };

export type CardSize = "md" | "sm";

const SIZES: Record<CardSize, { box: string; corner: string; pip: string }> = {
  md: { box: "h-20 w-14 p-1 sm:h-28 sm:w-20 sm:p-1.5", corner: "text-[0.6rem] sm:text-xs", pip: "text-xl sm:text-3xl" },
  sm: { box: "h-16 w-11 p-0.5 sm:h-20 sm:w-14 sm:p-1", corner: "text-[0.5rem] sm:text-[0.6rem]", pip: "text-base sm:text-xl" },
};

/** A face-up pixel card. `index` staggers the deal animation. */
export function PlayingCard({ card, index = 0, size = "md" }: { card: Card; index?: number; size?: CardSize }) {
  const rank = card[0];
  const suit = card[1] as keyof typeof SUIT_SYMBOLS;
  const label = rank === "T" ? "10" : rank;
  const red = suit === "h" || suit === "d";
  const s = SIZES[size];

  return (
    <div
      role="img"
      aria-label={`${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit]}`}
      className={`card-face card-deal ${s.box} flex flex-col justify-between font-display ${
        red ? "text-neon-magenta" : "text-ink"
      }`}
      style={{ animationDelay: `${index * 90}ms` }}
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

export function CardBack({ index = 0, size = "md" }: { index?: number; size?: CardSize }) {
  return (
    <div
      role="img"
      aria-label="Face-down card"
      className={`card-back card-deal ${SIZES[size].box}`}
      style={{ animationDelay: `${index * 90}ms` }}
    />
  );
}
