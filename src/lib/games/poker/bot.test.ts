import { describe, expect, it } from "vitest";
import { buildDecks, type Card } from "@/lib/games/deck";
import { seededRandom } from "@/lib/random";
import { botDecision, chenScore, estimateEquity } from "./bot";
import { applyAction, publicHand, startHand, type PokerConfig, type PokerHand } from "./engine";

const NL: PokerConfig = { variant: "holdem", structure: "no-limit", smallBlind: 5, bigBlind: 10, ante: 0 };
const players = (...stacks: number[]) => stacks.map((stack, i) => ({ playerId: `p${i}`, stack }));
const cards = (s: string) => s.split(/\s+/).filter(Boolean) as Card[];
function stacked(...groups: string[]): Card[] {
  const first = cards(groups.join(" "));
  return [...first, ...buildDecks(1).filter((c) => !first.includes(c))];
}
/** The bot's move for whoever's turn it is, from its own point of view. */
const decide = (h: PokerHand, seed = 1) =>
  botDecision(publicHand(h, h.seats[h.toAct!].playerId), h.toAct!, seededRandom(seed));

describe("chenScore", () => {
  it.each<[string, number]>([
    ["As Ad", 20],
    ["Ks Kd", 16],
    ["As Ks", 12],
    ["As Kd", 10],
    ["Js Ts", 9],
    ["5s 5d", 5],
    ["2s 2d", 5],
    ["7s 2d", -1],
  ])("%s scores %i", (hand, expected) => {
    const [a, b] = cards(hand);
    expect(chenScore(a, b)).toBe(expected);
  });
});

describe("estimateEquity", () => {
  it("is close to the known odds", () => {
    const rng = seededRandom(42);
    // Aces win about 85% of the time against one random hand before the flop.
    expect(estimateEquity(cards("As Ad"), [], 1, rng, 2000)).toBeGreaterThan(0.8);
    expect(estimateEquity(cards("As Ad"), [], 1, rng, 2000)).toBeLessThan(0.9);
    // 7-2 offsuit wins about 35%.
    const trash = estimateEquity(cards("7s 2d"), [], 1, rng, 2000);
    expect(trash).toBeGreaterThan(0.29);
    expect(trash).toBeLessThan(0.41);
    // The nuts on the river can't lose.
    expect(estimateEquity(cards("As Ks"), cards("Qs Js Ts 2d 3c"), 3, rng, 200)).toBe(1);
  });
});

describe("botDecision", () => {
  it("raises with aces and folds trash to a raise", () => {
    // Button p0, small blind p1, big blind p2. Deal order: p1, p2, p0, p1, p2, p0.
    const aces = startHand(NL, players(1000, 1000, 1000), 0, { deck: stacked("7s 9c As 2d 9d Ad") });
    expect(decide(aces)).toMatchObject({ type: "raise", seat: 0 });

    const trash = startHand(NL, players(1000, 1000, 1000), 0, { deck: stacked("7s 9c As 2d 9d Ad") });
    const facingRaise = applyAction(trash, { type: "raise", seat: 0, amount: 40 });
    expect(decide(facingRaise)).toEqual({ type: "fold", seat: 1 }); // 7-2 offsuit
  });

  it("doesn't fold the nuts and does fold air to a big river bet", () => {
    // Heads-up, button p0. p0: As Ks (nut flush draw -> royal), p1: 2c 3d (nothing).
    // Board: Qs Js Ts on the flop gives p0 a royal flush. Check it down to the river.
    const deck = stacked("2c As 3d Ks", "8h Qs Js Ts", "8c 7h", "8d 4d");
    let r = startHand(NL, players(1000, 1000), 0, { deck });
    r = applyAction(r, { type: "call", seat: 0 });
    r = applyAction(r, { type: "check", seat: 1 });
    for (let street = 0; street < 2; street++) {
      r = applyAction(r, { type: "check", seat: 1 });
      r = applyAction(r, { type: "check", seat: 0 });
    }
    expect(r.street).toBe("river");
    const bet = applyAction(r, { type: "raise", seat: 1, amount: 20 }); // p1 bluffs
    expect(decide(bet).type).not.toBe("fold"); // royal flush never folds

    const holder = applyAction(r, { type: "check", seat: 1 });
    const shove = applyAction(holder, { type: "raise", seat: 0, amount: 980 }); // royal shoves
    const answers = Array.from({ length: 20 }, (_, seed) => decide(shove, seed).type);
    expect(answers.every((a) => a === "fold")).toBe(true); // 2-3 with nothing folds every time
  });

  it("can't see other players' cards", () => {
    // Two deals identical except for the opponent's hole cards.
    const a = startHand(NL, players(1000, 1000, 1000), 0, { deck: stacked("Kc Qh 9s 4d 2h 9d") });
    const b = startHand(NL, players(1000, 1000, 1000), 0, { deck: stacked("Ac Ah 9s Ad As 9d") });
    // p0 holds 9s 9d in both; the bot's view and decision must be the same.
    expect(publicHand(a, "p0").seats[1].hole).toEqual([]);
    for (let seed = 0; seed < 10; seed++) expect(decide(a, seed)).toEqual(decide(b, seed));
  });

  it("only ever makes legal moves, and bot-only games always finish", () => {
    const rng = seededRandom(7);
    for (let n = 0; n < 300; n++) {
      const count = 2 + Math.floor(rng() * 8);
      const stacks = Array.from({ length: count }, () => 50 + Math.floor(rng() * 1500));
      let h = startHand(NL, players(...stacks), Math.floor(rng() * count));
      for (let steps = 0; h.phase !== "complete"; steps++) {
        expect(steps).toBeLessThan(400);
        h = applyAction(h, decide(h, n * 1000 + steps)); // throws if a bot ever picks an illegal move
      }
      expect(h.seats.reduce((s, x) => s + x.stack, 0)).toBe(stacks.reduce((a, b) => a + b, 0));
    }
  }, 120_000);
});
