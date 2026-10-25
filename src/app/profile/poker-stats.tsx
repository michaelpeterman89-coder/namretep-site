import Link from "next/link";
import { percent, signed, Tile } from "@/components/stat-tile";
import { formatChips } from "@/lib/chips";
import { createClient } from "@/lib/supabase/server";

type Counters = Partial<Record<"vpip" | "pfr" | "showdowns" | "showdown_wins", number>>;

/** The player's Texas Hold'em stats, read through their own session (Row Level Security). */
export async function PokerStats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("player_game_stats")
    .select("rounds, wins, net_chips, biggest_win, biggest_loss, counters")
    .eq("game", "holdem");
  const rows = data ?? [];
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const counter = (name: keyof Counters) => sum((r) => Number((r.counters as Counters)[name] ?? 0));

  const hands = sum((r) => Number(r.rounds));
  const won = sum((r) => Number(r.wins));
  const net = sum((r) => Number(r.net_chips));
  const showdowns = counter("showdowns");

  return (
    <section aria-labelledby="poker-stats-heading" className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
      <h2 id="poker-stats-heading" className="font-display text-sm text-neon-gold">
        Texas Hold&apos;em stats
      </h2>
      {hands === 0 ? (
        <p className="text-starlight/70">
          No poker hands yet.{" "}
          <Link href="/poker/new" className="text-neon-cyan underline underline-offset-4">
            Start a table
          </Link>{" "}
          (bots will play with you).
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Hands played" value={formatChips(hands)} />
          <Tile label="Hands won" value={formatChips(won)} note={`${percent(won, hands)} of hands`} />
          <Tile label="Net chips" value={signed(net)} />
          <Tile label="Biggest win" value={formatChips(Math.max(0, ...rows.map((r) => Number(r.biggest_win))))} />
          <Tile
            label="Voluntarily in pot"
            value={percent(counter("vpip"), hands)}
            note="Put chips in before the flop"
          />
          <Tile label="Preflop raise" value={percent(counter("pfr"), hands)} note="Raised before the flop" />
          <Tile label="Showdowns" value={formatChips(showdowns)} />
          <Tile label="Showdowns won" value={percent(counter("showdown_wins"), showdowns)} />
        </div>
      )}
    </section>
  );
}
