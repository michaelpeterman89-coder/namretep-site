// Each game's display name and where its pages live.

export const GAMES = {
  blackjack: { name: "Blackjack", path: "/blackjack" },
  holdem: { name: "Texas Hold'em", path: "/poker" },
  craps: { name: "Craps", path: "/craps" },
} as const;

export type GameKey = keyof typeof GAMES;

/** The game's name, or the raw id for anything unknown. */
export const gameName = (game: string) => (game in GAMES ? GAMES[game as GameKey].name : game);

/** Link to a table's page. */
export const tablePath = (game: string, tableId: string) =>
  `${game in GAMES ? GAMES[game as GameKey].path : "/blackjack"}/${tableId}`;
