import { describe, expect, it } from "vitest";
import type { BetResult } from "./engine";
import { BETTING_MS, crapsRollStats, nextRollAt, nextShooter, ROLL_PAUSE_MS } from "./table";

const seats = [
  { seatNumber: 4, playerId: "c" },
  { seatNumber: 0, playerId: "a" },
  { seatNumber: 2, playerId: "b" },
];

describe("nextShooter", () => {
  it("goes round the table by seat number and wraps", () => {
    expect(nextShooter(seats, 0)).toBe("b");
    expect(nextShooter(seats, 2)).toBe("c");
    expect(nextShooter(seats, 4)).toBe("a");
    expect(nextShooter(seats, 3)).toBe("c"); // the shooter in seat 3 left
    expect(nextShooter(seats, null)).toBe("a");
    expect(nextShooter([], 1)).toBeNull();
  });
});

describe("nextRollAt", () => {
  it("gives others time to bet, but only a short pause when playing alone", () => {
    expect(nextRollAt(1000, 1).getTime()).toBe(1000 + ROLL_PAUSE_MS);
    expect(nextRollAt(1000, 3).getTime()).toBe(1000 + BETTING_MS);
  });
});

describe("crapsRollStats", () => {
  const r = (playerId: string, kind: BetResult["kind"], outcome: BetResult["outcome"], amount: number, winnings = 0): BetResult => ({
    betId: "x",
    playerId,
    kind,
    number: null,
    amount,
    outcome,
    winnings,
    credit: outcome === "win" ? winnings : 0,
    stays: false,
  });

  it("nets wins against losses per player and counts the shooter's roll", () => {
    const lines = crapsRollStats(
      [r("a", "pass", "win", 10, 10), r("a", "field", "lose", 5), r("b", "hop", "win", 2, 30), r("b", "come", "moved", 10)],
      "a",
      "pointMade",
      "Craps",
    );
    const a = lines.find((l) => l.player_id === "a")!;
    const b = lines.find((l) => l.player_id === "b")!;
    expect(a).toMatchObject({ net: 5, counters: { bets_won: 1, bets_lost: 1, rolls_shot: 1, points_made: 1 } });
    expect(b).toMatchObject({ net: 30, counters: { bets_won: 1, hop_wins: 1 } });
  });

  it("skips players whose bets weren't decided, but keeps the shooter", () => {
    const lines = crapsRollStats([r("b", "come", "moved", 10)], "a", "sevenOut", "Craps");
    expect(lines).toEqual([{ player_id: "a", game: "craps", rules_key: "Craps", net: 0, counters: { rolls_shot: 1, sevens_out: 1 } }]);
  });
});
