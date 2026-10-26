import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TableList } from "@/components/table-list";
import { requirePlayer } from "@/lib/auth";
import { listMyTables, listTablesFor, type GameId } from "@/server/tables";

export const metadata: Metadata = { title: "Tables · Namretep" };

const FILTERS = [
  { key: "all", label: "All games" },
  { key: "blackjack", label: "Blackjack" },
  { key: "holdem", label: "Texas Hold'em" },
  { key: "craps", label: "Craps" },
  { key: "mine", label: "My tables" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const isFilter = (value: unknown): value is Filter => FILTERS.some((f) => f.key === value);

export default function TablesPage({ searchParams }: PageProps<"/tables">) {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Tables</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/blackjack/new" className="pixel-btn bg-neon-magenta text-ink">
            New blackjack table
          </Link>
          <Link href="/poker/new" className="pixel-btn bg-neon-gold text-ink">
            New poker table
          </Link>
          <Link href="/craps/new" className="pixel-btn bg-neon-cyan text-ink">
            New craps table
          </Link>
        </div>
      </div>
      <Suspense fallback={<div className="pixel-panel h-40 animate-pulse" />}>
        <FilteredTables searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function FilteredTables({ searchParams }: { searchParams: PageProps<"/tables">["searchParams"] }) {
  const player = await requirePlayer("/tables");
  const { show } = await searchParams;
  const filter: Filter = isFilter(show) ? show : "all";

  let tables;
  if (filter === "mine") {
    tables = await listMyTables(player.id);
  } else {
    // Your own tables (including private ones) first, then public tables.
    const { mine, others } = await listTablesFor(player.id, filter === "all" ? undefined : (filter as GameId));
    tables = [...mine, ...others];
  }

  return (
    <>
      <nav aria-label="Filter tables" className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => {
          const current = key === filter;
          return (
            <Link
              key={key}
              href={key === "all" ? "/tables" : `/tables?show=${key}`}
              scroll={false}
              aria-current={current ? "page" : undefined}
              className={`rounded-md border-2 px-3 py-1.5 font-display text-[0.65rem] ${
                current ? "border-neon-gold bg-neon-gold/10 text-neon-gold" : "border-space-700 text-starlight hover:border-neon-cyan"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {tables.length > 0 ? (
        <TableList tables={tables} />
      ) : (
        <div className="pixel-panel flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-starlight/80">
            {filter === "mine"
              ? "You're not at any tables right now."
              : "No tables are open right now. Start one and others can join you."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {(filter === "all" || filter === "mine" || filter === "blackjack") && (
              <Link href="/blackjack/new" className="pixel-btn bg-neon-cyan text-ink">
                Blackjack table
              </Link>
            )}
            {(filter === "all" || filter === "mine" || filter === "holdem") && (
              <Link href="/poker/new" className="pixel-btn bg-neon-gold text-ink">
                Poker table
              </Link>
            )}
            {(filter === "all" || filter === "mine" || filter === "craps") && (
              <Link href="/craps/new" className="pixel-btn bg-neon-magenta text-ink">
                Craps table
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
