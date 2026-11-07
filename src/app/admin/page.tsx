import Link from "next/link";
import { Suspense } from "react";
import { Tile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { getOverview, listAdminLog } from "@/server/admin";
import { getLeaderboard } from "@/server/leaderboard";
import { ClearChipStatsForm } from "./admin-forms";
import { AdminLogList } from "./admin-log-list";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<div className="pixel-panel h-64 animate-pulse" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const admin = await requireAdmin("/admin");
  const [o, recent, board] = await Promise.all([getOverview(admin.id), listAdminLog({ limit: 8 }), getLeaderboard("all")]);
  return (
    <>
      <section aria-labelledby="site-heading" className="pixel-panel flex flex-col gap-5 p-6 sm:p-8">
        <h2 id="site-heading" className="font-display text-sm text-neon-gold">
          The site right now
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Players" value={formatChips(o.players)} note={`${formatChips(o.new_this_week)} new this week`} />
          <Tile label="Admins" value={formatChips(o.admins)} />
          <Tile label="Suspended" value={formatChips(o.suspended)} />
          <Tile label="Open tables" value={formatChips(o.open_tables)} />
          <Tile label="Chips in balances" value={formatChips(o.chips_in_wallets)} />
          <Tile label="Chips on poker tables" value={formatChips(o.chips_on_tables)} />
          <Tile label="Blackjack rounds" value={formatChips(o.blackjack_rounds_today)} note="Last 24 hours" />
          <Tile label="Poker hands" value={formatChips(o.poker_hands_today)} note="Last 24 hours" />
        </div>
      </section>
      <section aria-labelledby="admin-chips-heading" className="pixel-panel flex flex-col gap-5 p-6 sm:p-8">
        <h2 id="admin-chips-heading" className="font-display text-sm text-neon-cyan">
          Admin chip stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Given by admins" value={formatChips(board.totals.adminGiven)} note="Counted on Leaders" />
          <Tile label="Taken by admins" value={formatChips(board.totals.adminTaken)} note="Counted on Leaders" />
        </div>
        <p className="text-sm text-starlight/70">
          Testing with chips? Clearing takes these out of the Leaders page without changing anyone&apos;s balance. To remove
          the chips themselves, use Take chips on the player&apos;s page first. One player&apos;s stats can be cleared from their
          page too.
        </p>
        <ClearChipStatsForm />
      </section>
      <section aria-labelledby="recent-heading" className="pixel-panel flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="recent-heading" className="font-display text-sm text-neon-cyan">
            Recent admin actions
          </h2>
          <Link href="/admin/log" className="text-sm text-neon-cyan underline underline-offset-4">
            See all
          </Link>
        </div>
        <AdminLogList lines={recent} />
      </section>
    </>
  );
}
