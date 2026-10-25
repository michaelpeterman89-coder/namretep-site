import { actionCost, seatReturned, type BlackjackAction, type BlackjackRound } from "./engine";

export type ChipReason = "bet" | "double" | "split" | "insurance" | "payout";

/** One change to a player's balance; negative amounts take chips away. */
export type ChipChange = { player_id: string; amount: number; reason: ChipReason };

const ACTION_REASONS: Partial<Record<BlackjackAction["type"], ChipReason>> = {
  double: "double",
  split: "split",
  insurance: "insurance",
};

/** Chips taken from each seat for its opening bet. */
export function betChanges(round: BlackjackRound): ChipChange[] {
  return round.seats.map((seat) => ({ player_id: seat.playerId, amount: -seat.baseBet, reason: "bet" }));
}

/** Chips a player puts up to take an action (double, split, insurance), if any. */
export function actionChanges(before: BlackjackRound, action: BlackjackAction): ChipChange[] {
  const reason = ACTION_REASONS[action.type];
  const cost = actionCost(before, action);
  if (!reason || cost <= 0) return [];
  return [{ player_id: before.seats[action.seat].playerId, amount: -cost, reason }];
}

/** Winnings paid to each seat once the round is settled (nothing before that). */
export function payoutChanges(round: BlackjackRound): ChipChange[] {
  if (round.phase !== "settled") return [];
  return round.seats
    .map((seat): ChipChange => ({ player_id: seat.playerId, amount: seatReturned(seat), reason: "payout" }))
    .filter((change) => change.amount > 0);
}
