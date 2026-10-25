/** A small outlined label, e.g. "Admin" or "Suspended". */
export function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`rounded border-2 px-1.5 py-0.5 font-display text-[0.55rem] ${className}`}>{children}</span>;
}
