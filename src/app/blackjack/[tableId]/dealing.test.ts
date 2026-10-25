import { describe, expect, it } from "vitest";
import type { Card, Shoe } from "@/lib/games/blackjack/cards";
import { applyAction, publicView, startRound, type BlackjackRound } from "@/lib/games/blackjack/engine";
import { DEFAULT_RULES } from "@/lib/games/blackjack/rules";
import { computePlan, DEAL_FLIGHT_MS, DEAL_GAP_MS, FLIP_MS } from "./dealing";

const rules = { ...DEFAULT_RULES, insurance: false };

function stacked(cards: Card[]): Shoe {
  return { cards: [...cards, ...Array<Card>(312 - cards.length).fill("2c")], size: 312 };
}
const asView = (id: string, round: BlackjackRound) => ({ roundId: id, view: publicView(round) });
const order = (plan: ReturnType<typeof computePlan>) =>
  [...plan.entries.entries()].sort((a, b) => a[1].delay - b[1].delay).map(([key, e]) => `${key}@${e.delay}${e.kind === "flip" ? "↻" : ""}`);

// a: T,9   b: 5,8   dealer: 9 up, 7 hole (16)
const twoPlayer = () =>
  startRound(rules, stacked(["Ts", "5h", "9d", "9h", "8c", "7c", "Kd"]), [
    { playerId: "a", bet: 10 },
    { playerId: "b", bet: 10 },
  ]);

describe("computePlan", () => {
  it("deals a new round in table order, one card at a time", () => {
    const plan = computePlan(null, asView("r1", twoPlayer()), false);
    expect(order(plan)).toEqual([
      `p:a:0:0@0`,
      `p:b:0:0@${DEAL_GAP_MS}`,
      `d:0@${2 * DEAL_GAP_MS}`,
      `p:a:0:1@${3 * DEAL_GAP_MS}`,
      `p:b:0:1@${4 * DEAL_GAP_MS}`,
      `d:1@${5 * DEAL_GAP_MS}`,
    ]);
    expect(plan.durationMs).toBe(5 * DEAL_GAP_MS + DEAL_FLIGHT_MS);
  });

  it("animates only the new card on a hit", () => {
    // b has 13 and draws a 2: still playing, so nothing else changes.
    const round = startRound(rules, stacked(["Ts", "5h", "9d", "9h", "8c", "7c", "2d"]), [
      { playerId: "a", bet: 10 },
      { playerId: "b", bet: 10 },
    ]);
    const bTurn = applyAction(rules, round, { type: "stand", seat: 0 });
    const hit = applyAction(rules, bTurn, { type: "hit", seat: 1 });
    expect(order(computePlan(asView("r1", bTurn), asView("r1", hit), false))).toEqual(["p:b:0:2@0"]);
  });

  it("flips the hole card before the dealer draws", () => {
    const round = applyAction(rules, twoPlayer(), { type: "stand", seat: 0 });
    const settled = applyAction(rules, round, { type: "stand", seat: 1 }); // dealer 16 draws the K
    const plan = computePlan(asView("r1", round), asView("r1", settled), false);
    expect(order(plan)).toEqual(["d:1@0↻", `d:2@${FLIP_MS}`]);
    expect(plan.durationMs).toBe(FLIP_MS + DEAL_FLIGHT_MS);
  });

  it("moves the split card instead of dealing it, then deals the new one", () => {
    const pair = startRound(rules, stacked(["8s", "9d", "8h", "7c", "3d"]), [{ playerId: "a", bet: 10 }]);
    const split = applyAction(rules, pair, { type: "split", seat: 0 });
    expect(order(computePlan(asView("r1", pair), asView("r1", split), false))).toEqual(["p:a:0:1@0"]);
  });

  it("does nothing when nothing changed, or for reduced motion", () => {
    const round = asView("r1", twoPlayer());
    expect(computePlan(round, round, false).entries.size).toBe(0);
    expect(computePlan(null, round, true).durationMs).toBe(0);
  });
});
