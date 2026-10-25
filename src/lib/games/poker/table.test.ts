import { describe, expect, it } from "vitest";
import { applyAction, startHand, type PokerConfig } from "./engine";
import { BOT_THINK_MS, nextButtonIndex, POKER_TURN_SECONDS, pokerDeadline, pokerHandStats } from "./table";

const NL: PokerConfig = { variant: "holdem", structure: "no-limit", smallBlind: 5, bigBlind: 10, ante: 0 };
const now = new Date("2026-10-25T12:00:00Z");

describe("nextButtonIndex", () => {
  it("moves to the next seat number, skipping gaps and wrapping", () => {
    expect(nextButtonIndex([0, 2, 5], null)).toBe(0);
    expect(nextButtonIndex([0, 2, 5], 0)).toBe(1);
    expect(nextButtonIndex([0, 2, 5], 3)).toBe(2); // seat 3 left; button moves on to seat 5
    expect(nextButtonIndex([0, 2, 5], 5)).toBe(0);
  });
});

describe("pokerDeadline", () => {
  const hand = (ids: string[]) => startHand(NL, ids.map((playerId) => ({ playerId, stack: 1000 })), 0);

  it("gives bots a short think and people a timer when others are waiting", () => {
    const h = hand(["alice", "bob", "bot:Zorp"]); // alice (button) acts first, 3-handed
    expect(pokerDeadline(h, new Set(["alice", "bob"]), now)).toEqual(new Date(now.getTime() + POKER_TURN_SECONDS * 1000));
    const toBot = applyAction(applyAction(h, { type: "call", seat: 0 }), { type: "call", seat: 1 });
    expect(pokerDeadline(toBot, new Set(["alice", "bob"]), now)).toEqual(new Date(now.getTime() + BOT_THINK_MS));
  });

  it("has no timer for one person playing bots", () => {
    expect(pokerDeadline(hand(["alice", "bot:Zorp", "bot:Qwex"]), new Set(["alice"]), now)).toBeNull();
  });

  it("is due now for someone who has left", () => {
    expect(pokerDeadline(hand(["alice", "bob", "bot:Zorp"]), new Set(["bob"]), now)).toEqual(now);
  });
});

describe("pokerHandStats", () => {
  it("records each person's result and preflop habits, skipping bots", () => {
    // 3-handed, button alice: alice raises, bob (small blind) calls, the bot folds; alice bets the flop, bob folds.
    let h = startHand(NL, [
      { playerId: "alice", stack: 1000 },
      { playerId: "bob", stack: 1000 },
      { playerId: "bot:Zorp", stack: 1000 },
    ], 0);
    h = applyAction(h, { type: "raise", seat: 0, amount: 30 });
    h = applyAction(h, { type: "call", seat: 1 });
    h = applyAction(h, { type: "fold", seat: 2 });
    h = applyAction(h, { type: "check", seat: 1 });
    h = applyAction(h, { type: "raise", seat: 0, amount: 40 });
    h = applyAction(h, { type: "fold", seat: 1 });
    const stats = pokerHandStats(h, [1000, 1000, 1000], "NL Hold'em · 5/10");
    expect(stats).toEqual([
      {
        player_id: "alice",
        game: "holdem",
        rules_key: "NL Hold'em · 5/10",
        net: 40, // bob's 30 + the bot's big blind 10
        counters: { vpip: 1, pfr: 1, showdowns: 0, showdown_wins: 0 },
      },
      {
        player_id: "bob",
        game: "holdem",
        rules_key: "NL Hold'em · 5/10",
        net: -30,
        counters: { vpip: 1, pfr: 0, showdowns: 0, showdown_wins: 0 },
      },
    ]);
  });

  it("is empty until the hand is over", () => {
    const h = startHand(NL, [{ playerId: "a", stack: 100 }, { playerId: "b", stack: 100 }], 0);
    expect(pokerHandStats(h, [100, 100], "x")).toEqual([]);
  });
});
