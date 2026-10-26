import { GAMES, type GameKey } from "@/lib/games/catalog";

/** "How to play" for a game; opens in a new tab so players keep their seat. */
export function GuideLink({ game }: { game: GameKey }) {
  return (
    <a
      href={`/how-to-play${GAMES[game].path}`}
      target="_blank"
      rel="noopener"
      className="text-xs text-neon-cyan underline underline-offset-4 hover:text-starlight"
    >
      How to play ↗<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
