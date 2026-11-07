import { describe, expect, it } from "vitest";
import { cardValue, type Card } from "./cards";
import { legalActions, startRound, type ActionType } from "./engine";
import { DEFAULT_RULES, EURO_NO_HOLE_CARD_RULES, SINGLE_DECK_RULES, TOURIST_TRAP_RULES, type BlackjackRules } from "./rules";
import { bookChartEntry, bookDecision, strategyChart, type RowKey } from "./strategy";

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

describe("printed book charts", () => {
  it("shows the published plays and what to do if they aren't available", () => {
    expect(bookChartEntry(SHOE, "H16", 10)).toEqual({ play: "surrender", otherwise: "hit" });
    expect(bookChartEntry(SHOE, "H11", 1).play).toBe("hit");
    expect(bookChartEntry(SHOE, "S18", 2).play).toBe("stand");
    expect(bookChartEntry(SHOE, "S18", 3)).toEqual({ play: "double", otherwise: "stand" });
    expect(bookChartEntry(SHOE, "H10", 9)).toEqual({ play: "double", otherwise: "hit" });
    expect(bookChartEntry(SHOE, "P8", 1)).toEqual({ play: "split", otherwise: null });
    expect(bookChartEntry(SHOE, "P9", 7).play).toBe("stand");

    expect(bookChartEntry(SHOE_H17, "H11", 1)).toEqual({ play: "double", otherwise: "hit" });
    expect(bookChartEntry(SHOE_H17, "S18", 2)).toEqual({ play: "double", otherwise: "stand" });
    expect(bookChartEntry(SHOE_H17, "H17", 1)).toEqual({ play: "surrender", otherwise: "stand" });
    expect(bookChartEntry(SHOE_H17, "P8", 1)).toEqual({ play: "surrender", otherwise: "split" });
  });

  it("only doubles where the table allows it", () => {
    const tens = rules({ doubleOn: "10-11" });
    expect(bookChartEntry(tens, "H9", 5).play).toBe("hit");
    expect(bookChartEntry(tens, "S18", 5).play).toBe("stand");
    expect(bookChartEntry(tens, "P5", 5).play).toBe("double");
  });

  /** A real round with this hand, so the legal plays come from the engine. */
  function chartMatchesTable(r: BlackjackRules, row: RowKey, cards: Card[], up: number, canSplit: boolean) {
    const table = { ...r, insurance: false };
    const upcard = up === 1 ? "Ac" : up === 10 ? "Tc" : (`${up}c` as Card);
    const size = r.decks * 52;
    const shoe = { cards: [cards[0], upcard, cards[1], "5c" as Card, ...Array<Card>(size - 4).fill("2c")], size };
    const round = startRound(table, shoe, [{ playerId: "p", bet: 10 }]);
    const legal = legalActions(table, round, 0).filter((a) => canSplit || a !== "split");
    const decision = bookDecision(table, { phase: "playing", cards, dealerUpcard: upcard, legal });
    expect(`${row} vs ${up}: ${bookChartEntry(table, row, up).play}`).toBe(`${row} vs ${up}: ${decision?.action}`);
  }

  const card = (value: number, suit: string) => `${value === 1 ? "A" : value === 10 ? "T" : value}${suit}` as Card;

  it.each([
    ["6 decks S17", SHOE],
    ["6 decks H17", SHOE_H17],
    ["8 decks", TOURIST_TRAP_RULES],
    ["2 decks", rules({ decks: 2, dealerHitsSoft17: true, surrender: "none" })],
    ["single deck", SINGLE_DECK_RULES],
    ["European", EURO_NO_HOLE_CARD_RULES],
  ])("agrees with the book the table scores you against: %s", (_name, r) => {
    for (let up = 1; up <= 10; up++) {
      for (let t = 5; t <= 20; t++) {
        const first = t === 20 ? 10 : t > 12 ? t - 10 : t - 2;
        const second = t === 20 ? 10 : t > 12 ? 10 : 2;
        chartMatchesTable(r, `H${t}`, [card(first, "s"), card(second, "h")], up, false);
      }
      for (let t = 13; t <= 20; t++) chartMatchesTable(r, `S${t}`, [card(1, "s"), card(t - 11, "h")], up, false);
      for (let n = 1; n <= 10; n++) chartMatchesTable(r, `P${n}`, [card(n, "s"), card(n, "h")], up, true);
    }
  });
});
