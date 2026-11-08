import type { ReactNode } from "react";

// Building blocks for the How to Play guides, so every game's guide looks the same.

/** A titled block of a guide. `id` makes it linkable (e.g. #bets). */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="pixel-panel flex scroll-mt-6 flex-col gap-4 p-5 sm:p-7">
      <h2 id={`${id}-heading`} className="font-display text-sm text-neon-gold">
        {title}
      </h2>
      <div className="flex flex-col gap-3 leading-relaxed text-starlight/90">{children}</div>
    </section>
  );
}

/** Numbered steps, e.g. how a round goes. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-6 marker:font-display marker:text-[0.6rem] marker:text-neon-cyan">{children}</ol>;
}

/** A bulleted list. */
export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-neon-cyan">{children}</ul>;
}

/** A table of bets: what wins, what it pays, and its house edge. */
export function PayTable({
  rows,
  columns = ["Bet", "Wins when", "Pays", "House edge"],
}: {
  rows: ReactNode[][];
  columns?: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="text-xs text-starlight/60">
          <tr>
            {columns.map((c) => (
              <th key={c} className="py-2 pr-3 font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-space-700">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`py-2 pr-3 align-top ${j === 0 ? "font-semibold text-starlight" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Keyboard shortcuts. */
export function Keys({ keys }: { keys: [key: string, does: string][] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {keys.map(([key, does]) => (
        <li key={key} className="flex items-center gap-2 text-sm">
          <kbd className="kbd">{key}</kbd>
          {does}
        </li>
      ))}
    </ul>
  );
}

/** A highlighted tip. */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border-2 border-neon-cyan/50 bg-neon-cyan/5 px-4 py-3 text-sm">
      <span className="font-display text-[0.6rem] text-neon-cyan">Tip · </span>
      {children}
    </p>
  );
}

/** A setting and what it does. */
export function Settings({ items }: { items: [setting: string, meaning: ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[12rem_1fr]">
      {items.map(([setting, meaning]) => (
        <div key={setting} className="contents">
          <dt className="font-semibold text-starlight">{setting}</dt>
          <dd className="text-starlight/80">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
