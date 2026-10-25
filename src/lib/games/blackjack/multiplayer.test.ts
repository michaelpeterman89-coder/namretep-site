import { describe, expect, it } from "vitest";
import type { Card, Shoe } from "./cards";
import { applyAction, startRound, type BlackjackRound } from "./engine";
import { automaticAction, nextDeadline, seatsToDeal, TURN_SECONDS, waitingOn, type SeatState } from "./multiplayer";
import { DEFAULT_RULES, type BlackjackRules } from "./rules";

const rules: BlackjackRules = { ...DEFAULT_RULES, insurance: true };
const now = new Date("2026-10-25T12:00:00Z");

function stacked(cards: Card[]): Shoe {
  return { cards: [...cards, ...Array<Card>(312 - cards.length).fill("2c")], size: 312 };
}

/** Two players: a gets T,9 · b gets 5,8 · dealer 9 up, 7 in the hole. */
function twoPlayer(): BlackjackRound {
  return startRound(rules, stacked(["Ts", "5h", "9d", "9h", "8c", "7c"]), [
    { playerId: "a", bet: 10 },
    { playerId: "b", bet: 10 },
  ]);
}

/** Two players against a dealer ace, so insurance is offered to both. */
function twoPlayerVsAce(): BlackjackRound {
  return startRound(rules, stacked(["Ts", "5h", "Ad", "9h", "8c", "7c"]), [
    { playerId: "a", bet: 10 },
    { playerId: "b", bet: 10 },
  ]);
}

const seated = (...ids: string[]) => new Set(ids);

describe("waitingOn", () => {
  it("is the player whose turn it is", () => {
    const round = twoPlayer();
    expect(waitingOn(rules, round)).toEqual(["a"]);
    expect(waitingOn(rules, applyAction(rules, round, { type: "stand", seat: 0 }))).toEqual(["b"]);
  });

  it("is everyone still deciding on insurance", () => {
    const round = twoPlayerVsAce();
    expect(waitingOn(rules, round)).toEqual(["a", "b"]);
    expect(waitingOn(rules, applyAction(rules, round, { type: "decline", seat: 1 }))).toEqual(["a"]);
  });
});

describe("nextDeadline", () => {
  it("gives each decision a timer when others are at the table", () => {
    expect(nextDeadline(rules, twoPlayer(), seated("a", "b"), now)).toEqual(new Date(now.getTime() + TURN_SECONDS * 1000));
  });

  it("has no timer for solo hands", () => {
    const solo = startRound(rules, stacked(["Ts", "9d", "6h", "7c"]), [{ playerId: "a", bet: 10 }]);
    expect(nextDeadline(rules, solo, seated("a"), now)).toBeNull();
  });

  it("is due now when the player we're waiting on has left", () => {
    expect(nextDeadline(rules, twoPlayer(), seated("b"), now)).toEqual(now);
    const solo = startRound(rules, stacked(["Ts", "9d", "6h", "7c"]), [{ playerId: "a", bet: 10 }]);
    expect(nextDeadline(rules, solo, seated(), now)).toEqual(now);
  });

  it("is null once the round is settled", () => {
    let round = twoPlayer();
    round = applyAction(rules, round, { type: "stand", seat: 0 });
    round = applyAction(rules, round, { type: "stand", seat: 1 });
    expect(nextDeadline(rules, round, seated("a", "b"), now)).toBeNull();
  });
});

describe("automaticAction", () => {
  it("does nothing while time remains and everyone is here", () => {
    expect(automaticAction(rules, twoPlayer(), seated("a", "b"), false)).toBeNull();
  });

  it("stands for the player whose time ran out", () => {
    expect(automaticAction(rules, twoPlayer(), seated("a", "b"), true)).toEqual({ type: "stand", seat: 0 });
  });

  it("stands right away for a player who left, even with time remaining", () => {
    const round = applyAction(rules, twoPlayer(), { type: "stand", seat: 0 });
    expect(automaticAction(rules, round, seated("a"), false)).toEqual({ type: "stand", seat: 1 });
  });

  it("declines insurance for each player who didn't answer", () => {
    let round = twoPlayerVsAce();
    const first = automaticAction(rules, round, seated("a", "b"), true)!;
    expect(first).toEqual({ type: "decline", seat: 0 });
    round = applyAction(rules, round, first);
    expect(automaticAction(rules, round, seated("a", "b"), true)).toEqual({ type: "decline", seat: 1 });
  });
});

describe("seatsToDeal", () => {
  const seat = (n: number, bet: number | null, status: SeatState["status"] = "active"): SeatState => ({
    seatNumber: n,
    playerId: `p${n}`,
    status,
    pendingBet: bet,
  });

  it("waits while an active player hasn't bet and time remains", () => {
    expect(seatsToDeal([seat(0, 10), seat(1, null)], new Date(now.getTime() + 5000), now)).toBeNull();
  });

  it("deals as soon as every active player has bet, in seat order", () => {
    expect(seatsToDeal([seat(2, 20), seat(0, 10)], null, now)?.map((s) => s.seatNumber)).toEqual([0, 2]);
  });

  it("doesn't wait for players sitting out", () => {
    expect(seatsToDeal([seat(0, 10), seat(1, null, "sitting_out")], null, now)).toHaveLength(1);
  });

  it("deals whoever bet once betting closes", () => {
    expect(seatsToDeal([seat(0, 10), seat(1, null)], now, now)).toHaveLength(1);
  });

  it("never deals with no bets", () => {
    expect(seatsToDeal([seat(0, null)], now, now)).toBeNull();
  });
});
