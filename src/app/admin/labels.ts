import { formatChips } from "@/lib/chips";
import type { AdminLogLine } from "@/server/admin";

// Plain-English wording for ledger lines and admin log entries.

export const LEDGER_REASONS: Record<string, string> = {
  opening_balance: "Opening balance",
  signup: "Sign-up chips",
  refill: "Daily refill",
  bet: "Blackjack bet",
  double: "Blackjack double",
  split: "Blackjack split",
  insurance: "Insurance",
  payout: "Blackjack payout",
  buy_in: "Poker buy-in",
  cash_out: "Poker cash-out",
  admin_adjust: "Admin adjustment",
};

export const GAME_NAMES: Record<string, string> = { blackjack: "Blackjack", holdem: "Texas Hold'em" };

/** "gave 500 chips (tournament prize)", "suspended the account", … — read after the admin's name. */
export function describeAdminAction(line: AdminLogLine): string {
  const d = line.details;
  const note = typeof d.note === "string" && d.note ? ` (${d.note})` : "";
  switch (line.action) {
    case "adjust_chips": {
      const amount = Number(d.amount);
      return `${amount > 0 ? "gave" : "took"} ${formatChips(Math.abs(amount))} chips${note}`;
    }
    case "grant_admin":
      return "made them an admin";
    case "revoke_admin":
      return "removed their admin access";
    case "suspend":
      return `suspended the account${note}`;
    case "unsuspend":
      return "restored the account";
    case "rename":
      return `renamed ${String(d.from)} to ${String(d.to)}`;
    case "close_table":
      return `closed the ${GAME_NAMES[String(d.game)] ?? ""} table “${String(d.name)}”`;
    default:
      return line.action;
  }
}
