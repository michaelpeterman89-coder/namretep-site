import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { tablePath } from "@/lib/games/catalog";
import { getCrapsView, runCrapsTimeouts } from "@/server/craps";
import { canViewTable, getCrapsTable, getTable, isId } from "@/server/tables";
import { CrapsTableView } from "./craps-table";

export const metadata: Metadata = { title: "Craps · Namretep" };

export default function CrapsPage({ params }: PageProps<"/craps/[tableId]">) {
  return (
    <div className="pt-4 sm:pt-8">
      <Suspense fallback={<div className="pixel-panel h-[28rem] animate-pulse" />}>
        <CrapsContent params={params} />
      </Suspense>
    </div>
  );
}

async function CrapsContent({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const player = await requirePlayer(`/craps/${tableId}`);
  if (!isId(tableId)) notFound();

  const table = await getTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) notFound();
  if (table.game !== "craps") redirect(tablePath(table.game, table.id));

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table is closed.</p>
        <Link href="/craps" className="pixel-btn bg-neon-cyan text-ink">
          Find another table
        </Link>
      </div>
    );
  }

  // Catch up on anything that was waiting while nobody was watching.
  await runCrapsTimeouts(table);
  const view = await getCrapsView((await getCrapsTable(tableId)) ?? table, player.id);
  return <CrapsTableView initialView={view} />;
}
