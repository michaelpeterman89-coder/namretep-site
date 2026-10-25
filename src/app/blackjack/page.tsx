import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TableList } from "@/components/table-list";
import { requirePlayer } from "@/lib/auth";
import { listMyTables } from "@/server/tables";

export const metadata: Metadata = { title: "Your tables · Namretep" };

export default function BlackjackHome() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Your tables</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/lobby" className="pixel-btn bg-space-800 text-starlight">
            Lobby
          </Link>
          <Link href="/blackjack/new" className="pixel-btn bg-neon-magenta text-ink">
            New table
          </Link>
        </div>
      </div>
      <Suspense fallback={<div className="pixel-panel h-40 animate-pulse" />}>
        <MyTables />
      </Suspense>
    </div>
  );
}

async function MyTables() {
  const player = await requirePlayer("/blackjack");
  const tables = await listMyTables(player.id);

  if (tables.length === 0) {
    return (
      <div className="pixel-panel flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-starlight/80">
          You don&apos;t have any tables yet. Create one and pick its rules, or join a game in the lobby.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/blackjack/new" className="pixel-btn bg-neon-cyan text-ink">
            Create a table
          </Link>
          <Link href="/lobby" className="pixel-btn bg-space-800 text-starlight">
            Open the lobby
          </Link>
        </div>
      </div>
    );
  }
  return <TableList tables={tables} />;
}
