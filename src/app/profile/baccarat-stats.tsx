import Link from "next/link";
import { percent, signed, Tile } from "@/components/stat-tile";
import { formatChips } from "@/lib/chips";
import { createClient } from "@/lib/supabase/server";

type Counters = Partial<
  Record<
    | "player_bets"
    | "player_wins"
    | "banker_bets"
    | "banker_wins"
    | "tie_bets"
    | "tie_wins"
    | "side_bets"
    | "side_wins"
    | "naturals",
    number
  >
>;

/** The player's baccarat stats, read through their own session (Row Level Security). */
export async function BaccaratStats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("player_game_stats")
    .select("rounds, wins, net_chips, biggest_win, counters")
    .eq("game", "baccarat");
  const rows = data ?? [];
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const counter = (name: keyof Counters) => sum((r) => Number((r.counters as Counters)[name] ?? 0));

  const hands = sum((r) => Number(r.rounds));
  const ahead = sum((r) => Number(r.wins));

  return (
    <section aria-labelledby="baccarat-stats-heading" className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
      <h2 id="baccarat-stats-heading" className="font-display text-sm text-neon-lime">
        Baccarat stats
      </h2>
      {hands === 0 ? (
        <p className="text-starlight/70">
          No baccarat hands yet.{" "}
          <Link href="/baccarat/new" className="text-neon-cyan underline underline-offset-4">
            Start a table
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Hands played" value={formatChips(hands)} />
          <Tile label="Hands ahead" value={formatChips(ahead)} note={`${percent(ahead, hands)} of hands`} />
          <Tile label="Net chips" value={signed(sum((r) => Number(r.net_chips)))} />
          <Tile label="Biggest win" value={formatChips(Math.max(0, ...rows.map((r) => Number(r.biggest_win))))} />
          <Tile
            label="Banker bets won"
            value={percent(counter("banker_wins"), counter("banker_bets"))}
            note={`${formatChips(counter("banker_bets"))} bets`}
          />
          <Tile
            label="Player bets won"
            value={percent(counter("player_wins"), counter("player_bets"))}
            note={`${formatChips(counter("player_bets"))} bets`}
          />
          <Tile label="Ties hit" value={formatChips(counter("tie_wins"))} note={`${formatChips(counter("tie_bets"))} tie bets`} />
          <Tile label="Side bets won" value={formatChips(counter("side_wins"))} note={`${formatChips(counter("side_bets"))} side bets`} />
        </div>
      )}
    </section>
  );
}
