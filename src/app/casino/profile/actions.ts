"use server";

import { refresh } from "next/cache";
import { getCurrentPlayer } from "@/lib/auth";
import { STARTING_CHIPS, formatChips } from "@/lib/chips";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; message?: string };

const NOT_SIGNED_IN = "You're not logged in. Please log in again.";

const REFILL_ERRORS: Record<string, string> = {
  REFILL_NOT_LOW: "Refills are only for low balances.",
  REFILL_TOO_SOON: "You've already claimed a refill in the last 24 hours.",
};

export async function claimRefill(): Promise<ActionState> {
  const player = await getCurrentPlayer();
  if (!player) return { error: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_daily_refill");
  if (error) {
    return { error: REFILL_ERRORS[error.message] ?? "Couldn't claim your refill. Please try again." };
  }

  refresh();
  return { message: `Refilled to ${formatChips(STARTING_CHIPS)} chips!` };
}

const STAT_GAMES = {
  blackjack: { games: ["blackjack"], label: "Blackjack" },
  holdem: { games: ["holdem"], label: "Texas Hold'em" },
  craps: { games: ["craps"], label: "Craps" },
  baccarat: { games: ["baccarat"], label: "Baccarat" },
  all: { games: ["blackjack", "holdem", "craps", "baccarat"], label: "All" },
} as const;

/**
 * Clears the player's own stats for one game (or all of them) so they can
 * start fresh. Chips and chip history are not touched.
 */
export async function resetStats(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const player = await getCurrentPlayer();
  if (!player) return { error: NOT_SIGNED_IN };
  const choice = String(formData.get("game"));
  if (!(choice in STAT_GAMES)) return { error: "Pick which stats to clear." };
  const { games, label } = STAT_GAMES[choice as keyof typeof STAT_GAMES];

  // Players can only read their stats, so the delete runs with the secret key,
  // limited to this player's rows.
  const admin = createAdminClient();
  const stats = await admin.from("player_game_stats").delete().eq("player_id", player.id).in("game", games);
  const decisions = choice === "blackjack" || choice === "all"
    ? await admin.from("blackjack_decisions").delete().eq("player_id", player.id)
    : { error: null };
  if (stats.error || decisions.error) {
    console.error("Couldn't reset stats", stats.error ?? decisions.error);
    return { error: "Couldn't clear your stats. Please try again." };
  }

  refresh();
  return { message: `${label} stats cleared. Fresh start!` };
}
