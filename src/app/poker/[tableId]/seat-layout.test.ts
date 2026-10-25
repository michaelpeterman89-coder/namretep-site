import { describe, expect, it } from "vitest";
import { seatAngle } from "./seat-layout";

const TOP = -Math.PI / 2;
/** Angle difference folded into [0, π]. */
const apart = (a: number, b: number) => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
};

describe("seatAngle", () => {
  for (let total = 2; total <= 9; total++) {
    for (let bottomSeat = 0; bottomSeat < total; bottomSeat++) {
      const angles = Array.from({ length: total }, (_, s) => seatAngle(s, total, bottomSeat));
      const step = (2 * Math.PI) / (total + 1);

      it(`${total} seats, viewer in seat ${bottomSeat + 1}: rack spot free, viewer at the bottom`, () => {
        // Nobody sits in the rack's spot at the top.
        for (const a of angles) expect(apart(a, TOP)).toBeGreaterThan(step * 0.99);
        // Seats never overlap.
        for (let i = 0; i < total; i++) {
          for (let j = i + 1; j < total; j++) expect(apart(angles[i], angles[j])).toBeGreaterThan(step * 0.99);
        }
        // The viewer is at (or right beside) the bottom.
        expect(apart(angles[bottomSeat], Math.PI / 2)).toBeLessThanOrEqual(step / 2 + 1e-9);
      });
    }
  }

  it("puts the viewer exactly at the bottom of a 9-seat table, with the rack between seats 5 and 6", () => {
    expect(apart(seatAngle(0, 9, 0), Math.PI / 2)).toBeCloseTo(0);
    // Turn order runs clockwise: the seats either side of the rack are the
    // last and first spots going round.
    expect(apart(seatAngle(5, 9, 0), TOP)).toBeCloseTo((2 * Math.PI) / 10);
    expect(apart(seatAngle(4, 9, 0), TOP)).toBeCloseTo((2 * Math.PI) / 10);
  });
});
