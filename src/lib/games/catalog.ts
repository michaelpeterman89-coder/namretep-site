// Each game's display name, where its pages live, and its color (used for
// its buttons and labels everywhere, so each game always looks the same).

export const GAMES = {
  blackjack: { name: "Blackjack", short: "blackjack", path: "/blackjack", button: "bg-neon-magenta text-ink", text: "text-neon-magenta" },
  holdem: { name: "Texas Hold'em", short: "poker", path: "/poker", button: "bg-neon-gold text-ink", text: "text-neon-gold" },
  craps: { name: "Craps", short: "craps", path: "/craps", button: "bg-neon-cyan text-ink", text: "text-neon-cyan" },
  baccarat: { name: "Baccarat", short: "baccarat", path: "/baccarat", button: "bg-neon-lime text-ink", text: "text-neon-lime" },
} as const;

export type GameKey = keyof typeof GAMES;

/** The game's name, or the raw id for anything unknown. */
export const gameName = (game: string) => (game in GAMES ? GAMES[game as GameKey].name : game);

/** Link to a table's page. */
export const tablePath = (game: string, tableId: string) =>
  `${game in GAMES ? GAMES[game as GameKey].path : "/blackjack"}/${tableId}`;

/** Games we plan to add (shown as "coming later" until they're built). */
export const PLANNED_GAMES = [
  { name: "Roulette", note: "American, European, and French (la partage) wheels." },
  { name: "Video Poker", note: "Jacks or Better and friends, with real pay tables like 9/6." },
  { name: "More poker", note: "Omaha and Seven-Card Stud, as choices when you create a poker table." },
] as const;

/** The game whose pages live at `/${slug}` (e.g. "poker" → holdem), if any. */
export function gameBySlug(slug: string): GameKey | null {
  return (Object.keys(GAMES) as GameKey[]).find((k) => GAMES[k].path === `/${slug}`) ?? null;
}
