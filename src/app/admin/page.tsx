import Link from "next/link";
import { Suspense } from "react";
import { Tile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { getOverview, listAdminLog } from "@/server/admin";
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
  const [o, recent] = await Promise.all([getOverview(admin.id), listAdminLog({ limit: 8 })]);
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
