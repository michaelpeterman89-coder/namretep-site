import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { YahooError } from "@/lib/fantasy/yahoo/errors";
import {
  parseTokenResponse,
  refreshTokenWasRefused,
  TOKEN_URL,
  tokenErrorCode,
  type YahooTokens,
} from "@/lib/fantasy/yahoo/oauth";
import { decryptToken, encryptToken, parseEncryptionKey } from "@/lib/fantasy/yahoo/token-crypto";
import { getValidAccessToken, type ConnectionStore } from "@/lib/fantasy/yahoo/token-renewal";

// Everything that touches Yahoo tokens. They stay on the server and are never
// logged, returned to a page, or passed to a client component. Every function
// takes the site account it acts for, so callers must check who's asking first.

const TIMEOUT_MS = 10_000;

export function yahooClientId(): string {
  const id = process.env.YAHOO_CLIENT_ID;
  if (!id) throw new Error("Missing YAHOO_CLIENT_ID. Add it to .env.local and to Vercel.");
  return id;
}

function basicAuth(): string {
  const secret = process.env.YAHOO_CLIENT_SECRET;
  if (!secret) throw new Error("Missing YAHOO_CLIENT_SECRET. Add it to .env.local and to Vercel.");
  return `Basic ${Buffer.from(`${yahooClientId()}:${secret}`).toString("base64")}`;
}

const encryptionKey = () => parseEncryptionKey(process.env.YAHOO_TOKEN_ENCRYPTION_KEY);

/** Calls Yahoo's token address. Returns the parsed reply; the caller decides what a failure means. */
async function requestTokens(params: Record<string, string>): Promise<{ status: number; ok: boolean; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new YahooError("temporary", "Couldn't reach Yahoo");
  }
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

/** Turns the code from Yahoo's callback into tokens and saves them for this account. */
export async function connectWithCode(userId: string, code: string, redirectUri: string): Promise<void> {
  const { status, ok, body } = await requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  if (!ok) throw new YahooError("no_access", `Token request failed: ${status} ${tokenErrorCode(body)}`);

  const tokens = parseTokenResponse(body, new Date());
  if (!tokens.refreshToken) throw new YahooError("bad_response", "Yahoo didn't send a refresh token");

  const key = encryptionKey();
  const { error } = await createAdminClient()
    .from("yahoo_connections")
    .upsert({
      user_id: userId,
      access_token_encrypted: encryptToken(tokens.accessToken, key, userId),
      refresh_token_encrypted: encryptToken(tokens.refreshToken, key, userId),
      access_token_expires_at: tokens.expiresAt.toISOString(),
      needs_reconnect: false,
      refresh_locked_until: null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Couldn't save the Yahoo connection: ${error.message}`);
}

async function renewTokens(refreshToken: string): Promise<YahooTokens> {
  const { status, ok, body } = await requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (ok) return parseTokenResponse(body, new Date());
  const code = tokenErrorCode(body);
  if (refreshTokenWasRefused(status, code)) throw new YahooError("needs_reconnect", code);
  throw new YahooError("temporary", `Token renewal failed: ${status} ${code}`);
}

function connectionStore(userId: string): ConnectionStore {
  const admin = createAdminClient();
  const key = encryptionKey();
  const row = () => admin.from("yahoo_connections");
  const check = ({ error }: { error: { message: string } | null }) => {
    if (error) throw new Error(`Yahoo connection database error: ${error.message}`);
  };

  return {
    async read() {
      const { data, error } = await row()
        .select("access_token_encrypted, refresh_token_encrypted, access_token_expires_at, needs_reconnect")
        .eq("user_id", userId)
        .maybeSingle();
      check({ error });
      if (!data) return null;
      return {
        accessToken: decryptToken(data.access_token_encrypted, key, userId),
        refreshToken: decryptToken(data.refresh_token_encrypted, key, userId),
        expiresAt: new Date(data.access_token_expires_at),
        needsReconnect: data.needs_reconnect,
      };
    },
    async claimLock(until, now) {
      const { data, error } = await row()
        .update({ refresh_locked_until: until.toISOString() })
        .eq("user_id", userId)
        .or(`refresh_locked_until.is.null,refresh_locked_until.lt."${now.toISOString()}"`)
        .select("user_id");
      check({ error });
      return (data?.length ?? 0) > 0;
    },
    async releaseLock() {
      check(await row().update({ refresh_locked_until: null }).eq("user_id", userId));
    },
    async saveTokens(tokens) {
      check(
        await row()
          .update({
            access_token_encrypted: encryptToken(tokens.accessToken, key, userId),
            refresh_token_encrypted: encryptToken(tokens.refreshToken, key, userId),
            access_token_expires_at: tokens.expiresAt.toISOString(),
            refresh_locked_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId),
      );
    },
    async markNeedsReconnect() {
      check(
        await row()
          .update({ needs_reconnect: true, refresh_locked_until: null, updated_at: new Date().toISOString() })
          .eq("user_id", userId),
      );
    },
  };
}

/** A working access token for this account, renewed first if needed. */
export function yahooAccessToken(userId: string, rejectedToken?: string): Promise<string> {
  return getValidAccessToken({ store: connectionStore(userId), renew: renewTokens, rejectedToken });
}

export type YahooConnectionStatus = { connectedAt: Date; needsReconnect: boolean };

/** Whether this account is connected. Reads no tokens, so it's safe to use for pages. */
export async function getYahooConnectionStatus(userId: string): Promise<YahooConnectionStatus | null> {
  const { data, error } = await createAdminClient()
    .from("yahoo_connections")
    .select("created_at, needs_reconnect")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the Yahoo connection: ${error.message}`);
  return data && { connectedAt: new Date(data.created_at), needsReconnect: data.needs_reconnect };
}

/** Forgets the tokens. Yahoo has no documented way to revoke them from here. */
export async function disconnectYahoo(userId: string): Promise<void> {
  const { error } = await createAdminClient().from("yahoo_connections").delete().eq("user_id", userId);
  if (error) throw new Error(`Couldn't remove the Yahoo connection: ${error.message}`);
}
