"use server";

import { refresh } from "next/cache";
import { getCurrentPlayer } from "@/lib/auth";
import { isAvatarId } from "@/lib/avatars";
import { STARTING_CHIPS, formatChips } from "@/lib/chips";
import { createClient } from "@/lib/supabase/server";
import { validateUsername } from "@/lib/validation";

export type ActionState = { error?: string; message?: string };

const NOT_SIGNED_IN = "You're not logged in. Please log in again.";

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const player = await getCurrentPlayer();
  if (!player) return { error: NOT_SIGNED_IN };

  const username = String(formData.get("username") ?? "").trim();
  const avatar = formData.get("avatar");

  const invalid = validateUsername(username);
  if (invalid) return { error: invalid };
  if (!isAvatarId(avatar)) return { error: "Pick one of the avatars." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ username, avatar })
    .eq("id", player.id);

  if (error) {
    // 23505 = unique_violation: someone else has that username.
    if (error.code === "23505") return { error: "That username is taken." };
    return { error: "Couldn't save your profile. Please try again." };
  }

  refresh();
  return { message: "Profile saved." };
}

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
