import { YahooError } from "./errors";
import type { YahooTokens } from "./oauth";

// Yahoo can cancel the old refresh token as soon as it issues a new one, so two
// requests renewing at once could leave a connection with a dead token. Only the
// request holding the database lock renews; the others wait and reuse its result.

/** Renew this long before the hour is up, so a token can't expire mid-request. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;
/** A request that dies while renewing can't block the connection for longer than this. */
const LOCK_MS = 30 * 1000;
const WAIT_MS = 500;
const MAX_TRIES = 10;

export type StoredConnection = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  needsReconnect: boolean;
};

/** One player's saved connection. */
export type ConnectionStore = {
  read(): Promise<StoredConnection | null>;
  /** True if this request now holds the lock (nobody else does, or theirs expired). */
  claimLock(until: Date, now: Date): Promise<boolean>;
  releaseLock(): Promise<void>;
  /** Saves new tokens and releases the lock. */
  saveTokens(tokens: { accessToken: string; refreshToken: string; expiresAt: Date }): Promise<void>;
  /** Marks the connection dead and releases the lock. */
  markNeedsReconnect(): Promise<void>;
};

type Options = {
  store: ConnectionStore;
  /** Asks Yahoo for new tokens. Throws needs_reconnect if the refresh token was refused. */
  renew: (refreshToken: string) => Promise<YahooTokens>;
  /** A token Yahoo just rejected, which has to be renewed even if it looks unexpired. */
  rejectedToken?: string;
  now?: () => Date;
  wait?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function getValidAccessToken({
  store,
  renew,
  rejectedToken,
  now = () => new Date(),
  wait = defaultWait,
}: Options): Promise<string> {
  const usable = (connection: StoredConnection) =>
    connection.accessToken !== rejectedToken && connection.expiresAt.getTime() - now().getTime() > RENEW_BEFORE_MS;

  const readLive = async () => {
    const connection = await store.read();
    if (!connection) throw new YahooError("not_connected");
    if (connection.needsReconnect) throw new YahooError("needs_reconnect");
    return connection;
  };

  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const seen = await readLive();
    if (usable(seen)) return seen.accessToken;

    if (await store.claimLock(new Date(now().getTime() + LOCK_MS), now())) {
      let connection: StoredConnection;
      try {
        // Another request may have finished renewing just before this one got the lock.
        connection = await readLive();
        if (usable(connection)) {
          await store.releaseLock();
          return connection.accessToken;
        }
      } catch (e) {
        await store.releaseLock();
        throw e;
      }

      let tokens: YahooTokens;
      try {
        tokens = await renew(connection.refreshToken);
      } catch (e) {
        if (e instanceof YahooError && e.kind === "needs_reconnect") await store.markNeedsReconnect();
        else await store.releaseLock();
        throw e;
      }
      await store.saveTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? connection.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      return tokens.accessToken;
    }

    await wait(WAIT_MS);
  }

  throw new YahooError("temporary", "Timed out waiting for another request to renew the connection");
}
