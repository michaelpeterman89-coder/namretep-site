import type { BlackjackRules } from "@/lib/games/blackjack/rules";

// The printed felt markings for the blackjack table. Drawn as SVG so they stay
// crisp at any size.

/**
 * The rules printed on the felt in curved text, like a real table. On narrow
 * screens a plain line is shown instead, since curved text gets too small.
 */
export function FeltMarkings({ rules }: { rules: BlackjackRules }) {
  const main = `BLACKJACK PAYS ${rules.blackjackPayout.replace(":", " TO ")}`;
  const small = [
    `DEALER ${rules.dealerHitsSoft17 ? "HITS" : "STANDS ON"} SOFT 17`,
    rules.insurance ? "INSURANCE PAYS 2 TO 1" : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <>
      <svg aria-hidden viewBox="0 0 1000 205" className="hidden w-full max-w-3xl sm:block">
        <defs>
          <path id="felt-arc-main" d="M 60 22 Q 500 200 940 22" fill="none" />
          <path id="felt-arc-small" d="M 30 82 Q 500 270 970 82" fill="none" />
        </defs>
        <use href="#felt-arc-main" stroke="#ffcf3e" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="6 8" />
        <text className="felt-text" fill="#ffcf3e" fontSize="30" letterSpacing="3">
          <textPath href="#felt-arc-main" startOffset="50%" textAnchor="middle">
            {main}
          </textPath>
        </text>
        <text className="felt-text" fill="#3ef0ff" fillOpacity="0.75" fontSize="17" letterSpacing="2">
          <textPath href="#felt-arc-small" startOffset="50%" textAnchor="middle">
            {small}
          </textPath>
        </text>
      </svg>
      <p className="text-center font-display text-[0.55rem] leading-relaxed text-neon-gold/70 sm:hidden">
        {main} · {small}
      </p>
    </>
  );
}

/** How far each seat drops along the table's curve (middle seats lowest), in pixels. */
export function seatArcOffset(index: number, count: number): number {
  if (count < 3) return 0;
  const middle = (count - 1) / 2;
  const t = (index - middle) / middle; // -1 .. 1
  return Math.round(36 * (1 - t * t));
}
