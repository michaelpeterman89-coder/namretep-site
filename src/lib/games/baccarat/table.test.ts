import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/games/deck";
import {
  addBet,
  allReady,
  baccaratHandStats,
  flipCards,
  IllegalBaccaratBet,
  lastBetsOf,
  newBaccaratState,
  removeBets,
  revealDone,
  settleHand,
  startReveal,
  type BaccaratState,
} from "./table";
import { DEFAULT_BACCARAT_RULES, type BaccaratRules } from "./rules";

const R = DEFAULT_BACCARAT_RULES;
const LIMITS = { minBet: 10, maxBet: 500 };
const NOW = new Date("2026-10-26T12:00:00Z");
/** A shoe that deals Player 4+4 (natural 8) vs Banker K+9 (natural 9), then filler. */
const SHOE: Card[] = ["4s", "Ks", "4h", "9d", ...Array<Card>(40).fill("2c")];

/** A whole hand: out, turned over, and settled. */
function dealAndSettle(state: BaccaratState, rules: BaccaratRules, shoe: Card[], freshShoe: () => Card[], now: Date) {
  const started = startReveal(state, shoe, freshShoe, "a", null);
  return settleHand(started.state, rules, started.shoe, now);
}

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

  it("lets a player back Player or Banker, not both, and add the Tie to either", () => {
    let s = addBet(newBaccaratState(416), R, LIMITS, "a", "banker", 20);
    expect(() => addBet(s, R, LIMITS, "a", "player", 20)).toThrow(/both Player and Banker/);
    s = addBet(s, R, LIMITS, "a", "tie", 5);
    s = addBet(s, R, LIMITS, "b", "player", 20);
    expect(s.bets.map((b) => `${b.playerId}:${b.kind}`)).toEqual(["a:banker", "a:tie", "b:player"]);
    const cleared = removeBets(s, "a").state;
    expect(addBet(cleared, R, LIMITS, "a", "player", 20).bets).toContainEqual({ playerId: "a", kind: "player", amount: 20 });
  });

  it("has no ceiling when the table has no maximum, but keeps the minimum", () => {
    const open = { minBet: 10, maxBet: null };
    const s = addBet(newBaccaratState(416), R, open, "a", "banker", 5_000_000);
    expect(addBet(s, R, open, "a", "banker", 5_000_000).bets[0].amount).toBe(10_000_000);
    expect(() => addBet(s, R, open, "b", "player", 5)).toThrow(/minimum/);
    expect(() => addBet(s, R, open, "b", "player", 1e30)).toThrow(IllegalBaccaratBet);
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

describe("turning the cards over", () => {
  // Player 2+3 (5, draws), Banker K+2 (2, draws): third cards 4 then J.
  const DRAWS: Card[] = ["2s", "Ks", "3h", "2d", "4d", "Jd", ...Array<Card>(40).fill("2c")];
  const start = (shoe: Card[] = DRAWS) => {
    const s = addBet(newBaccaratState(shoe.length), R, LIMITS, "a", "banker", 100);
    return startReveal(s, shoe, () => shoe, "a", null).state;
  };

  it("puts four cards out face down, with nothing secret in what players can see", () => {
    const s = start();
    expect(s.reveal).toMatchObject({ n: 1, flipper: "a", player: [null, null], banker: [null, null] });
    expect(s.cardsLeft).toBe(DRAWS.length - 4);
    const seen = JSON.stringify(s);
    for (const card of ["2s", "Ks", "3h", "2d", "4d", "Jd"]) expect(seen).not.toContain(`"${card}"`);
    expect(s.lastHand).toBeNull();
  });

  it("turns over whichever card is chosen, in any order", () => {
    let s = flipCards(start(), DRAWS, { side: "banker", index: 1 }, null);
    expect(s.reveal).toMatchObject({ player: [null, null], banker: [null, "2d"] });
    s = flipCards(s, DRAWS, { side: "player", index: 0 }, null);
    expect(s.reveal).toMatchObject({ player: ["2s", null], banker: [null, "2d"] });
  });

  it("ignores a card that's already up or isn't out", () => {
    const s = flipCards(start(), DRAWS, { side: "banker", index: 1 }, null);
    expect(flipCards(s, DRAWS, { side: "banker", index: 1 }, null).reveal).toEqual(s.reveal);
    expect(flipCards(s, DRAWS, { side: "player", index: 2 }, null).reveal).toEqual(s.reveal);
  });

  it("brings third cards out one at a time, face down, Player's first, with a new clock", () => {
    let s = flipCards(start(), DRAWS, "all", "soon");
    expect(s.reveal).toMatchObject({ player: ["2s", "3h", null], banker: ["Ks", "2d"], deadline: "soon" });
    expect(s.cardsLeft).toBe(DRAWS.length - 5);
    expect(JSON.stringify(s)).not.toContain('"4d"');
    expect(revealDone(s, DRAWS)).toBe(false);

    s = flipCards(s, DRAWS, { side: "player", index: 2 }, "later");
    expect(s.reveal).toMatchObject({ player: ["2s", "3h", "4d"], banker: ["Ks", "2d", null], deadline: "later" });
    expect(JSON.stringify(s)).not.toContain('"Jd"');

    s = flipCards(s, DRAWS, "all", null);
    expect(revealDone(s, DRAWS)).toBe(true);
  });

  it("stops after four cards on a natural", () => {
    const s = flipCards(start(SHOE), SHOE, "all", null);
    expect(s.reveal).toMatchObject({ player: ["4s", "4h"], banker: ["Ks", "9d"] });
    expect(revealDone(s, SHOE)).toBe(true);
  });

  it("pays nothing until the hand is settled, then pays once", () => {
    const flipped = flipCards(flipCards(start(), DRAWS, "all", null), DRAWS, "all", null);
    expect(flipped.bets).toHaveLength(1);
    const out = settleHand(flipCards(flipped, DRAWS, "all", null), R, DRAWS, NOW);
    expect(out.hand).toMatchObject({ player: ["2s", "3h", "4d"], banker: ["Ks", "2d", "Jd"], winner: "player" });
    expect(out.state.reveal).toBeNull();
    expect(out.state.bets).toEqual([]);
    expect(out.state.lastHand?.n).toBe(1);
    expect(out.state.cardsLeft).toBe(DRAWS.length - 6);
    expect(out.shoe).toHaveLength(DRAWS.length - 6);
  });

  it("settles the same hand however the cards were turned over, even if none were", () => {
    expect(settleHand(start(), R, DRAWS, NOW).hand).toEqual(
      settleHand(flipCards(start(), DRAWS, { side: "player", index: 1 }, null), R, DRAWS, NOW).hand,
    );
  });

  it("takes no bets while the cards are out", () => {
    expect(() => addBet(start(), R, LIMITS, "b", "player", 20)).toThrow(/cards are out/);
  });

  it("starts a fresh shoe at the cut card, and clears the scoreboard then", () => {
    const old = { winner: "player" as const, playerPair: false, bankerPair: false, natural: false, total: 5 };
    const s = { ...addBet(newBaccaratState(10), R, LIMITS, "a", "banker", 100), history: [old] };
    const out = startReveal(s, SHOE.slice(0, 10), () => SHOE, "a", null);
    expect(out.shoe).toEqual(SHOE);
    expect(out.state.history).toEqual([]);
    expect(out.state.reveal?.newShoe).toBe(true);
  });
});

describe("dealing", () => {
  it("deals, pays every bet, records the road, and clears the felt", () => {
    let s = addBet(newBaccaratState(SHOE.length), R, LIMITS, "a", "banker", 100);
    s = addBet(s, R, LIMITS, "c", "player", 20);
    s = addBet(s, R, LIMITS, "b", "playerPair", 5);
    const out = dealAndSettle(s, R, SHOE, () => SHOE, NOW);
    expect(out.hand).toMatchObject({ playerTotal: 8, bankerTotal: 9, winner: "banker", natural: true });
    expect(out.credits.get("a")).toBe(195); // 100 + 95 (5% commission)
    expect(out.credits.get("c")).toBeUndefined(); // the Player bet lost
    expect(out.credits.get("b")).toBe(60); // pair of 4s pays 11:1
    expect(out.state.bets).toEqual([]);
    expect(out.state.history).toEqual([{ winner: "banker", playerPair: true, bankerPair: false, natural: true, total: 9 }]);
    expect(out.state.cardsLeft).toBe(SHOE.length - 4);
    expect(out.shoe).toHaveLength(SHOE.length - 4);
    expect(lastBetsOf(out.state, "a")).toEqual([{ playerId: "a", kind: "banker", amount: 100 }]);
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
