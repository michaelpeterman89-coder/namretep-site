import {
  DEFAULT_RULES,
  EURO_NO_HOLE_CARD_RULES,
  rulesSummary,
  SINGLE_DECK_RULES,
  TOURIST_TRAP_RULES,
  type BlackjackRules,
} from "@/lib/games/blackjack/rules";
import { bookChartEntry, type BookChartEntry, type RowKey } from "@/lib/games/blackjack/strategy";

// Printed basic-strategy charts, worked out by the same math that scores On Book %.

const STYLES: { name: string; about: string; rules: BlackjackRules }[] = [
  { name: "6 decks, dealer stands on soft 17", about: "The Classic Strip preset.", rules: DEFAULT_RULES },
  {
    name: "6 decks, dealer hits soft 17",
    about: "A common shoe game in casinos today.",
    rules: { ...DEFAULT_RULES, dealerHitsSoft17: true },
  },
  { name: "8 decks, dealer hits soft 17", about: "The Tourist trap preset. The 6:5 payout doesn't change the book.", rules: TOURIST_TRAP_RULES },
  {
    name: "2 decks, dealer hits soft 17",
    about: "The usual double-deck game.",
    rules: { ...DEFAULT_RULES, decks: 2, dealerHitsSoft17: true, surrender: "none" },
  },
  { name: "Single deck", about: "The Single deck preset. Dealer hits soft 17, no double after split.", rules: SINGLE_DECK_RULES },
  {
    name: "European, no hole card",
    about: "The Euro preset. A dealer blackjack also takes doubles and splits, so play them more carefully.",
    rules: EURO_NO_HOLE_CARD_RULES,
  },
];

const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
const upLabel = (up: number) => (up === 1 ? "A" : String(up));

const CODES: Record<string, { meaning: string; color: string }> = {
  H: { meaning: "Hit", color: "bg-space-700 text-starlight" },
  S: { meaning: "Stand", color: "bg-neon-gold text-ink" },
  D: { meaning: "Double, or hit if you can't", color: "bg-neon-cyan text-ink" },
  Ds: { meaning: "Double, or stand if you can't", color: "bg-neon-cyan text-ink" },
  P: { meaning: "Split", color: "bg-neon-lime text-ink" },
  Rh: { meaning: "Surrender, or hit if you can't", color: "bg-neon-magenta text-ink" },
  Rs: { meaning: "Surrender, or stand if you can't", color: "bg-neon-magenta text-ink" },
  Rp: { meaning: "Surrender, or split if you can't", color: "bg-neon-magenta text-ink" },
};

function codeFor({ play, otherwise }: BookChartEntry): string {
  if (play === "hit") return "H";
  if (play === "stand") return "S";
  if (play === "split") return "P";
  if (play === "double") return otherwise === "stand" ? "Ds" : "D";
  return otherwise === "stand" ? "Rs" : otherwise === "split" ? "Rp" : "Rh";
}

type Row = { label: string; codes: string[] };

function rowOf(rules: BlackjackRules, label: string, key: RowKey): Row {
  return { label, codes: UPCARDS.map((up) => codeFor(bookChartEntry(rules, key, up))) };
}

/** Hard totals, with neighbouring totals that play the same joined up (e.g. "5–8"). */
function hardRows(rules: BlackjackRules): Row[] {
  const rows: (Row & { from: number; to: number })[] = [];
  for (let total = 5; total <= 20; total++) {
    const row = rowOf(rules, "", `H${total}`);
    const last = rows.at(-1);
    if (last && last.codes.join() === row.codes.join()) last.to = total;
    else rows.push({ ...row, from: total, to: total });
  }
  return rows.map((r) => ({ label: r.from === r.to ? String(r.from) : `${r.from}–${r.to}`, codes: r.codes }));
}

function softRows(rules: BlackjackRules): Row[] {
  return Array.from({ length: 8 }, (_, i) => rowOf(rules, `A,${i + 2}`, `S${i + 13}`));
}

function pairRows(rules: BlackjackRules): Row[] {
  return [1, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((n) => rowOf(rules, `${upLabel(n)},${upLabel(n)}`, `P${n}`));
}

function Grid({ title, rowHeader, rows }: { title: string; rowHeader: string; rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-px text-center text-[0.65rem] sm:border-spacing-0.5 sm:text-sm">
        <caption className="mb-1.5 text-left font-display text-[0.6rem] text-neon-cyan">{title}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-10 text-[0.6rem] font-normal text-starlight/60 sm:w-16">
              {rowHeader}
            </th>
            {UPCARDS.map((up) => (
              <th key={up} scope="col" className="py-1 font-semibold text-starlight">
                {upLabel(up)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="whitespace-nowrap font-semibold text-starlight">
                {row.label}
              </th>
              {row.codes.map((code, i) => (
                <td
                  key={UPCARDS[i]}
                  title={`${row.label} vs ${upLabel(UPCARDS[i])}: ${CODES[code].meaning}`}
                  className={`rounded-sm py-1 font-semibold ${CODES[code].color}`}
                >
                  {code}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BookCharts() {
  return (
    <>
      <p>
        The best play depends on the table&apos;s rules, so each game style has its own chart. Find your hand on the left
        and the dealer&apos;s up card across the top. These come from the same math that scores your On Book %.
      </p>
      <dl className="grid gap-x-5 gap-y-1.5 text-sm sm:grid-cols-2">
        {Object.entries(CODES).map(([code, { meaning, color }]) => (
          <div key={code} className="flex items-center gap-2">
            <dt className={`w-8 shrink-0 rounded-sm py-0.5 text-center text-xs font-semibold ${color}`}>{code}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        {STYLES.map((style, i) => (
          <details key={style.name} open={i === 0} className="rounded-md border-2 border-space-700 open:border-neon-magenta">
            <summary className="cursor-pointer px-3 py-2.5 font-semibold text-starlight">
              {style.name}
              <span className="ml-2 font-display text-[0.55rem] text-neon-magenta">{rulesSummary(style.rules)}</span>
            </summary>
            <div className="flex flex-col gap-5 px-2 pt-1 pb-4 sm:px-3">
              <p className="text-sm text-starlight/70">{style.about}</p>
              <Grid title="Hard hands" rowHeader="Total" rows={hardRows(style.rules)} />
              <Grid title="Soft hands" rowHeader="Hand" rows={softRows(style.rules)} />
              <Grid title="Pairs" rowHeader="Pair" rows={pairRows(style.rules)} />
            </div>
          </details>
        ))}
      </div>
      <p className="text-sm text-starlight/70">
        If you can&apos;t split again, play a pair as its total from the other charts. If your table&apos;s rules differ from
        these, press <strong>Hint</strong> at the table for the exact book play.
      </p>
    </>
  );
}
