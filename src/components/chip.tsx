import { formatChips } from "@/lib/chips";

// Namretep chips: little space tokens with a spotted casino edge. Colors
// are original to this site.

export type Denomination = {
  value: number;
  name: string;
  label: string;
  /** Main color of the chip. */
  face: string;
  /** Color of the spots around the edge. */
  edge: string;
  /** Color of the number. */
  ink: string;
};

export const DENOMINATIONS: Denomination[] = [
  { value: 1, name: "Stardust", label: "1", face: "#ece8ff", edge: "#8c86b8", ink: "#0a0716" },
  { value: 5, name: "Nova", face: "#ff3ea5", label: "5", edge: "#fff4fb", ink: "#0a0716" },
  { value: 25, name: "Nebula", face: "#3ef0ff", label: "25", edge: "#0b4d57", ink: "#0a0716" },
  { value: 100, name: "Void", face: "#1b1533", label: "100", edge: "#ffcf3e", ink: "#ffcf3e" },
  { value: 500, name: "Aurora", face: "#7b3eff", label: "500", edge: "#3ef0ff", ink: "#ffffff" },
  { value: 1_000, name: "Solar", face: "#ffcf3e", label: "1K", edge: "#ff7a2e", ink: "#0a0716" },
  { value: 5_000, name: "Comet", face: "#ff7a2e", label: "5K", edge: "#fff4fb", ink: "#0a0716" },
  { value: 25_000, name: "Pulsar", face: "#3edc6a", label: "25K", edge: "#0d4a22", ink: "#0a0716" },
  { value: 100_000, name: "Quasar", face: "#ffffff", label: "100K", edge: "#ff3ea5", ink: "#7b3eff" },
];

/**
 * The chips that make up an amount, biggest first (e.g. 135 -> 100, 25, 5, 5).
 * Stops at `maxChips` so a huge bet doesn't draw a skyscraper; the label
 * under the stack always shows the exact total.
 */
export function chipBreakdown(amount: number, maxChips = 8): Denomination[] {
  const chips: Denomination[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (let i = DENOMINATIONS.length - 1; i >= 0 && chips.length < maxChips; i--) {
    const d = DENOMINATIONS[i];
    while (left >= d.value && chips.length < maxChips) {
      chips.push(d);
      left -= d.value;
    }
  }
  return chips;
}

const SIZES = { sm: "1.75rem", md: "2.25rem", lg: "2.9rem" } as const;
export type ChipSize = keyof typeof SIZES;

/** One chip, seen from above. */
export function Chip({ denomination, size = "md" }: { denomination: Denomination; size?: ChipSize }) {
  const d = denomination;
  return (
    <span
      className="chip"
      style={
        {
          "--chip-size": SIZES[size],
          "--chip-face": d.face,
          "--chip-edge": d.edge,
          "--chip-ink": d.ink,
          // Longer labels ("100K") use a smaller font to fit the center.
          "--chip-font": d.label.length >= 4 ? "0.15" : d.label.length === 3 ? "0.19" : "0.27",
        } as React.CSSProperties
      }
    >
      <span className="chip-center">{d.label}</span>
    </span>
  );
}

/** A stack of chips for an amount, with the exact total underneath. */
export function ChipStack({
  amount,
  size = "md",
  showTotal = true,
}: {
  amount: number;
  size?: ChipSize;
  showTotal?: boolean;
}) {
  // Biggest chips at the bottom (layer 0), smallest on top, like a real stack.
  const chips = chipBreakdown(amount);
  return (
    <span className="inline-flex flex-col items-center gap-0.5" title={`${formatChips(amount)} chips`}>
      <span
        className="chip-stack"
        style={{ "--chip-size": SIZES[size], "--count": Math.max(chips.length, 1) } as React.CSSProperties}
      >
        {chips.map((d, i) => (
          <span key={i} className="chip-stack-layer" style={{ "--layer": i } as React.CSSProperties}>
            <Chip denomination={d} size={size} />
          </span>
        ))}
      </span>
      {showTotal && <span className="font-display text-[0.55rem] text-starlight">{formatChips(amount)}</span>}
    </span>
  );
}
