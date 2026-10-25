import { describe, expect, it } from "vitest";
import type { Card, Shoe } from "./cards";
import { applyAction, startRound } from "./engine";
import { DEFAULT_RULES, type BlackjackRules } from "./rules";
import { judgeDecision, roundStats } from "./stats";

const rules: BlackjackRules = { ...DEFAULT_RULES, insurance: true };

function stacked(cards: Card[]): Shoe {
  return { cards: [...cards, ...Array<Card>(312 - cards.length).fill("2c")], size: 312 };
}
const deal = (cards: Card[], bet = 100) => startRound(rules, stacked(cards), [{ playerId: "p1", bet }]);

describe("roundStats", () => {
  it("is empty until the round is settled", () => {
    expect(roundStats(rules, deal(["Ts", "9d", "6h", "8c"]))).toEqual([]);
  });

  it("records a blackjack win", () => {
    const [stat] = roundStats(rules, deal(["As", "9d", "Kh", "8c"]));
    expect(stat).toEqual({
      player_id: "p1",
      game: "blackjack",
      rules_key: "6D · S17 · 3:2 · DAS · LS",
      net: 150,
      counters: { blackjacks: 1, busts: 0, doubles: 0, splits: 0, surrenders: 0 },
    });
  });

  it("counts splits, doubles, and busts", () => {
    // 8,8 vs 6: split; first hand 8+3 doubles to 21 (8,3,T); second hand 8+K stands; dealer 6+T+9 busts.
    let round = deal(["8s", "6d", "8h", "Tc", "3d", "Ts", "Kd", "9c"]);
    round = applyAction(rules, round, { type: "split", seat: 0 });
    round = applyAction(rules, round, { type: "double", seat: 0 });
    round = applyAction(rules, round, { type: "stand", seat: 0 });
    const [stat] = roundStats(rules, round);
    expect(stat.net).toBe(300);
    expect(stat.counters).toEqual({ blackjacks: 0, busts: 0, doubles: 1, splits: 1, surrenders: 0 });

    const bust = applyAction(rules, deal(["Ts", "9d", "6h", "8c", "Kd"]), { type: "hit", seat: 0 });
    expect(roundStats(rules, bust)[0]).toMatchObject({ net: -100, counters: { busts: 1 } });
  });

  it("nets insurance into the round result", () => {
    // Insure against an ace; dealer has blackjack: -100 hand, +100 insurance profit.
    const round = applyAction(rules, deal(["Ts", "Ad", "9h", "Kc"]), { type: "insurance", seat: 0 });
    expect(roundStats(rules, round)[0].net).toBe(0);
  });
});

describe("judgeDecision", () => {
  it("marks a book play as on book", () => {
    const round = deal(["Ts", "Td", "6h", "8c"]); // hard 16 vs 10
    expect(judgeDecision(rules, round, { type: "surrender", seat: 0 }, false)).toMatchObject({
      situation_key: "H16v10",
      situation: "Hard 16 vs 10",
      action: "surrender",
      book_action: "surrender",
      on_book: true,
    });
  });

  it("marks a mistake and keeps the hints flag", () => {
    const round = deal(["Ts", "Td", "6h", "8c"]);
    expect(judgeDecision(rules, round, { type: "stand", seat: 0 }, true)).toMatchObject({
      on_book: false,
      book_action: "surrender",
      hints_enabled: true,
    });
  });

  it("judges insurance as a mistake and declining as on book", () => {
    const round = deal(["Ts", "Ad", "9h", "7c"]);
    expect(judgeDecision(rules, round, { type: "insurance", seat: 0 }, false)).toMatchObject({
      phase: "early",
      situation_key: "insurance",
      on_book: false,
    });
    expect(judgeDecision(rules, round, { type: "decline", seat: 0 }, false)?.on_book).toBe(true);
  });

  it("uses the current split hand", () => {
    let round = deal(["8s", "6d", "8h", "Tc", "3d"]);
    round = applyAction(rules, round, { type: "split", seat: 0 }); // first hand: 8,3 = hard 11 vs 6
    expect(judgeDecision(rules, round, { type: "double", seat: 0 }, false)).toMatchObject({
      situation_key: "H11v6",
      on_book: true,
    });
  });

  it("skips moves with no real choice and finished rounds", () => {
    const settled = deal(["As", "9d", "Kh", "8c"]);
    expect(judgeDecision(rules, settled, { type: "stand", seat: 0 }, false)).toBeNull();
  });
});
