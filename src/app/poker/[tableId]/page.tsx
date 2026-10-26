import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { getPokerView, runPokerTimeouts } from "@/server/poker";
import { canViewTable, getPokerTable, getTable, isId } from "@/server/tables";
import { PokerTableView } from "./poker-table";

export const metadata: Metadata = { title: "Texas Hold'em · Namretep" };

export default function PokerPage({ params }: PageProps<"/poker/[tableId]">) {
  return (
    <div className="pt-4 sm:pt-8">
      <Suspense fallback={<div className="pixel-panel h-[28rem] animate-pulse" />}>
        <PokerContent params={params} />
      </Suspense>
    </div>
  );
}

async function PokerContent({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const player = await requirePlayer(`/poker/${tableId}`);
  if (!isId(tableId)) notFound();

  const table = await getTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) notFound();
  if (table.game !== "holdem") redirect(`/blackjack/${table.id}`);

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table is closed.</p>
        <Link href="/poker" className="pixel-btn bg-neon-cyan text-ink">
          Find another table
        </Link>
      </div>
    );
  }

  // Catch up on anything that was waiting while nobody was watching.
  await runPokerTimeouts(table);
  const view = await getPokerView((await getPokerTable(tableId)) ?? table, player.id);
  return <PokerTableView initialView={view} />;
}
