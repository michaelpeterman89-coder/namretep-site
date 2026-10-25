import { describe, expect, it } from "vitest";
import { cardValue, type Card } from "./cards";
import type { ActionType } from "./engine";
import { DEFAULT_RULES, type BlackjackRules } from "./rules";
import { bookDecision, strategyChart } from "./strategy";

// Expected plays come from widely published basic-strategy charts.

const rules = (overrides: Partial<BlackjackRules> = {}): BlackjackRules => ({ ...DEFAULT_RULES, ...overrides });

/** 6 decks, S17, DAS, late surrender, dealer peeks: the classic multi-deck chart. */
const SHOE = rules();
const SHOE_H17 = rules({ dealerHitsSoft17: true });
const SHOE_NO_DAS = rules({ doubleAfterSplit: false, surrender: "none" });
const SINGLE_DECK_H17 = rules({ decks: 1, dealerHitsSoft17: true, doubleAfterSplit: false, surrender: "none" });
const DOUBLE_DECK = rules({ decks: 2, surrender: "none" });
const EURO = rules({ dealerPeeks: false, surrender: "none" });

const UP: Record<string, Card> = { A: "Ac", "2": "2c", "3": "3c", "4": "4c", "5": "5c", "6": "6c", "7": "7c", "8": "8c", "9": "9c", "10": "Tc" };

/** Book play for a two-card hand where everything the rules allow is legal. */
function book(r: BlackjackRules, cards: Card[], up: string, legalOverride?: ActionType[]) {
  const legal: ActionType[] = legalOverride ?? ["hit", "stand"];
  if (!legalOverride) {
    if (cards.length === 2) legal.push("double");
    if (cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1])) legal.push("split");
    if (cards.length === 2 && r.surrender !== "none") legal.push("surrender");
  }
  return bookDecision(r, { phase: "playing", cards, dealerUpcard: UP[up], legal })!.action;
}

type Case = [label: string, cards: Card[], up: string, expected: ActionType];

function check(r: BlackjackRules, cases: Case[]) {
  it.each(cases)("%s vs %s → %s", (_label, cards, up, expected) => {
    expect(book(r, cards, up)).toBe(expected);
  });
}

describe("6 decks, S17, DAS, late surrender", () => {
  describe("hard totals", () => {
    check(SHOE, [
      ["8", ["5s", "3h"], "6", "hit"],
      ["9", ["5s", "4h"], "2", "hit"],
      ["9", ["5s", "4h"], "3", "double"],
      ["9", ["5s", "4h"], "6", "double"],
      ["9", ["5s", "4h"], "7", "hit"],
      ["10", ["6s", "4h"], "9", "double"],
      ["10", ["6s", "4h"], "10", "hit"],
      ["11", ["6s", "5h"], "10", "double"],
      ["11", ["6s", "5h"], "A", "hit"],
      ["12", ["Ts", "2h"], "3", "hit"],
      ["12", ["Ts", "2h"], "4", "stand"],
      ["12", ["Ts", "2h"], "6", "stand"],
      ["12", ["Ts", "2h"], "7", "hit"],
      ["13", ["Ts", "3h"], "2", "stand"],
      ["15", ["Ts", "5h"], "10", "surrender"],
      ["15", ["Ts", "5h"], "9", "hit"],
      ["16", ["Ts", "6h"], "6", "stand"],
      ["16", ["Ts", "6h"], "7", "hit"],
      ["16", ["Ts", "6h"], "9", "surrender"],
      ["16", ["Ts", "6h"], "10", "surrender"],
      ["16", ["Ts", "6h"], "A", "surrender"],
      ["17", ["Ts", "7h"], "A", "stand"],
    ]);
  });

  describe("soft totals", () => {
    check(SHOE, [
      ["A,2", ["As", "2h"], "4", "hit"],
      ["A,2", ["As", "2h"], "5", "double"],
      ["A,4", ["As", "4h"], "4", "double"],
      ["A,6", ["As", "6h"], "2", "hit"],
      ["A,6", ["As", "6h"], "3", "double"],
      ["A,7", ["As", "7h"], "2", "stand"],
      ["A,7", ["As", "7h"], "4", "double"],
      ["A,7", ["As", "7h"], "8", "stand"],
      ["A,7", ["As", "7h"], "9", "hit"],
      ["A,8", ["As", "8h"], "6", "stand"],
      ["A,9", ["As", "9h"], "6", "stand"],
    ]);
  });

  describe("pairs", () => {
    check(SHOE, [
      ["A,A", ["As", "Ah"], "A", "split"],
      ["8,8", ["8s", "8h"], "10", "split"],
      ["T,T", ["Ts", "Kh"], "6", "stand"],
      ["9,9", ["9s", "9h"], "7", "stand"],
      ["9,9", ["9s", "9h"], "8", "split"],
      ["9,9", ["9s", "9h"], "A", "stand"],
      ["7,7", ["7s", "7h"], "7", "split"],
      ["7,7", ["7s", "7h"], "8", "hit"],
      ["6,6", ["6s", "6h"], "2", "split"],
      ["6,6", ["6s", "6h"], "7", "hit"],
      ["5,5", ["5s", "5h"], "9", "double"],
      ["5,5", ["5s", "5h"], "10", "hit"],
      ["4,4", ["4s", "4h"], "4", "hit"],
      ["4,4", ["4s", "4h"], "5", "split"],
      ["3,3", ["3s", "3h"], "7", "split"],
      ["2,2", ["2s", "2h"], "2", "split"],
      ["2,2", ["2s", "2h"], "8", "hit"],
    ]);
  });

  it("uses the next-best legal play when the best isn't allowed", () => {
    // Surrender isn't available on a three-card 16: hit.
    expect(book(SHOE, ["7s", "4h", "5d"], "10")).toBe("hit");
    // Can't double a three-card 11: hit. Can't double soft 18 vs 4 after hitting: stand.
    expect(book(SHOE, ["2s", "4h", "5d"], "6")).toBe("hit");
    expect(book(SHOE, ["As", "2h", "5d"], "4")).toBe("stand");
  });

  it("stands on 21 and returns nothing when there's no choice", () => {
    expect(book(SHOE, ["7s", "4h", "Td"], "10", ["hit", "stand"])).toBe("stand");
    expect(bookDecision(SHOE, { phase: "playing", cards: ["As", "5h"], dealerUpcard: "Tc", legal: ["stand"] })).toBeNull();
  });
});

describe("H17 changes", () => {
  check(SHOE_H17, [
    ["11", ["6s", "5h"], "A", "double"],
    ["15", ["Ts", "5h"], "A", "surrender"],
    ["17", ["Ts", "7h"], "A", "surrender"],
    ["A,7", ["As", "7h"], "2", "double"],
    ["A,8", ["As", "8h"], "6", "double"],
  ]);
});

describe("no double after split", () => {
  check(SHOE_NO_DAS, [
    ["2,2", ["2s", "2h"], "2", "hit"],
    ["2,2", ["2s", "2h"], "4", "split"],
    ["4,4", ["4s", "4h"], "5", "hit"],
    ["6,6", ["6s", "6h"], "2", "hit"],
    ["6,6", ["6s", "6h"], "3", "split"],
  ]);
});

describe("single and double deck", () => {
  check(SINGLE_DECK_H17, [
    ["11", ["6s", "5h"], "A", "double"],
    ["9", ["5s", "4h"], "2", "double"],
    ["8", ["5s", "3h"], "5", "double"],
    ["A,8", ["As", "8h"], "6", "double"],
  ]);
  check(DOUBLE_DECK, [["9", ["5s", "4h"], "2", "double"]]);
});

describe("European no-hole-card", () => {
  check(EURO, [
    ["11", ["6s", "5h"], "10", "hit"],
    ["11", ["6s", "5h"], "A", "hit"],
    ["10", ["6s", "4h"], "9", "double"],
    ["8,8", ["8s", "8h"], "6", "split"],
  ]);
});

describe("early phase", () => {
  it("never takes insurance or even money", () => {
    const insurance = bookDecision(SHOE, { phase: "early", cards: ["Ts", "9h"], dealerUpcard: "Ac", legal: ["insurance", "decline"] });
    expect(insurance).toMatchObject({ action: "decline", key: "insurance" });
    const evenMoney = bookDecision(SHOE, { phase: "early", cards: ["As", "Kh"], dealerUpcard: "Ac", legal: ["insurance", "decline"] });
    expect(evenMoney).toMatchObject({ action: "decline", key: "even-money" });
  });

  const ES = rules({ surrender: "early" });
  const early = (cards: Card[], up: string) =>
    bookDecision(ES, { phase: "early", cards, dealerUpcard: UP[up], legal: ["surrender", "decline"] })!.action;

  it.each<[Card[], string, ActionType]>([
    [["Ts", "6h"], "10", "surrender"],
    [["Ts", "4h"], "10", "surrender"],
    [["Ts", "3h"], "10", "decline"],
    [["5s", "2h"], "A", "surrender"],
    [["Ts", "3h"], "A", "surrender"],
    [["6s", "5h"], "A", "decline"],
    [["Ts", "Kh"], "A", "decline"],
  ])("early surrender: %j vs %s → %s", (cards, up, expected) => {
    expect(early(cards, up)).toBe(expected);
  });
});

describe("decision labels", () => {
  it("names the situation", () => {
    const d = (cards: Card[], up: string) =>
      bookDecision(SHOE, { phase: "playing", cards, dealerUpcard: UP[up], legal: ["hit", "stand", "split"] })!;
    expect(d(["Ts", "6h"], "10")).toMatchObject({ key: "H16v10", situation: "Hard 16 vs 10" });
    expect(d(["As", "7h"], "9")).toMatchObject({ key: "S18v9", situation: "Soft 18 vs 9" });
    expect(d(["8s", "8h"], "A")).toMatchObject({ key: "P8v1", situation: "Pair of 8s vs A" });
  });
});

describe("performance", () => {
  it("builds a fresh chart quickly", () => {
    const start = performance.now();
    strategyChart(rules({ decks: 8, dealerHitsSoft17: true, doubleOn: "10-11" }));
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
