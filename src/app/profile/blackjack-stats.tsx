import Link from "next/link";
import { formatChips } from "@/lib/chips";
import { actionLabel } from "@/lib/games/blackjack/strategy";
import type { ActionType } from "@/lib/games/blackjack/engine";
import { createClient } from "@/lib/supabase/server";
import { percent, signed, Tile } from "@/components/stat-tile";

type Counters = Partial<Record<"blackjacks" | "busts" | "doubles" | "splits" | "surrenders", number>>;

/**
 * The player's blackjack stats, read through their own session so Row Level
 * Security limits everything to their data. `rulesKey` filters to one rule set.
 */
export async function BlackjackStats({ rulesKey }: { rulesKey: string | null }) {
  const supabase = await createClient();
  const filter = rulesKey ?? undefined;
  const [statsResult, bookResult, missedResult] = await Promise.all([
    supabase
      .from("player_game_stats")
      .select("rules_key, rounds, wins, losses, pushes, net_chips, biggest_win, biggest_loss, counters")
      .eq("game", "blackjack")
      .order("rounds", { ascending: false }),
    supabase.rpc("my_book_summary", { p_rules_key: filter }),
    supabase.rpc("my_missed_situations", { p_rules_key: filter, p_limit: 5 }),
  ]);

  const allRows = statsResult.data ?? [];
  const rows = rulesKey ? allRows.filter((r) => r.rules_key === rulesKey) : allRows;
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const counter = (name: keyof Counters) => sum((r) => Number((r.counters as Counters)[name] ?? 0));

  const rounds = sum((r) => Number(r.rounds));
  const wins = sum((r) => Number(r.wins));
  const losses = sum((r) => Number(r.losses));
  const pushes = sum((r) => Number(r.pushes));
  const net = sum((r) => Number(r.net_chips));
  const biggestWin = Math.max(0, ...rows.map((r) => Number(r.biggest_win)));
  const biggestLoss = Math.max(0, ...rows.map((r) => Number(r.biggest_loss)));

  const book = bookResult.data?.[0];
  const decisions = Number(book?.decisions ?? 0);
  const onBook = Number(book?.on_book ?? 0);
  const hinted = Number(book?.hinted_decisions ?? 0);
  const missed = missedResult.data ?? [];

  return (
    <section aria-labelledby="bj-stats-heading" className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <h2 id="bj-stats-heading" className="font-display text-sm text-neon-cyan">
          Blackjack stats
        </h2>
        {allRows.length > 1 && (
          <nav aria-label="Filter by rule set" className="flex flex-wrap gap-2">
            {[null, ...allRows.map((r) => r.rules_key)].map((key) => {
              const active = key === rulesKey;
              return (
                <Link
                  key={key ?? "all"}
                  href={key ? `/profile?rules=${encodeURIComponent(key)}` : "/profile"}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`rounded-md border-2 px-2.5 py-1 text-xs ${
                    active ? "border-neon-gold text-neon-gold" : "border-space-700 text-starlight/70 hover:text-starlight"
                  }`}
                >
                  {key ?? "All rule sets"}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {rounds === 0 && decisions === 0 ? (
        <p className="text-starlight/70">
          Play a few hands and your stats will show up here.{" "}
          <Link href="/blackjack" className="text-neon-cyan underline underline-offset-4">
            Go to your tables
          </Link>
        </p>
      ) : (
        <>
          {/* Headline: On Book % */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex flex-col">
              <span className="text-sm text-starlight/70">On Book</span>
              <span className="font-display text-4xl text-neon-gold sm:text-5xl">{percent(onBook, decisions)}</span>
            </div>
            <p className="pb-1 text-sm text-starlight/70">
              {formatChips(onBook)} of {formatChips(decisions)} decisions matched basic strategy for the table&apos;s rules.
              {hinted > 0 && ` ${formatChips(hinted)} made with hints on aren't counted.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Hands played" value={formatChips(rounds)} />
            <Tile label="Won" value={formatChips(wins)} note={`${percent(wins, rounds)} of hands`} />
            <Tile label="Lost" value={formatChips(losses)} />
            <Tile label="Pushed" value={formatChips(pushes)} />
            <Tile label="Net chips" value={signed(net)} />
            <Tile label="Biggest win" value={formatChips(biggestWin)} />
            <Tile label="Biggest loss" value={formatChips(biggestLoss)} />
            <Tile label="Blackjacks" value={formatChips(counter("blackjacks"))} />
            <Tile label="Busts" value={formatChips(counter("busts"))} />
            <Tile label="Doubles" value={formatChips(counter("doubles"))} />
            <Tile label="Splits" value={formatChips(counter("splits"))} />
            <Tile label="Surrenders" value={formatChips(counter("surrenders"))} />
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-display text-xs text-neon-cyan">Most missed</h3>
            {missed.length === 0 ? (
              <p className="text-sm text-starlight/70">
                {decisions > 0 ? "No mistakes yet. Every decision was by the book!" : "No decisions recorded yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-starlight/60">
                    <tr>
                      <th className="py-1.5 pr-3 font-normal">Situation</th>
                      <th className="py-1.5 pr-3 font-normal">Missed</th>
                      <th className="py-1.5 font-normal">Book play</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missed.map((m) => (
                      <tr key={m.situation_key} className="border-t border-space-700">
                        <td className="py-2 pr-3">{m.situation}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {Number(m.misses)} of {Number(m.total)}
                        </td>
                        <td className="py-2">{actionLabel(m.book_action as ActionType)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
