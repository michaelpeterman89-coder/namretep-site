// Keep in sync with the profiles_avatar_choice constraint in supabase/migrations.
export const AVATARS = ["nova", "comet", "ringed", "moon", "ember", "verdant"] as const;

export type AvatarId = (typeof AVATARS)[number];

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATARS as readonly string[]).includes(value);
}
