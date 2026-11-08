import { describe, expect, it, vi } from "vitest";
import { YahooError } from "./errors";
import { getValidAccessToken, type ConnectionStore, type StoredConnection } from "./token-renewal";

const NOW = new Date("2026-11-08T12:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60 * 1000);
const now = () => NOW;

/** An in-memory stand-in for the database row, with a real lock. */
function fakeStore(initial: StoredConnection | null) {
  const state = { row: initial, lockedUntil: null as Date | null };
  const store: ConnectionStore = {
    read: async () => state.row && { ...state.row },
    claimLock: async (until, at) => {
      if (state.lockedUntil && state.lockedUntil > at) return false;
      state.lockedUntil = until;
      return true;
    },
    releaseLock: async () => {
      state.lockedUntil = null;
    },
    saveTokens: async (tokens) => {
      state.row = { ...tokens, needsReconnect: false };
      state.lockedUntil = null;
    },
    markNeedsReconnect: async () => {
      if (state.row) state.row.needsReconnect = true;
      state.lockedUntil = null;
    },
  };
  return { store, state };
}

const connection = (expiresAt: Date, over: Partial<StoredConnection> = {}): StoredConnection => ({
  accessToken: "old-access",
  refreshToken: "old-refresh",
  expiresAt,
  needsReconnect: false,
  ...over,
});

const newTokens = { accessToken: "new-access", refreshToken: "new-refresh", expiresAt: minutes(60) };
const noWait = async () => {};

describe("getValidAccessToken", () => {
  it("uses a token with plenty of time left, without calling Yahoo", async () => {
    const { store } = fakeStore(connection(minutes(30)));
    const renew = vi.fn();
    await expect(getValidAccessToken({ store, renew, now })).resolves.toBe("old-access");
    expect(renew).not.toHaveBeenCalled();
  });

  it("renews a token about to expire and saves both new tokens", async () => {
    const { store, state } = fakeStore(connection(minutes(4)));
    const renew = vi.fn(async () => newTokens);
    await expect(getValidAccessToken({ store, renew, now })).resolves.toBe("new-access");
    expect(renew).toHaveBeenCalledWith("old-refresh");
    expect(state.row?.refreshToken).toBe("new-refresh");
    expect(state.lockedUntil).toBeNull();
  });

  it("keeps the old refresh token if Yahoo doesn't send a new one", async () => {
    const { store, state } = fakeStore(connection(minutes(-1)));
    await getValidAccessToken({ store, renew: async () => ({ ...newTokens, refreshToken: null }), now });
    expect(state.row?.refreshToken).toBe("old-refresh");
  });

  it("renews only once when several requests arrive together", async () => {
    const { store } = fakeStore(connection(minutes(-1)));
    const renew = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return newTokens;
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getValidAccessToken({ store, renew, now, wait: () => new Promise((resolve) => setTimeout(resolve, 1)) }),
      ),
    );
    expect(results).toEqual(Array(5).fill("new-access"));
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("doesn't renew if another request finished just before it got the lock", async () => {
    const { store } = fakeStore(connection(minutes(-1)));
    const realRead = store.read;
    let reads = 0;
    store.read = async () => {
      reads++;
      const row = await realRead();
      return reads === 1 ? row : row && { ...row, accessToken: "their-access", expiresAt: minutes(60) };
    };
    const renew = vi.fn();
    await expect(getValidAccessToken({ store, renew, now })).resolves.toBe("their-access");
    expect(renew).not.toHaveBeenCalled();
  });

  it("takes over a lock left behind by a request that died", async () => {
    const { store, state } = fakeStore(connection(minutes(-1)));
    state.lockedUntil = minutes(-1);
    await expect(getValidAccessToken({ store, renew: async () => newTokens, now })).resolves.toBe("new-access");
  });

  it("gives up with a temporary error if the lock never clears", async () => {
    const { store, state } = fakeStore(connection(minutes(-1)));
    state.lockedUntil = minutes(1);
    const error = await getValidAccessToken({ store, renew: vi.fn(), now, wait: noWait }).catch((e) => e);
    expect(error).toBeInstanceOf(YahooError);
    expect(error.kind).toBe("temporary");
  });

  it("marks the connection dead when Yahoo refuses the refresh token", async () => {
    const { store, state } = fakeStore(connection(minutes(-1)));
    const renew = async () => {
      throw new YahooError("needs_reconnect");
    };
    await expect(getValidAccessToken({ store, renew, now })).rejects.toThrow(YahooError);
    expect(state.row?.needsReconnect).toBe(true);
    expect(state.lockedUntil).toBeNull();
  });

  it("keeps the connection through a temporary Yahoo problem", async () => {
    const { store, state } = fakeStore(connection(minutes(-1)));
    const renew = async () => {
      throw new YahooError("temporary");
    };
    await expect(getValidAccessToken({ store, renew, now })).rejects.toThrow(YahooError);
    expect(state.row?.needsReconnect).toBe(false);
    expect(state.lockedUntil).toBeNull();
  });

  it("renews a token Yahoo rejected even if it looks unexpired", async () => {
    const { store } = fakeStore(connection(minutes(30)));
    const renew = vi.fn(async () => newTokens);
    await expect(getValidAccessToken({ store, renew, rejectedToken: "old-access", now })).resolves.toBe("new-access");
    expect(renew).toHaveBeenCalledOnce();
  });

  it("reuses another request's new token instead of renewing the rejected one again", async () => {
    const { store } = fakeStore(connection(minutes(30), { accessToken: "already-new" }));
    const renew = vi.fn();
    await expect(getValidAccessToken({ store, renew, rejectedToken: "old-access", now })).resolves.toBe("already-new");
    expect(renew).not.toHaveBeenCalled();
  });

  it("reports a missing or dead connection without calling Yahoo", async () => {
    const renew = vi.fn();
    await expect(getValidAccessToken({ store: fakeStore(null).store, renew, now })).rejects.toMatchObject({
      kind: "not_connected",
    });
    await expect(
      getValidAccessToken({ store: fakeStore(connection(minutes(30), { needsReconnect: true })).store, renew, now }),
    ).rejects.toMatchObject({ kind: "needs_reconnect" });
    expect(renew).not.toHaveBeenCalled();
  });
});
