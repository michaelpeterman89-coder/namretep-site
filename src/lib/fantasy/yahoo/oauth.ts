import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { YahooError } from "./errors";

export const AUTHORIZE_URL = "https://api.login.yahoo.com/oauth2/request_auth";
export const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";

// These must match the addresses registered in the Yahoo app exactly.
const PRODUCTION_REDIRECT_URI = "https://www.namretep.com/api/yahoo/callback";
const PREVIEW_REDIRECT_URI = "https://namretep-site1-git-fantasy-namretep.vercel.app/api/yahoo/callback";

/**
 * Where Yahoo sends the player back to. Null on a local dev server, which has no
 * https address Yahoo accepts: connect on the preview and reuse that connection.
 */
export function redirectUriFor(vercelEnv: string | undefined): string | null {
  if (vercelEnv === "production") return PRODUCTION_REDIRECT_URI;
  if (vercelEnv === "preview") return PREVIEW_REDIRECT_URI;
  return null;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

// ---------- Forged-login protection ----------

export function newState(): string {
  return randomBytes(32).toString("base64url");
}

/** What goes in the login-attempt cookie: the state and who started the attempt. */
export function stateCookieValue(state: string, userId: string): string {
  return `${state}.${userId}`;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True only if Yahoo returned this browser's state, for the same site account. */
export function stateIsValid(cookie: string | undefined, returned: string | null, userId: string): boolean {
  if (!cookie || !returned) return false;
  return timingSafeEqual(digest(cookie), digest(stateCookieValue(returned, userId)));
}

// ---------- Token responses ----------

export type YahooTokens = {
  accessToken: string;
  /** Null when Yahoo renewed the access token but kept the same refresh token. */
  refreshToken: string | null;
  expiresAt: Date;
};

export function parseTokenResponse(body: unknown, now: Date): YahooTokens {
  const { access_token, refresh_token, expires_in } = (body ?? {}) as Record<string, unknown>;
  const seconds = Number(expires_in);
  if (typeof access_token !== "string" || !access_token || !Number.isFinite(seconds) || seconds <= 0) {
    throw new YahooError("bad_response", "Unexpected token response");
  }
  return {
    accessToken: access_token,
    refreshToken: typeof refresh_token === "string" && refresh_token ? refresh_token : null,
    expiresAt: new Date(now.getTime() + seconds * 1000),
  };
}

/** Yahoo's short error code from a failed token response, which is safe to log. */
export function tokenErrorCode(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error.slice(0, 80);
  const id = (error as { error_id?: unknown } | null | undefined)?.error_id;
  return typeof id === "string" ? id.slice(0, 80) : "unknown";
}

/**
 * Whether a failed renewal means the player has to connect again. A wrong client
 * secret isn't their problem, and a Yahoo outage shouldn't cost them the connection.
 */
export function refreshTokenWasRefused(status: number, code: string): boolean {
  return (status === 400 || status === 401) && /invalid_grant|invalid_refresh_token/i.test(code);
}
