import type { Winner } from "./engine";

// The scoreboards ("roads") baccarat tables show for the current shoe.

export type RoadResult = {
  winner: Winner;
  playerPair: boolean;
  bankerPair: boolean;
  natural: boolean;
  /** The winning total (both totals on a tie). */
  total: number;
};

export const ROAD_ROWS = 6;

/** Bead Plate: every result in order, filling columns of six from the top. */
export function beadPlate(history: RoadResult[], rows = ROAD_ROWS): RoadResult[][] {
  const columns: RoadResult[][] = [];
  history.forEach((r, i) => {
    if (i % rows === 0) columns.push([]);
    columns[columns.length - 1].push(r);
  });
  return columns;
}

export type BigRoadCell = {
  col: number;
  row: number;
  winner: "player" | "banker";
  /** Ties that came right after this result. */
  ties: number;
  playerPair: boolean;
  bankerPair: boolean;
};

/**
 * Big Road: each streak of Banker or Player wins runs down a column; a new
 * winner starts a new column. Ties are counted on the cell before them (or
 * the first cell, for ties at the very start). A streak longer than the
 * column turns right along the bottom ("dragon tail").
 */
export function bigRoad(history: RoadResult[], rows = ROAD_ROWS): BigRoadCell[] {
  const cells: BigRoadCell[] = [];
  const taken = new Set<string>();
  const key = (c: number, r: number) => `${c},${r}`;
  let leadingTies = 0;
  let streakStart = -1;
  let col = -1;
  let row = -1;

  for (const r of history) {
    if (r.winner === "tie") {
      if (cells.length === 0) leadingTies++;
      else cells[cells.length - 1].ties++;
      continue;
    }
    const last = cells[cells.length - 1];
    if (!last || last.winner !== r.winner) {
      // A new streak: the column after where the last streak started.
      streakStart += 1;
      col = streakStart;
      row = 0;
      while (taken.has(key(col, row))) col++;
    } else if (row + 1 < rows && !taken.has(key(col, row + 1))) {
      row += 1;
    } else {
      col += 1; // dragon tail
    }
    taken.add(key(col, row));
    cells.push({
      col,
      row,
      winner: r.winner,
      ties: cells.length === 0 ? leadingTies : 0,
      playerPair: r.playerPair,
      bankerPair: r.bankerPair,
    });
  }
  return cells;
}

/** How many of each result so far: shown above the roads. */
export function roadCounts(history: RoadResult[]) {
  return {
    banker: history.filter((r) => r.winner === "banker").length,
    player: history.filter((r) => r.winner === "player").length,
    tie: history.filter((r) => r.winner === "tie").length,
  };
}
