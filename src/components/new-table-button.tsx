import Link from "next/link";
import { GAMES, type GameKey } from "@/lib/games/catalog";

/** "New blackjack table" (or a shorter label), in the game's own color. */
export function NewTableButton({ game, label }: { game: GameKey; label?: string }) {
  const g = GAMES[game];
  return (
    <Link href={`${g.path}/new`} className={`pixel-btn ${g.button}`}>
      {label ?? `New ${g.short} table`}
    </Link>
  );
}

/** "How to play" for a game's page, next to its New table button. */
export function HowToPlayButton({ game }: { game: GameKey }) {
  return (
    <Link href={`/how-to-play${GAMES[game].path}`} className="pixel-btn bg-space-800 text-starlight">
      How to play
    </Link>
  );
}
