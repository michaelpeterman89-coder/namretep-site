import type { Card } from "@/lib/games/blackjack";

const SUIT_SYMBOLS = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;
const SUIT_NAMES = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const;
const RANK_NAMES: Record<string, string> = { A: "Ace", T: "10", J: "Jack", Q: "Queen", K: "King" };

const SIZE = "h-20 w-14 sm:h-28 sm:w-20";

/** A face-up pixel card. `index` staggers the deal animation. */
export function PlayingCard({ card, index = 0 }: { card: Card; index?: number }) {
  const rank = card[0];
  const suit = card[1] as keyof typeof SUIT_SYMBOLS;
  const label = rank === "T" ? "10" : rank;
  const red = suit === "h" || suit === "d";

  return (
    <div
      role="img"
      aria-label={`${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit]}`}
      className={`card-face card-deal ${SIZE} flex flex-col justify-between p-1 font-display sm:p-1.5 ${
        red ? "text-neon-magenta" : "text-ink"
      }`}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <span className="text-[0.6rem] leading-none sm:text-xs">
        {label}
        <br />
        {SUIT_SYMBOLS[suit]}
      </span>
      <span className="self-center text-xl sm:text-3xl">{SUIT_SYMBOLS[suit]}</span>
      <span className="rotate-180 text-[0.6rem] leading-none sm:text-xs">
        {label}
        <br />
        {SUIT_SYMBOLS[suit]}
      </span>
    </div>
  );
}

export function CardBack({ index = 0 }: { index?: number }) {
  return (
    <div
      role="img"
      aria-label="Face-down card"
      className={`card-back card-deal ${SIZE}`}
      style={{ animationDelay: `${index * 90}ms` }}
    />
  );
}
