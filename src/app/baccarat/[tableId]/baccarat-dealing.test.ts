import { describe, expect, it } from "vitest";
import { advanceTracker, bankerSlot, FLIP_MS, playerSlot, startTracker, THIRD_FLIP_MS, type Felt } from "./baccarat-dealing";

const felt = (player: Felt["player"], banker: Felt["banker"], n = 1): Felt => ({ n, player, banker });
const DOWN = felt([null, null], [null, null]);
const T = 1_000_000;

describe("the baccarat hand on screen", () => {
  it("shows a hand already on the table without animating it, and holds nothing back", () => {
    const t = startTracker(felt(["2s", "3h"], ["Ks", "9d"]));
    expect(t.entries.size).toBe(0);
    expect(t.resultAt).toBeNull();
    expect(t.readableAt.get(playerSlot(0))).toBe(0);
  });

  it("deals a new hand in order, Player, Banker, Player, Banker", () => {
    const t = advanceTracker(startTracker(null), DOWN, false, T, false);
    const order = [...t.entries].sort((a, b) => a[1].delay - b[1].delay).map(([slot]) => slot);
    expect(order).toEqual([playerSlot(0), bankerSlot(0), playerSlot(1), bankerSlot(1)]);
    expect(t.readableAt.size).toBe(0);
    expect(t.resultAt).toBeNull();
  });

  it("doesn't count a card until it has finished turning over", () => {
    const dealt = advanceTracker(startTracker(null), DOWN, false, T, false);
    const later = dealt.busyUntil + 100;
    const t = advanceTracker(dealt, felt(["2s", null], [null, null]), false, later, false);
    expect(t.entries.get(playerSlot(0))).toMatchObject({ kind: "flip", flipMs: FLIP_MS });
    expect(t.readableAt.get(playerSlot(0))).toBe(later + FLIP_MS);
  });

  it("staggers cards turned over together", () => {
    const dealt = advanceTracker(startTracker(null), DOWN, false, T, false);
    const later = dealt.busyUntil + 100;
    const t = advanceTracker(dealt, felt(["2s", "3h"], ["Ks", "2d"]), false, later, false);
    const delays = [...t.entries].filter(([, e]) => e.kind === "flip").map(([, e]) => e.delay);
    expect(new Set(delays).size).toBe(4);
  });

  it("brings a third card out after the flips finish, and turns it over more slowly", () => {
    const dealt = advanceTracker(startTracker(null), DOWN, false, T, false);
    const later = dealt.busyUntil + 100;
    const flipped = advanceTracker(dealt, felt(["2s", "3h", null], ["Ks", "2d"]), false, later, false);
    const third = flipped.entries.get(playerSlot(2))!;
    expect(third.kind).toBe("deal");
    expect(later + third.delay).toBeGreaterThanOrEqual(flipped.readableAt.get(bankerSlot(1))!);

    const after = flipped.busyUntil + 100;
    const t = advanceTracker(flipped, felt(["2s", "3h", "4d"], ["Ks", "2d"]), false, after, false);
    expect(t.entries.get(playerSlot(2))).toMatchObject({ kind: "flip", flipMs: THIRD_FLIP_MS });
    expect(t.thirdFlips).toBe(1);
  });

  it("holds the result until the last card has turned", () => {
    const dealt = advanceTracker(startTracker(null), DOWN, false, T, false);
    const later = dealt.busyUntil + 100;
    const t = advanceTracker(dealt, felt(["4s", "4h"], ["Ks", "9d"]), true, later, false);
    expect(t.resultAt).toBeGreaterThan(t.readableAt.get(bankerSlot(1))!);
    // More updates about the same settled hand don't push the result back.
    expect(advanceTracker(t, felt(["4s", "4h"], ["Ks", "9d"]), true, later + 500, false).resultAt).toBe(t.resultAt);
  });

  it("handles a client that only catches up once the hand is over", () => {
    const t = advanceTracker(startTracker(null), felt(["2s", "3h", "4d"], ["Ks", "2d", "Jd"]), true, T, false);
    expect(t.out).toHaveLength(6);
    expect(t.resultAt).toBeGreaterThan(T);
    expect([...t.entries.values()].every((e) => e.kind === "deal")).toBe(true);
  });

  it("skips the animation and the wait with reduced motion", () => {
    const dealt = advanceTracker(startTracker(null), DOWN, false, T, true);
    expect(dealt.entries.size).toBe(0);
    const t = advanceTracker(dealt, felt(["4s", "4h"], ["Ks", "9d"]), true, T + 5, true);
    expect(t.entries.size).toBe(0);
    expect(t.resultAt).toBe(T + 5);
    expect(t.readableAt.get(playerSlot(0))).toBe(T + 5);
  });
});
