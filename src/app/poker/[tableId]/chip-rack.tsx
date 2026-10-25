import { DENOMINATIONS } from "@/components/chip";

/** The house chip rack at the top of the poker table (decoration). */
export function ChipRack({ className }: { className: string }) {
  return (
    <div className={`chip-rack absolute ${className}`} aria-hidden>
      {DENOMINATIONS.slice(0, 8).map((d) => (
        <span key={d.value} style={{ "--face": d.face, "--edge": d.edge } as React.CSSProperties} />
      ))}
    </div>
  );
}
