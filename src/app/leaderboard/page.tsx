import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { signed, Tile } from "@/components/stat-tile";
import { requirePlayer } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { gameName } from "@/lib/games/catalog";
import { getLeaderboard, PERIODS, type LeaderRow, type Period } from "@/server/leaderboard";

export const metadata: Metadata = { title: "Leaderboard · Namretep" };

const SHOWN = 50;

type Search = PageProps<"/leaderboard">["searchParams"];

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Leaderboard</h1>
      <Suspense fallback={<div className="pixel-panel h-96 animate-pulse" />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function FilterLink({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current ? "page" : undefined}
      className={`rounded-md border-2 px-3 py-1.5 font-display text-[0.65rem] ${
        current ? "border-neon-gold bg-neon-gold/10 text-neon-gold" : "border-space-700 text-starlight hover:border-neon-cyan"
      }`}
    >
      {children}
    </Link>
  );
}

function Player({ username, avatar }: { username: string; avatar: LeaderRow["avatar"] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar avatar={avatar} size={22} />
      <span className="truncate">{username}</span>
    </span>
  );
}

const profitColor = (n: number) => (n > 0 ? "text-neon-cyan" : n < 0 ? "text-neon-magenta" : "text-starlight/70");

async function Board({ searchParams }: { searchParams: Search }) {
  const me = await requirePlayer("/leaderboard");
  const params = await searchParams;
  const period: Period = typeof params.period === "string" && params.period in PERIODS ? (params.period as Period) : "week";
  const losers = params.sort === "losers";
  const board = await getLeaderboard(period);
  const t = board.totals;
  const r = board.records;
  const href = (p: Period, sortLosers = losers) =>
    `/leaderboard?${new URLSearchParams({ period: p, ...(sortLosers ? { sort: "losers" } : {}) })}`;

  const ranked = losers ? [...board.players].reverse() : board.players;
  const myIndex = ranked.findIndex((p) => p.id === me.id);
  const shown = ranked.slice(0, SHOWN);
  const richRank = board.richest.findIndex((p) => p.id === me.id);

  return (
    <>
      <nav aria-label="Time period" className="flex flex-wrap gap-2">
        {(Object.keys(PERIODS) as Period[]).map((p) => (
          <FilterLink key={p} href={href(p)} current={p === period}>
            {PERIODS[p]}
          </FilterLink>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Profit and loss */}
        <section aria-labelledby="pl-heading" className="pixel-panel flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="pl-heading" className="font-display text-sm text-neon-cyan">
              Profit &amp; loss · {PERIODS[period].toLowerCase()}
            </h2>
            <nav aria-label="Sort" className="flex gap-2">
              <FilterLink href={href(period, false)} current={!losers}>
                Top winners
              </FilterLink>
              <FilterLink href={href(period, true)} current={losers}>
                Biggest losers
              </FilterLink>
            </nav>
          </div>
          <p className="text-sm text-starlight/70">
            Chips won or lost at the tables. Refills and admin gifts don&apos;t count as profit. Poker results count when
            a player leaves the table.
          </p>
          {ranked.length === 0 ? (
            <p className="text-starlight/80">Nobody has played {period === "all" ? "yet" : PERIODS[period].toLowerCase()}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="text-xs text-starlight/70">
                  <tr>
                    <th className="py-2 pr-2 font-normal">#</th>
                    <th className="py-2 pr-3 font-normal">Player</th>
                    <th className="py-2 pr-3 text-right font-normal">Profit / loss</th>
                    <th className="py-2 pr-3 text-right font-normal">From site</th>
                    <th className="py-2 text-right font-normal">From admins</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-space-700">
                  {shown.map((p, i) => (
                    <PlRow key={p.id} row={p} rank={i + 1} isMe={p.id === me.id} />
                  ))}
                  {myIndex >= SHOWN && <PlRow row={ranked[myIndex]} rank={myIndex + 1} isMe />}
                </tbody>
              </table>
            </div>
          )}
          {myIndex < 0 && ranked.length > 0 && (
            <p className="text-sm text-starlight/70">You haven&apos;t played {PERIODS[period].toLowerCase()}.</p>
          )}
        </section>

        {/* Richest */}
        <section aria-labelledby="rich-heading" className="pixel-panel flex flex-col gap-4 p-5 sm:p-6">
          <h2 id="rich-heading" className="font-display text-sm text-neon-gold">
            Richest players
          </h2>
          <p className="text-sm text-starlight/70">Total chips right now, including chips on poker tables.</p>
          <ol className="flex flex-col divide-y-2 divide-space-700 text-sm">
            {board.richest.slice(0, 10).map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-3 py-2 ${p.id === me.id ? "-mx-2 rounded bg-neon-gold/10 px-2" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-starlight/60">{i + 1}</span>
                  <Player username={p.username} avatar={p.avatar} />
                </span>
                <span className="font-display text-xs text-neon-gold">{formatChips(p.chips)}</span>
              </li>
            ))}
          </ol>
          {richRank >= 10 && <p className="text-sm text-starlight/70">You&apos;re #{richRank + 1}.</p>}
        </section>
      </div>

      {/* Site totals */}
      <section aria-labelledby="site-heading" className="pixel-panel flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="site-heading" className="font-display text-sm text-neon-cyan">
          Around the site · {PERIODS[period].toLowerCase()}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Given by the site"
            value={formatChips(t.siteGiven)}
            note={`${formatChips(t.signups)} sign-up${t.signups === 1 ? "" : "s"} · ${formatChips(t.refills)} daily refill${t.refills === 1 ? "" : "s"}`}
          />
          <Tile label="Given by admins" value={formatChips(t.adminGiven)} />
          <Tile label="Taken by admins" value={formatChips(t.adminTaken)} />
          <Tile label="Chips in play" value={formatChips(t.chipsInPlay)} note="Right now" />
          <Tile label="Blackjack chips bet" value={formatChips(t.blackjackWagered)} />
          <Tile label="Craps chips bet" value={formatChips(t.crapsWagered)} />
          <Tile label="Baccarat chips bet" value={formatChips(t.baccaratWagered)} />
          <Tile
            label="House & bots"
            value={signed(-t.playersNet)}
            note={t.playersNet <= 0 ? "Ahead of the players" : "Behind the players"}
          />
          <Tile label="Players at the tables" value={formatChips(t.activePlayers)} />
          <Tile
            label="Hands & rolls"
            value={formatChips(t.blackjackRounds + t.pokerHands + t.crapsRolls + t.baccaratHands)}
            note={`${formatChips(t.blackjackRounds)} blackjack · ${formatChips(t.pokerHands)} poker · ${formatChips(t.crapsRolls)} craps rolls · ${formatChips(t.baccaratHands)} baccarat`}
          />
        </div>
      </section>

      {/* Records */}
      <section aria-labelledby="records-heading" className="pixel-panel flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="records-heading" className="font-display text-sm text-neon-gold">
          All-time records
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Biggest single win"
            value={r.biggestWin ? formatChips(r.biggestWin.amount) : "—"}
            note={r.biggestWin ? `${r.biggestWin.username} · ${gameName(r.biggestWin.game ?? "")}` : "Nobody yet"}
          />
          <Tile
            label="Biggest single loss"
            value={r.biggestLoss ? formatChips(r.biggestLoss.amount) : "—"}
            note={r.biggestLoss ? `${r.biggestLoss.username} · ${gameName(r.biggestLoss.game ?? "")}` : "Nobody yet"}
          />
          <Tile
            label="Most hands & rolls"
            value={r.mostHands ? formatChips(r.mostHands.amount) : "—"}
            note={r.mostHands?.username ?? "Nobody yet"}
          />
          <Tile
            label="Longest craps roll"
            value={r.longestRoll ? `${formatChips(r.longestRoll.amount)} rolls` : "—"}
            note={r.longestRoll ? `${r.longestRoll.username}, in one turn with the dice` : "Nobody yet"}
          />
          <Tile
            label="Best On Book %"
            value={r.bestOnBook ? `${r.bestOnBook.percent.toFixed(1)}%` : "—"}
            note={
              r.bestOnBook
                ? `${r.bestOnBook.username} · ${formatChips(r.bestOnBook.decisions)} decisions`
                : "Needs 100 blackjack decisions"
            }
          />
        </div>
        <p className="text-xs text-starlight/60">
          Records use each player&apos;s saved stats, so clearing stats removes them. Periods reset at midnight US
          Central time; weeks start on Monday.
        </p>
      </section>
    </>
  );
}

function PlRow({ row, rank, isMe }: { row: LeaderRow; rank: number; isMe: boolean }) {
  return (
    <tr className={isMe ? "bg-neon-gold/10" : undefined} aria-current={isMe ? "true" : undefined}>
      <td className="py-2 pr-2 text-starlight/60">{rank}</td>
      <td className="max-w-48 py-2 pr-3">
        <Player username={row.username} avatar={row.avatar} />
      </td>
      <td className={`py-2 pr-3 text-right font-display text-xs ${profitColor(row.profit)}`}>{signed(row.profit)}</td>
      <td className="py-2 pr-3 text-right text-starlight/80">{row.fromSite ? formatChips(row.fromSite) : "—"}</td>
      <td className="py-2 text-right text-starlight/80">{row.fromAdmins ? signed(row.fromAdmins) : "—"}</td>
    </tr>
  );
}
