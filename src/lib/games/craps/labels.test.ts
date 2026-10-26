import { describe, expect, it } from "vitest";
import { betName, callRoll } from "./labels";

describe("betName", () => {
  it("adds the number or dice where it matters", () => {
    expect(betName("place", 8, undefined)).toBe("Place 8");
    expect(betName("come", null, undefined)).toBe("Come");
    expect(betName("come", 9, undefined)).toBe("Come 9");
    expect(betName("hop", null, [2, 4])).toBe("Hop 2-4");
    expect(betName("odds", 6, undefined)).toBe("Odds on 6");
    expect(betName("pass", 6, undefined)).toBe("Pass Line");
  });
});

describe("callRoll", () => {
  it("calls the roll like a stickman", () => {
    expect(callRoll("sevenOut", [3, 4], null)).toBe("Seven out");
    expect(callRoll("pointSet", [2, 4], 6)).toBe("The point is 6");
    expect(callRoll("pointMade", [5, 5], null)).toBe("Winner! The point 10 is made");
    expect(callRoll("natural", [5, 6], null)).toBe("Yo eleven — winner!");
    expect(callRoll("craps", [6, 6], null)).toBe("Craps: boxcars");
    expect(callRoll("roll", [4, 4], 6)).toBe("Hard 8");
    expect(callRoll("roll", [3, 5], 6)).toBe("8 — the point is 6");
  });
});
