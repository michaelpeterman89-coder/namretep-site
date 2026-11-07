import { describe, expect, it } from "vitest";
import { applyAction, publicHand, showCards, startHand } from "./engine";
import { DEFAULT_POKER_RULES, engineConfig } from "./table-rules";

const start = () =>
  startHand(
    engineConfig(DEFAULT_POKER_RULES),
    [
      { playerId: "a", stack: 1000 },
      { playerId: "b", stack: 1000 },
    ],
    0,
  );

/** Whoever acts first folds, so the other wins without a showdown. */
function foldedHand() {
  const hand = start();
  const seat = hand.toAct!;
  return { hand: applyAction(hand, { type: "fold", seat }), folder: seat, winner: seat === 0 ? 1 : 0 };
}

describe("showing cards after the hand", () => {
  it("keeps cards hidden unless the player chooses to show them", () => {
    const { hand, folder, winner } = foldedHand();
    expect(hand.phase).toBe("complete");
    expect(publicHand(hand, null).seats[folder].hole).toEqual([]);
    expect(publicHand(hand, null).seats[winner].hole).toEqual([]);
  });

  it("lets a player who folded show", () => {
    const { hand, folder } = foldedHand();
    const shown = publicHand(showCards(hand, folder), null);
    expect(shown.seats[folder].hole).toEqual(hand.seats[folder].hole);
  });

  it("lets a winner who wasn't called show, without showing anyone else", () => {
    const { hand, folder, winner } = foldedHand();
    const shown = publicHand(showCards(hand, winner), null);
    expect(shown.seats[winner].hole).toHaveLength(2);
    expect(shown.seats[folder].hole).toEqual([]);
  });

  it("doesn't change who won or the chips", () => {
    const { hand, winner } = foldedHand();
    const shown = showCards(hand, winner);
    expect(shown.result?.payouts).toEqual(hand.result?.payouts);
    expect(shown.seats.map((s) => s.stack)).toEqual(hand.seats.map((s) => s.stack));
  });

  it("can't happen before the hand is over, or for someone not in it", () => {
    expect(() => showCards(start(), 0)).toThrow(/once the hand is over/);
    expect(() => showCards(foldedHand().hand, 5)).toThrow(/dealt/);
  });

  it("does nothing the second time", () => {
    const { hand, winner } = foldedHand();
    const once = showCards(hand, winner);
    expect(showCards(once, winner)).toBe(once);
  });

  it("can't show a hand an admin called off, which has no result", () => {
    const hand = { ...start(), phase: "complete" as const, toAct: null };
    expect(() => showCards(hand, 0)).toThrow(/once the hand is over/);
  });
});
