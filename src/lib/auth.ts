import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AvatarId } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/server";

export type Player = {
  id: string;
  username: string;
  avatar: AvatarId;
  chips: number;
  lastRefillAt: Date | null;
};

/**
 * The logged-in player's profile, or null if signed out. Cached per request so
 * the header and page can both call it. Reads cookies, so callers must render
 * inside a <Suspense> boundary.
 */
export const getCurrentPlayer = cache(async (): Promise<Player | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar, chips, last_refill_at")
    .eq("id", userId)
    .single();
  if (error || !data) return null;

  return {
    id: data.id,
    username: data.username,
    avatar: data.avatar as AvatarId,
    chips: Number(data.chips),
    lastRefillAt: data.last_refill_at ? new Date(data.last_refill_at) : null,
  };
});

/** Like getCurrentPlayer, but sends signed-out visitors to the login page. */
export async function requirePlayer(next: string): Promise<Player> {
  const player = await getCurrentPlayer();
  if (!player) redirect(`/login?next=${encodeURIComponent(next)}`);
  return player;
}
