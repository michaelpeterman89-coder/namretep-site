import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { houseEdge, rulesSummary } from "@/lib/games/blackjack/rules";
import { listTablesForOwner } from "@/server/blackjack";

export const metadata: Metadata = { title: "Blackjack · Namretep" };

export default function BlackjackHome() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Your tables</h1>
        <Link href="/blackjack/new" className="pixel-btn bg-neon-magenta text-ink">
          New table
        </Link>
      </div>
      <Suspense fallback={<div className="pixel-panel h-40 animate-pulse" />}>
        <TableList />
      </Suspense>
    </div>
  );
}

async function TableList() {
  const player = await requirePlayer("/blackjack");
  const tables = await listTablesForOwner(player.id);

  if (tables.length === 0) {
    return (
      <div className="pixel-panel flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-starlight/80">You don&apos;t have any tables yet. Create one and pick its rules.</p>
        <Link href="/blackjack/new" className="pixel-btn bg-neon-cyan text-ink">
          Create a table
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {tables.map((t) => (
        <li key={t.id}>
          <Link
            href={`/blackjack/${t.id}`}
            className="pixel-panel flex flex-col gap-2 p-5 transition-transform hover:-translate-y-0.5 hover:border-neon-cyan"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{t.name}</span>
              <span className="font-display text-[0.55rem] text-starlight/60">
                {t.visibility === "private" ? "Private" : "Public"}
              </span>
            </span>
            <span className="font-display text-[0.6rem] text-neon-cyan">{rulesSummary(t.rules)}</span>
            <span className="text-sm text-starlight/70">
              Bets {formatChips(t.minBet)}–{formatChips(t.maxBet)} · House edge ≈ {houseEdge(t.rules).toFixed(2)}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
