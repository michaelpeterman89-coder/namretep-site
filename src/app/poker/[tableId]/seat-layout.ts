// Where seats sit around the poker oval. The top centre is kept free for the
// chip rack: seats are spaced as if there were one more seat, and that extra
// spot is the rack's. Seats go clockwise (in turn order) starting just right
// of the rack, and the viewer's seat is turned to the bottom.

/** Angle (radians, 0 = right, π/2 = bottom) of a seat on the oval. */
export function seatAngle(seatNumber: number, total: number, bottomSeat: number): number {
  const step = (2 * Math.PI) / (total + 1);
  // The spot nearest the bottom: exactly at the bottom when `total` is odd.
  const bottomSpot = Math.floor((total - 1) / 2);
  const spot = (((seatNumber - bottomSeat + bottomSpot) % total) + total) % total;
  return -Math.PI / 2 + step * (spot + 1);
}

/** CSS position for a seat (or, with a smaller radius, its bets). See `.around`. */
export function seatPosition(seatNumber: number, total: number, bottomSeat: number, radius = 1) {
  const angle = seatAngle(seatNumber, total, bottomSeat);
  return { "--x": Math.cos(angle) * radius, "--y": Math.sin(angle) * radius } as React.CSSProperties;
}
