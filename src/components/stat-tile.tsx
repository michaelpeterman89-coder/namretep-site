import { formatChips } from "@/lib/chips";

/** One labelled number in a stats panel. */
export function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border-2 border-space-700 bg-space-950/60 px-3 py-2.5">
      <span className="text-xs text-starlight/70">{label}</span>
      <span className="font-display text-sm text-starlight">{value}</span>
      {note && <span className="text-xs text-starlight/70">{note}</span>}
    </div>
  );
}

/** A chip amount with a sign: "+120", "−40", "0". */
export function signed(n: number): string {
  if (n > 0) return `+${formatChips(n)}`;
  if (n < 0) return `−${formatChips(-n)}`;
  return "0";
}

/** "42.5%", or "—" when there's nothing to divide by. */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}
