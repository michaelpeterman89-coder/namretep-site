import { describe, expect, it } from "vitest";
import { getRefillStatus, REFILL_COOLDOWN_MS, REFILL_LOW_THRESHOLD } from "./chips";

const now = new Date("2026-10-25T12:00:00Z");

describe("getRefillStatus", () => {
  it("is not available when the balance isn't low", () => {
    expect(getRefillStatus(REFILL_LOW_THRESHOLD, null, now)).toEqual({ kind: "not-low" });
  });

  it("is available when low and never claimed", () => {
    expect(getRefillStatus(REFILL_LOW_THRESHOLD - 1, null, now)).toEqual({ kind: "available" });
  });

  it("is on cooldown within 24 hours of the last claim", () => {
    const last = new Date(now.getTime() - REFILL_COOLDOWN_MS + 60_000);
    expect(getRefillStatus(0, last, now)).toEqual({
      kind: "cooldown",
      availableAt: new Date(last.getTime() + REFILL_COOLDOWN_MS),
    });
  });

  it("is available again once 24 hours have passed", () => {
    const last = new Date(now.getTime() - REFILL_COOLDOWN_MS);
    expect(getRefillStatus(0, last, now)).toEqual({ kind: "available" });
  });
});
