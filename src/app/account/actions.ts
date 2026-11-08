"use server";

import { refresh } from "next/cache";
import { getCurrentPlayer } from "@/lib/auth";
import { isAvatarId } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/server";
import { validateUsername } from "@/lib/validation";

// The account every Namretep project shares: username and avatar.

export type ActionState = { error?: string; message?: string };

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const player = await getCurrentPlayer();
  if (!player) return { error: "You're not logged in. Please log in again." };

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
