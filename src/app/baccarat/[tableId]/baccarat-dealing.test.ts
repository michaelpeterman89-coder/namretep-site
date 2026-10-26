import { describe, expect, it } from "vitest";
import { baccaratTimeline, bankerSlot, playerSlot } from "./baccarat-dealing";

describe("baccaratTimeline", () => {
  it("deals P, B, P, B, flips Player then Banker, then shows the result", () => {
    const t = baccaratTimeline({ player: ["4s", "4h"], banker: ["Ks", "9h"] });
    const order = [...t.dealAt.entries()].sort((a, b) => a[1] - b[1]).map(([slot]) => slot);
    expect(order).toEqual([playerSlot(0), bankerSlot(0), playerSlot(1), bankerSlot(1)]);
    expect(t.revealPlayerAt).toBeGreaterThan(t.dealAt.get(bankerSlot(1))!);
    expect(t.revealBankerAt).toBeGreaterThan(t.revealPlayerAt);
    expect(t.doneAt).toBeGreaterThan(t.revealBankerAt);
  });

  it("brings third cards out after both hands are showing, Player first", () => {
    const t = baccaratTimeline({ player: ["2s", "3h", "4d"], banker: ["Ks", "2h", "Jd"] });
    expect(t.dealAt.get(playerSlot(2))!).toBeGreaterThan(t.revealBankerAt);
    expect(t.dealAt.get(bankerSlot(2))!).toBeGreaterThan(t.dealAt.get(playerSlot(2))!);
    expect(t.doneAt).toBeGreaterThan(t.dealAt.get(bankerSlot(2))!);
  });
});
