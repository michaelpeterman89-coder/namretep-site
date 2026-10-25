import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TableList } from "@/components/table-list";
import { requirePlayer } from "@/lib/auth";
import { listLobbyTables } from "@/server/tables";

export const metadata: Metadata = { title: "Lobby · Namretep" };

export default function LobbyPage() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Lobby</h1>
        <Link href="/blackjack/new" className="pixel-btn bg-neon-magenta text-ink">
          New table
        </Link>
      </div>
      <p className="text-starlight/70">Public tables open right now. Pick one to watch or take a seat.</p>
      <Suspense fallback={<div className="pixel-panel h-40 animate-pulse" />}>
        <LobbyTables />
      </Suspense>
    </div>
  );
}

async function LobbyTables() {
  await requirePlayer("/lobby");
  const tables = await listLobbyTables();
  if (tables.length === 0) {
    return (
      <div className="pixel-panel flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-starlight/80">No public tables are open. Start one and others can join you.</p>
        <Link href="/blackjack/new" className="pixel-btn bg-neon-cyan text-ink">
          Create a public table
        </Link>
      </div>
    );
  }
  return <TableList tables={tables} />;
}
