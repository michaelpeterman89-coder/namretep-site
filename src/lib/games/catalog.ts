// Each game's display name, where its pages live, and its color (used for
// its buttons and labels everywhere, so each game always looks the same).

export const GAMES = {
  blackjack: { name: "Blackjack", short: "blackjack", path: "/blackjack", button: "bg-neon-magenta text-ink", text: "text-neon-magenta" },
  holdem: { name: "Texas Hold'em", short: "poker", path: "/poker", button: "bg-neon-gold text-ink", text: "text-neon-gold" },
  craps: { name: "Craps", short: "craps", path: "/craps", button: "bg-neon-cyan text-ink", text: "text-neon-cyan" },
} as const;

export type GameKey = keyof typeof GAMES;

/** The game's name, or the raw id for anything unknown. */
export const gameName = (game: string) => (game in GAMES ? GAMES[game as GameKey].name : game);

/** Link to a table's page. */
export const tablePath = (game: string, tableId: string) =>
  `${game in GAMES ? GAMES[game as GameKey].path : "/blackjack"}/${tableId}`;
