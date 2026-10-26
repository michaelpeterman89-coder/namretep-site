import Link from "next/link";
import { TableList } from "@/components/table-list";
import { requirePlayer } from "@/lib/auth";
import { listTablesFor, type GameId } from "@/server/tables";

const GAMES: Record<GameId, { name: string; path: string; newLabel: string }> = {
  blackjack: { name: "blackjack", path: "/blackjack", newLabel: "New blackjack table" },
  holdem: { name: "Texas Hold'em", path: "/poker", newLabel: "New poker table" },
};

/** One game's tables: yours first, then public ones you can join. */
export async function GameTables({ game }: { game: GameId }) {
  const { name, path, newLabel } = GAMES[game];
  const player = await requirePlayer(path);
  const { mine, others } = await listTablesFor(player.id, game);

  return (
    <>
      {mine.length > 0 && (
        <section aria-labelledby="mine-heading" className="flex flex-col gap-4">
          <h2 id="mine-heading" className="font-display text-sm text-neon-cyan">
            Your tables
          </h2>
          <TableList tables={mine} />
        </section>
      )}
      <section aria-labelledby="open-heading" className="flex flex-col gap-4">
        <h2 id="open-heading" className="font-display text-sm text-neon-cyan">
          Open tables
        </h2>
        {others.length > 0 ? (
          <TableList tables={others} />
        ) : (
          <div className="pixel-panel flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-starlight/80">
              No other public {name} tables are open right now. Start one and others can join you.
            </p>
            <Link href={`${path}/new`} className="pixel-btn bg-neon-magenta text-ink">
              {newLabel}
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
