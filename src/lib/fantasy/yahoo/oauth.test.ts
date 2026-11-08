import { describe, expect, it } from "vitest";
import { YahooError } from "./errors";
import {
  authorizeUrl,
  newState,
  parseTokenResponse,
  redirectUriFor,
  refreshTokenWasRefused,
  stateCookieValue,
  stateIsValid,
  tokenErrorCode,
} from "./oauth";

const USER = "524327fa-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-08T12:00:00Z");

describe("redirectUriFor", () => {
  it("uses the registered address for each Vercel environment", () => {
    expect(redirectUriFor("production")).toBe("https://www.namretep.com/api/yahoo/callback");
    expect(redirectUriFor("preview")).toBe("https://namretep-site1-git-fantasy-namretep.vercel.app/api/yahoo/callback");
  });

  it("has none on a local dev server", () => {
    expect(redirectUriFor(undefined)).toBeNull();
    expect(redirectUriFor("development")).toBeNull();
  });
});

describe("authorizeUrl", () => {
  it("includes what Yahoo needs and escapes it", () => {
    const url = new URL(authorizeUrl("client id", "https://example.com/cb", "abc"));
    expect(url.origin + url.pathname).toBe("https://api.login.yahoo.com/oauth2/request_auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client id",
      redirect_uri: "https://example.com/cb",
      response_type: "code",
      state: "abc",
    });
  });
});

describe("stateIsValid", () => {
  const state = newState();
  const cookie = stateCookieValue(state, USER);

  it("accepts the state this browser started with", () => {
    expect(stateIsValid(cookie, state, USER)).toBe(true);
  });

  it("makes a new state each time", () => {
    expect(newState()).not.toBe(state);
  });

  it("rejects a different state", () => {
    expect(stateIsValid(cookie, newState(), USER)).toBe(false);
  });

  it("rejects a different site account", () => {
    expect(stateIsValid(cookie, state, "another-user")).toBe(false);
  });

  it("rejects a missing cookie or state", () => {
    expect(stateIsValid(undefined, state, USER)).toBe(false);
    expect(stateIsValid(cookie, null, USER)).toBe(false);
    expect(stateIsValid(cookie, "", USER)).toBe(false);
  });
});

describe("parseTokenResponse", () => {
  it("reads the tokens and works out when they expire", () => {
    const tokens = parseTokenResponse({ access_token: "a", refresh_token: "r", expires_in: 3600 }, NOW);
    expect(tokens).toEqual({ accessToken: "a", refreshToken: "r", expiresAt: new Date("2026-11-08T13:00:00Z") });
  });

  it("allows a renewal with no new refresh token", () => {
    expect(parseTokenResponse({ access_token: "a", expires_in: "3600" }, NOW).refreshToken).toBeNull();
  });

  it.each([null, {}, { access_token: "a" }, { access_token: "", expires_in: 3600 }, { access_token: "a", expires_in: 0 }])(
    "rejects %j without echoing it",
    (body) => {
      expect(() => parseTokenResponse(body, NOW)).toThrow(YahooError);
    },
  );
});

describe("token errors", () => {
  it("reads both error shapes Yahoo may use", () => {
    expect(tokenErrorCode({ error: "invalid_grant" })).toBe("invalid_grant");
    expect(tokenErrorCode({ error: { error_id: "INVALID_REFRESH_TOKEN" } })).toBe("INVALID_REFRESH_TOKEN");
    expect(tokenErrorCode(null)).toBe("unknown");
  });

  it("only asks the player to reconnect when Yahoo refused the refresh token", () => {
    expect(refreshTokenWasRefused(400, "invalid_grant")).toBe(true);
    expect(refreshTokenWasRefused(401, "INVALID_REFRESH_TOKEN")).toBe(true);
    expect(refreshTokenWasRefused(401, "invalid_client")).toBe(false);
    expect(refreshTokenWasRefused(503, "invalid_grant")).toBe(false);
  });
});
