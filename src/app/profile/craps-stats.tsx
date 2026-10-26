import Link from "next/link";
import { percent, signed, Tile } from "@/components/stat-tile";
import { formatChips } from "@/lib/chips";
import { createClient } from "@/lib/supabase/server";

type Counters = Partial<
  Record<
    "bets_won" | "bets_lost" | "rolls_shot" | "points_made" | "sevens_out" | "fire_wins" | "small_tall_wins" | "hop_wins",
    number
  >
>;

/** The player's craps stats, read through their own session (Row Level Security). */
export async function CrapsStats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("player_game_stats")
    .select("rounds, net_chips, biggest_win, biggest_loss, counters")
    .eq("game", "craps");
  const rows = data ?? [];
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const counter = (name: keyof Counters) => sum((r) => Number((r.counters as Counters)[name] ?? 0));

  const rolls = sum((r) => Number(r.rounds));
  const won = counter("bets_won");
  const lost = counter("bets_lost");
  const bonus = counter("fire_wins") + counter("small_tall_wins") + counter("hop_wins");

  return (
    <section aria-labelledby="craps-stats-heading" className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
      <h2 id="craps-stats-heading" className="font-display text-sm text-neon-magenta">
        Craps stats
      </h2>
      {rolls === 0 ? (
        <p className="text-starlight/70">
          No craps rolls yet.{" "}
          <Link href="/craps/new" className="text-neon-cyan underline underline-offset-4">
            Start a table
          </Link>{" "}
          and grab the dice.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Rolls played" value={formatChips(rolls)} note="Rolls where your bets were decided or you shot" />
          <Tile label="Net chips" value={signed(sum((r) => Number(r.net_chips)))} />
          <Tile label="Bets won" value={formatChips(won)} note={`${percent(won, won + lost)} of decided bets`} />
          <Tile label="Biggest roll" value={formatChips(Math.max(0, ...rows.map((r) => Number(r.biggest_win))))} />
          <Tile label="Rolls as shooter" value={formatChips(counter("rolls_shot"))} />
          <Tile label="Points made" value={formatChips(counter("points_made"))} />
          <Tile label="Sevens out" value={formatChips(counter("sevens_out"))} />
          <Tile label="Bonus & hop wins" value={formatChips(bonus)} note="Fire Bet, All Small/Tall, hops" />
        </div>
      )}
    </section>
  );
}
