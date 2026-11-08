import { describe, expect, it } from "vitest";
import { DEAL_GAP_MS, FLIP_MS } from "@/components/card-table/dealing";
import { buildDecks, type Card } from "@/lib/games/deck";
import { applyAction, publicHand, startHand, type PokerConfig, type PokerHand } from "@/lib/games/poker";
import { computePokerPlan } from "./poker-dealing";

const NL: PokerConfig = { variant: "holdem", structure: "no-limit", smallBlind: 5, bigBlind: 10, ante: 0 };
const deck = buildDecks(1) as Card[];
const asView = (id: string, h: PokerHand, viewer: string) => ({ id, view: publicHand(h, viewer) });
const order = (plan: ReturnType<typeof computePokerPlan>) =>
  [...plan.entries.entries()].sort((a, b) => a[1].delay - b[1].delay).map(([k, e]) => `${k}@${e.delay}${e.kind === "flip" ? "↻" : ""}`);

describe("computePokerPlan", () => {
  it("deals a new hand around the table starting left of the button", () => {
    const h = startHand(NL, [{ playerId: "a", stack: 500 }, { playerId: "b", stack: 500 }, { playerId: "c", stack: 500 }], 0, { deck });
    expect(order(computePokerPlan(null, asView("h1", h, "a"), false))).toEqual([
      "h:b:0@0",
      `h:c:0@${DEAL_GAP_MS}`,
      `h:a:0@${2 * DEAL_GAP_MS}`,
      `h:b:1@${3 * DEAL_GAP_MS}`,
      `h:c:1@${4 * DEAL_GAP_MS}`,
      `h:a:1@${5 * DEAL_GAP_MS}`,
    ]);
  });

  it("deals the flop one card after another", () => {
    let h = startHand(NL, [{ playerId: "a", stack: 500 }, { playerId: "b", stack: 500 }], 0, { deck });
    const before = asView("h1", h, "a");
    h = applyAction(applyAction(h, { type: "call", seat: 0 }), { type: "check", seat: 1 });
    expect(order(computePokerPlan(before, asView("h1", h, "a"), false))).toEqual([
      "b:0@0",
      `b:1@${DEAL_GAP_MS}`,
      `b:2@${2 * DEAL_GAP_MS}`,
    ]);
  });

  it("flips opponents' cards together at showdown", () => {
    let h = startHand(NL, [{ playerId: "a", stack: 500 }, { playerId: "b", stack: 500 }], 0, { deck });
    h = applyAction(applyAction(h, { type: "call", seat: 0 }), { type: "check", seat: 1 });
    for (let i = 0; i < 2; i++) h = applyAction(applyAction(h, { type: "check", seat: 1 }), { type: "check", seat: 0 });
    const river = asView("h1", h, "a");
    h = applyAction(applyAction(h, { type: "check", seat: 1 }), { type: "check", seat: 0 });
    const plan = computePokerPlan(river, asView("h1", h, "a"), false);
    expect(order(plan)).toEqual(["h:b:0@0↻", "h:b:1@0↻"]);
    expect(plan.durationMs).toBe(FLIP_MS);
  });

  it("does nothing for reduced motion", () => {
    const h = startHand(NL, [{ playerId: "a", stack: 500 }, { playerId: "b", stack: 500 }], 0, { deck });
    expect(computePokerPlan(null, asView("h1", h, "a"), true).entries.size).toBe(0);
  });
});
