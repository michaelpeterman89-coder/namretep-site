import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { getTableView, runTimeouts } from "@/server/blackjack";
import { canViewTable, getBlackjackTable, getTable, isId } from "@/server/tables";
import { BlackjackTable } from "./blackjack-table";

export const metadata: Metadata = { title: "Blackjack · Namretep" };

export default function TablePage({ params }: PageProps<"/blackjack/[tableId]">) {
  return (
    <div className="pt-4 sm:pt-8">
      <Suspense fallback={<div className="pixel-panel h-[28rem] animate-pulse" />}>
        <TableContent params={params} />
      </Suspense>
    </div>
  );
}

async function TableContent({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const player = await requirePlayer(`/blackjack/${tableId}`);
  if (!isId(tableId)) notFound();

  const table = await getTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) notFound();
  if (table.game !== "blackjack") redirect(`/poker/${table.id}`);

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table is closed.</p>
        <Link href="/lobby" className="pixel-btn bg-neon-cyan text-ink">
          Find another table
        </Link>
      </div>
    );
  }

  // Catch up on anything that timed out while nobody was watching.
  await runTimeouts(table);
  const view = await getTableView((await getBlackjackTable(tableId)) ?? table, player.id);
  return <BlackjackTable initialView={view} />;
}
