import { describe, expect, it } from "vitest";
import type { Card, Shoe } from "./cards";
import { actionChanges, betChanges, payoutChanges } from "./chips";
import { applyAction, startRound } from "./engine";
import { DEFAULT_RULES, type BlackjackRules } from "./rules";

const rules: BlackjackRules = { ...DEFAULT_RULES, insurance: true };

function stacked(cards: Card[]): Shoe {
  return { cards: [...cards, ...Array<Card>(312 - cards.length).fill("2c")], size: 312 };
}

describe("chip changes", () => {
  it("takes the opening bet from each seat", () => {
    const round = startRound(rules, stacked(["Ts", "5h", "9d", "Th", "8c", "7c"]), [
      { playerId: "a", bet: 10 },
      { playerId: "b", bet: 20 },
    ]);
    expect(betChanges(round)).toEqual([
      { player_id: "a", amount: -10, reason: "bet" },
      { player_id: "b", amount: -20, reason: "bet" },
    ]);
  });

  it("charges for doubles, splits, and insurance but not hits or stands", () => {
    const pair = startRound(rules, stacked(["8s", "9d", "8h", "7c"]), [{ playerId: "a", bet: 100 }]);
    expect(actionChanges(pair, { type: "split", seat: 0 })).toEqual([{ player_id: "a", amount: -100, reason: "split" }]);
    expect(actionChanges(pair, { type: "double", seat: 0 })).toEqual([{ player_id: "a", amount: -100, reason: "double" }]);
    expect(actionChanges(pair, { type: "hit", seat: 0 })).toEqual([]);

    const vsAce = startRound(rules, stacked(["Ts", "Ad", "9h", "7c"]), [{ playerId: "a", bet: 100 }]);
    expect(actionChanges(vsAce, { type: "insurance", seat: 0 })).toEqual([
      { player_id: "a", amount: -50, reason: "insurance" },
    ]);
  });

  it("pays winners once settled, and nothing before", () => {
    const round = startRound(rules, stacked(["Ts", "9d", "Qh", "8c"]), [{ playerId: "a", bet: 100 }]);
    expect(payoutChanges(round)).toEqual([]);
    const settled = applyAction(rules, round, { type: "stand", seat: 0 });
    expect(payoutChanges(settled)).toEqual([{ player_id: "a", amount: 200, reason: "payout" }]);
  });

  it("skips losers", () => {
    const round = startRound(rules, stacked(["Ts", "9d", "7h", "Tc"]), [{ playerId: "a", bet: 100 }]);
    expect(payoutChanges(applyAction(rules, round, { type: "stand", seat: 0 }))).toEqual([]);
  });
});
