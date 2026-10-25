import { describe, expect, it } from "vitest";
import { buildDecks, handValue, isBust, isTwoCard21, newShoe, shoeNeedsShuffle, type Card } from "./cards";

describe("handValue", () => {
  it.each<[Card[], number, boolean]>([
    [["Ts", "7h"], 17, false],
    [["Ac", "6d"], 17, true],
    [["Ac", "6d", "Kh"], 17, false],
    [["Ac", "Ad"], 12, true],
    [["Ac", "Ad", "9s"], 21, true],
    [["As", "Kd"], 21, true],
    [["Ac", "Ad", "Ah", "As"], 14, true],
    [["Ks", "Qd", "2h"], 22, false],
  ])("%j = %i (soft: %s)", (cards, total, soft) => {
    expect(handValue(cards)).toEqual({ total, soft });
  });

  it("knows two-card 21s and busts", () => {
    expect(isTwoCard21(["As", "Jd"])).toBe(true);
    expect(isTwoCard21(["7s", "7d", "7h"])).toBe(false);
    expect(isBust(["Ks", "Qd", "2h"])).toBe(true);
  });
});

describe("shoe", () => {
  it.each([1, 2, 4, 6, 8])("builds %i deck(s) with each card the right number of times", (decks) => {
    const cards = buildDecks(decks);
    expect(cards).toHaveLength(decks * 52);
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.size).toBe(52);
    expect([...counts.values()].every((n) => n === decks)).toBe(true);
  });

  it("shuffles a new shoe of the right size", () => {
    const shoe = newShoe(6);
    expect(shoe.size).toBe(312);
    expect([...shoe.cards].sort()).toEqual(buildDecks(6).sort());
  });

  it("needs a shuffle once the cut card is reached", () => {
    const full = buildDecks(1);
    expect(shoeNeedsShuffle({ cards: full.slice(13), size: 52 }, 0.75)).toBe(false); // 25% dealt
    expect(shoeNeedsShuffle({ cards: full.slice(39), size: 52 }, 0.75)).toBe(true); // 75% dealt
  });
});
