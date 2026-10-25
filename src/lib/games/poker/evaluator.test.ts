import { describe, expect, it } from "vitest";
import { buildDecks, type Card } from "@/lib/games/deck";
import { bestHand, categoryOf, CATEGORIES, describe as name, scoreFive } from "./evaluator";

const hand = (s: string) => s.split(" ") as Card[];
const score = (s: string) => scoreFive(hand(s));

describe("scoreFive", () => {
  it("ranks every category in order", () => {
    const ordered = [
      "2h 5c 9d Js Kh", // high card
      "2h 2c 9d Js Kh", // pair
      "2h 2c 9d 9s Kh", // two pair
      "2h 2c 2d Js Kh", // trips
      "5h 6c 7d 8s 9h", // straight
      "2h 5h 9h Jh Kh", // flush
      "2h 2c 2d Ks Kh", // full house
      "2h 2c 2d 2s Kh", // quads
      "5h 6h 7h 8h 9h", // straight flush
    ].map(score);
    expect([...ordered].sort((a, b) => a - b)).toEqual(ordered);
    expect(ordered.map(categoryOf)).toEqual([...CATEGORIES]);
  });

  it("breaks ties with kickers", () => {
    expect(score("Ah Ac Kd 7s 3h")).toBeGreaterThan(score("Ah Ac Qd 7s 3h"));
    expect(score("Ah Ac Kd 7s 4h")).toBeGreaterThan(score("Ah Ac Kd 7s 3h"));
    expect(score("Kh Kc 7d 7s 2h")).toBeGreaterThan(score("Qh Qc Jd Js Ah")); // higher top pair wins
    expect(score("Kh Kc 7d 7s 3h")).toBeGreaterThan(score("Kh Kc 7d 7s 2h")); // fifth card kicker
    expect(score("3h 3c 3d 2s 2h")).toBeGreaterThan(score("2h 2c 2d As Ah")); // trips decide a full house
  });

  it("treats suits as equal", () => {
    expect(score("Ah Kc 9d 7s 3h")).toBe(score("As Kd 9c 7h 3c"));
  });

  it("knows the wheel is the lowest straight", () => {
    const wheel = score("Ah 2c 3d 4s 5h");
    expect(categoryOf(wheel)).toBe("Straight");
    expect(wheel).toBeLessThan(score("2h 3c 4d 5s 6h"));
    expect(score("Ah Kc Qd Js Th")).toBeGreaterThan(score("Kh Qc Jd Ts 9h"));
    expect(categoryOf(score("Kh Ac 2d 3s 4h"))).toBe("High Card"); // no wrap-around
  });

  it("matches the known count of every five-card hand", () => {
    const deck = buildDecks(1);
    const counts = new Map<string, number>();
    const distinct = new Set<number>();
    const five: Card[] = [];
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              five[0] = deck[a];
              five[1] = deck[b];
              five[2] = deck[c];
              five[3] = deck[d];
              five[4] = deck[e];
              const s = scoreFive(five);
              distinct.add(s);
              const cat = categoryOf(s);
              counts.set(cat, (counts.get(cat) ?? 0) + 1);
            }
    expect(Object.fromEntries(counts)).toEqual({
      "High Card": 1_302_540,
      Pair: 1_098_240,
      "Two Pair": 123_552,
      "Three of a Kind": 54_912,
      Straight: 10_200,
      Flush: 5_108,
      "Full House": 3_744,
      "Four of a Kind": 624,
      "Straight Flush": 40,
    });
    // The famous number of genuinely different five-card poker hands.
    expect(distinct.size).toBe(7_462);
  }, 120_000);
});

describe("bestHand", () => {
  it("finds the best five of seven for Hold'em", () => {
    const best = bestHand(hand("Ah Kh"), hand("Qh Jh Th 2c 2d"));
    expect(best.description).toBe("Royal Flush");
    const boardPlays = bestHand(hand("2s 3c"), hand("Ah Kh Qh Jh Th"));
    expect(boardPlays.description).toBe("Royal Flush");
  });

  it("makes Omaha use exactly two hole cards and three from the board", () => {
    // Four hearts on board plus one heart in hand is NOT a flush in Omaha.
    const omaha = bestHand(hand("Ah 2c 7d 9s"), hand("Kh Qh Jh 3h 4c"), "omaha");
    expect(omaha.category).not.toBe("Flush");
    expect(bestHand(hand("Ah 2c 7d 9s"), hand("Kh Qh Jh 3h 4c"), "best-five").category).toBe("Flush");
    // Two hearts in hand plus three on board is.
    expect(bestHand(hand("Ah 2h 7d 9s"), hand("Kh Qh Jh 3c 4c"), "omaha").category).toBe("Flush");
  });

  it("names hands in plain English", () => {
    expect(name(score("Kh Kc Kd 7s 7h"))).toBe("Full House, Kings full of Sevens");
    expect(name(score("6h 6c 2d 2s Ah"))).toBe("Two Pair, Sixes and Twos");
    expect(name(score("Ah 2c 3d 4s 5h"))).toBe("Straight, Five high");
    expect(name(score("Qh Qc 9d 4s 2h"))).toBe("Pair of Queens");
    expect(name(score("Kh Jc 9d 4s 2h"))).toBe("High Card, King");
  });
});
