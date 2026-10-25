import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { getRoundForPlayer, getTable, isId } from "@/server/blackjack";
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
  // Until multiplayer, a table is only visible to its owner.
  if (!table || table.ownerId !== player.id) notFound();

  const round = await getRoundForPlayer(table, player.id);
  return <BlackjackTable table={table} initialRound={round} initialChips={player.chips} />;
}
