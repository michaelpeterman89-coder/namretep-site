export type YahooErrorKind =
  /** This site account has no Yahoo connection. */
  | "not_connected"
  /** Yahoo refused to renew the connection, so the player has to connect again. */
  | "needs_reconnect"
  /** Yahoo turned down the request, which may mean the app isn't approved yet. */
  | "no_access"
  | "rate_limited"
  /** Yahoo answered with something we can't read. */
  | "bad_response"
  /** Worth trying again later: Yahoo was unreachable, or a renewal is stuck. */
  | "temporary";

/** `detail` is safe to show an admin and log. It must never contain a token. */
export class YahooError extends Error {
  constructor(
    readonly kind: YahooErrorKind,
    readonly detail?: string,
  ) {
    super(detail ? `Yahoo error (${kind}): ${detail}` : `Yahoo error (${kind})`);
    this.name = "YahooError";
  }
}
