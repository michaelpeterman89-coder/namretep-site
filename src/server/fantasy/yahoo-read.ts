import "server-only";
import { YahooError } from "@/lib/fantasy/yahoo/errors";
import { parseLeagues, type YahooLeague } from "@/lib/fantasy/yahoo/leagues";
import { yahooAccessToken } from "./yahoo-connection";

// Read-only Yahoo calls: this file only ever sends GET requests. Manage features
// (roster moves, lineups) would go in their own file. Paths here must be built in
// code, never taken directly from a web address.

const BASE_URL = "https://fantasysports.yahooapis.com/fantasy/v2";
const TIMEOUT_MS = 10_000;
const DETAIL_CHARS = 200;

async function send(path: string, token: string): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}?format=json`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new YahooError("temporary", "Couldn't reach Yahoo");
  }
}

/** A short plain-text version of Yahoo's reply, to help tell why a request failed. */
async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return `${res.status} ${plain.slice(0, DETAIL_CHARS)}`.trim();
}

async function yahooGet(userId: string, path: string): Promise<unknown> {
  const token = await yahooAccessToken(userId);
  let res = await send(path, token);
  // The token may have been cancelled early, so renew it and try once more.
  if (res.status === 401) res = await send(path, await yahooAccessToken(userId, token));

  if (res.status === 401 || res.status === 403) throw new YahooError("no_access", await errorDetail(res));
  if (res.status === 429 || res.status === 999) throw new YahooError("rate_limited", String(res.status));
  if (res.status >= 500) throw new YahooError("temporary", String(res.status));
  if (!res.ok) throw new YahooError("bad_response", await errorDetail(res));

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Yahoo's docs only show XML, so this is how we'd find out format=json doesn't work.
    throw new YahooError("bad_response", `Not JSON (${res.headers.get("content-type") ?? "no content type"})`);
  }
}

/** The leagues this account's Yahoo user is in, for games currently in season. */
export async function getMyYahooLeagues(userId: string): Promise<YahooLeague[]> {
  return parseLeagues(await yahooGet(userId, "/users;use_login=1/games;is_available=1;game_types=full/leagues"));
}
