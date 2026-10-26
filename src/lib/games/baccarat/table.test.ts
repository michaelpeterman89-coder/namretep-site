import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/games/deck";
import {
  addBet,
  allReady,
  baccaratHandStats,
  dealAndSettle,
  IllegalBaccaratBet,
  lastBetsOf,
  newBaccaratState,
  removeBets,
} from "./table";
import { DEFAULT_BACCARAT_RULES } from "./rules";

const R = DEFAULT_BACCARAT_RULES;
const LIMITS = { minBet: 10, maxBet: 500 };
const NOW = new Date("2026-10-26T12:00:00Z");
/** A shoe that deals Player 4+4 (natural 8) vs Banker K+9 (natural 9), then filler. */
const SHOE: Card[] = ["4s", "Ks", "4h", "9d", ...Array<Card>(40).fill("2c")];

describe("betting", () => {
  it("adds to the same bet, enforcing the minimum on Player and Banker only", () => {
    let s = newBaccaratState(416);
    expect(() => addBet(s, R, LIMITS, "a", "banker", 5)).toThrow(/minimum/);
    s = addBet(s, R, LIMITS, "a", "banker", 10);
    s = addBet(s, R, LIMITS, "a", "banker", 15);
    s = addBet(s, R, LIMITS, "a", "playerPair", 1);
    expect(s.bets).toEqual([
      { playerId: "a", kind: "banker", amount: 25 },
      { playerId: "a", kind: "playerPair", amount: 1 },
    ]);
    expect(() => addBet(s, R, LIMITS, "a", "banker", 480)).toThrow(/maximum/);
    expect(() => addBet(s, R, LIMITS, "a", "dragon7", 5)).toThrow(IllegalBaccaratBet);
  });

  it("takes bets down and returns the chips", () => {
    let s = addBet(newBaccaratState(416), R, LIMITS, "a", "player", 20);
    s = addBet(s, R, LIMITS, "a", "tie", 5);
    s = addBet(s, R, LIMITS, "b", "banker", 30);
    const one = removeBets(s, "a", "tie");
    expect(one.refund).toBe(5);
    const all = removeBets(s, "a");
    expect(all.refund).toBe(25);
    expect(all.state.bets).toEqual([{ playerId: "b", kind: "banker", amount: 30 }]);
  });

  it("waits until everyone with a bet is ready, and a new bet un-readies you", () => {
    let s = addBet(newBaccaratState(416), R, LIMITS, "a", "player", 20);
    s = addBet(s, R, LIMITS, "b", "banker", 20);
    s = { ...s, ready: ["a"] };
    expect(allReady(s)).toBe(false);
    s = { ...s, ready: ["a", "b"] };
    expect(allReady(s)).toBe(true);
    s = addBet(s, R, LIMITS, "a", "tie", 5);
    expect(allReady(s)).toBe(false);
  });
});

describe("dealing", () => {
  it("deals, pays every bet, records the road, and clears the felt", () => {
    let s = addBet(newBaccaratState(SHOE.length), R, LIMITS, "a", "banker", 100);
    s = addBet(s, R, LIMITS, "a", "player", 20);
    s = addBet(s, R, LIMITS, "b", "playerPair", 5);
    const out = dealAndSettle(s, R, SHOE, () => SHOE, NOW);
    expect(out.hand).toMatchObject({ playerTotal: 8, bankerTotal: 9, winner: "banker", natural: true });
    expect(out.credits.get("a")).toBe(195); // 100 + 95 (5% commission); the Player bet lost
    expect(out.credits.get("b")).toBe(60); // pair of 4s pays 11:1
    expect(out.state.bets).toEqual([]);
    expect(out.state.history).toEqual([{ winner: "banker", playerPair: true, bankerPair: false, natural: true, total: 9 }]);
    expect(out.state.cardsLeft).toBe(SHOE.length - 4);
    expect(out.shoe).toHaveLength(SHOE.length - 4);
    expect(lastBetsOf(out.state, "a")).toEqual([
      { playerId: "a", kind: "banker", amount: 100 },
      { playerId: "a", kind: "player", amount: 20 },
    ]);
  });

  it("starts a fresh shoe (and a fresh scoreboard) at the cut card", () => {
    const s = { ...newBaccaratState(10), history: [{ winner: "player" as const, playerPair: false, bankerPair: false, natural: false, total: 5 }] };
    const out = dealAndSettle(s, R, SHOE.slice(0, 10), () => SHOE, NOW);
    expect(out.state.lastHand?.newShoe).toBe(true);
    expect(out.state.history).toHaveLength(1);
  });

  it("records each bettor's result for stats", () => {
    let s = addBet(newBaccaratState(SHOE.length), R, LIMITS, "a", "banker", 100);
    s = addBet(s, R, LIMITS, "a", "eitherPair", 10);
    const out = dealAndSettle(s, R, SHOE, () => SHOE, NOW);
    expect(baccaratHandStats(out.results, out.hand, "x")).toEqual([
      { player_id: "a", game: "baccarat", rules_key: "x", net: 145, counters: { banker_bets: 1, banker_wins: 1, side_bets: 1, side_wins: 1, naturals: 1 } },
    ]);
  });
});
