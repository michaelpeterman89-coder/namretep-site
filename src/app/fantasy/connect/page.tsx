import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { YahooError } from "@/lib/fantasy/yahoo/errors";
import type { YahooLeague } from "@/lib/fantasy/yahoo/leagues";
import { redirectUriFor } from "@/lib/fantasy/yahoo/oauth";
import { getYahooConnectionStatus } from "@/server/fantasy/yahoo-connection";
import { getMyYahooLeagues } from "@/server/fantasy/yahoo-read";
import { connectYahooAction, disconnectYahooAction } from "./actions";

export const metadata: Metadata = { title: "Yahoo connection · Namretep" };

const RESULTS: Record<string, { text: string; good?: boolean }> = {
  connected: { text: "Yahoo is connected.", good: true },
  declined: { text: "Yahoo wasn't connected because the request was declined." },
  expired: { text: "That login attempt expired or didn't match. Please try again." },
  failed: { text: "Yahoo couldn't be connected. Please try again." },
};

export default function YahooConnectionPage({ searchParams }: PageProps<"/fantasy/connect">) {
  return (
    <section className="flex flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Yahoo connection</h1>
      <Suspense fallback={<div className="pixel-panel h-48 animate-pulse" />}>
        <Connection searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Connection({ searchParams }: Pick<PageProps<"/fantasy/connect">, "searchParams">) {
  const admin = await requireAdmin("/fantasy/connect");
  const { yahoo } = await searchParams;
  const result = typeof yahoo === "string" ? RESULTS[yahoo] : undefined;
  const status = await getYahooConnectionStatus(admin.id);
  const canConnect = redirectUriFor(process.env.VERCEL_ENV) !== null;

  return (
    <div className="pixel-panel flex flex-col gap-5 p-5">
      {result && (
        <p role="status" className={result.good ? "text-neon-lime" : "text-neon-gold"}>
          {result.text}
        </p>
      )}

      {!status && <p className="text-starlight/80">No Yahoo account is connected.</p>}
      {status?.needsReconnect && (
        <p className="text-neon-gold">Yahoo ended this connection. Please reconnect to keep using it.</p>
      )}
      {status && !status.needsReconnect && (
        <p className="text-starlight/80">Connected since {status.connectedAt.toLocaleDateString("en-US")}.</p>
      )}

      <div className="flex flex-wrap gap-3">
        {canConnect ? (
          <form action={connectYahooAction}>
            <button type="submit" className="pixel-btn bg-neon-lime text-ink">
              {status ? "Reconnect Yahoo" : "Connect Yahoo"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-starlight/60">
            Yahoo can&apos;t return to a local dev server. Connect on the preview site; this server then uses that
            connection.
          </p>
        )}
        {status && (
          <form action={disconnectYahooAction}>
            <button type="submit" className="pixel-btn bg-space-700 text-starlight">
              Disconnect
            </button>
          </form>
        )}
      </div>

      {status && !status.needsReconnect && (
        <Suspense fallback={<p className="text-starlight/60">Loading your leagues…</p>}>
          <Leagues userId={admin.id} />
        </Suspense>
      )}
    </div>
  );
}

async function Leagues({ userId }: { userId: string }) {
  let leagues: YahooLeague[];
  try {
    leagues = await getMyYahooLeagues(userId);
  } catch (e) {
    console.error("Couldn't load Yahoo leagues", e);
    return <LeaguesError error={e} />;
  }

  if (leagues.length === 0) return <p className="text-starlight/80">Yahoo found no leagues in season.</p>;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xs text-neon-lime">Your leagues</h2>
      <ul className="flex flex-col gap-2">
        {leagues.map((league) => (
          <li key={league.leagueKey} className="border-t-2 border-space-700/70 pt-2">
            <span className="block text-starlight">{league.name}</span>
            <span className="text-sm text-starlight/60">
              {league.gameCode.toUpperCase()} {league.season} · {league.numTeams} teams · {league.scoringType} ·{" "}
              {league.leagueKey}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ERROR_TEXT: Record<YahooError["kind"], string> = {
  not_connected: "No Yahoo account is connected.",
  needs_reconnect: "Yahoo ended this connection. Please reconnect to keep using it.",
  no_access: "Yahoo turned down the request. The app may still be waiting for Yahoo's approval.",
  rate_limited: "Yahoo is limiting requests right now. Please try again in a while.",
  bad_response: "Yahoo sent a response this site can't read yet.",
  temporary: "Yahoo couldn't be reached. Please try again soon.",
};

function LeaguesError({ error }: { error: unknown }) {
  if (!(error instanceof YahooError)) return <p className="text-neon-gold">Something went wrong. Please try again.</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-neon-gold">{ERROR_TEXT[error.kind]}</p>
      {/* This page is admin-only, and the detail helps tell why Yahoo said no. */}
      {error.detail && <p className="text-sm break-words text-starlight/60">Yahoo said: {error.detail}</p>}
    </div>
  );
}
