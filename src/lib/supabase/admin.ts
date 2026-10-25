import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client using the secret key. It bypasses Row Level Security, so
 * only use it in server code, and only after checking who the player is and
 * what they're allowed to do.
 */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY. Add it to .env.local and to Vercel.");
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
