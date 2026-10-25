import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { AvatarId } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/server";

export type Player = {
  id: string;
  username: string;
  avatar: AvatarId;
  chips: number;
  lastRefillAt: Date | null;
  isAdmin: boolean;
};

type Account = { player: Player | null; suspended: boolean };

/** Who is logged in, read once per request. */
const getAccount = cache(async (): Promise<Account> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return { player: null, suspended: false };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar, chips, last_refill_at, is_admin, suspended_at")
    .eq("id", userId)
    .single();
  if (error || !data) return { player: null, suspended: false };
  if (data.suspended_at) return { player: null, suspended: true };

  return {
    player: {
      id: data.id,
      username: data.username,
      avatar: data.avatar as AvatarId,
      chips: Number(data.chips),
      lastRefillAt: data.last_refill_at ? new Date(data.last_refill_at) : null,
      isAdmin: data.is_admin,
    },
    suspended: false,
  };
});

/**
 * The logged-in player's profile, or null if signed out or suspended. Cached
 * per request so the header and page can both call it. Reads cookies, so
 * callers must render inside a <Suspense> boundary.
 */
export async function getCurrentPlayer(): Promise<Player | null> {
  return (await getAccount()).player;
}

/** Like getCurrentPlayer, but sends signed-out visitors to the login page. */
export async function requirePlayer(next: string): Promise<Player> {
  const { player, suspended } = await getAccount();
  if (suspended) redirect("/suspended");
  if (!player) redirect(`/login?next=${encodeURIComponent(next)}`);
  return player;
}

/** Admin pages: everyone else gets a plain "not found", so the pages stay hidden. */
export async function requireAdmin(next: string): Promise<Player> {
  const player = await requirePlayer(next);
  if (!player.isAdmin) notFound();
  return player;
}
