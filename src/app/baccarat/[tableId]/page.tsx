import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { tablePath } from "@/lib/games/catalog";
import { dealIfReady, getBaccaratView } from "@/server/baccarat";
import { canViewTable, getBaccaratTable, getTable, isId } from "@/server/tables";
import { BaccaratTableView } from "./baccarat-table";

export const metadata: Metadata = { title: "Baccarat · Namretep" };

export default function BaccaratPage({ params }: PageProps<"/baccarat/[tableId]">) {
  return (
    <div className="pt-4 sm:pt-8">
      <Suspense fallback={<div className="pixel-panel h-[28rem] animate-pulse" />}>
        <BaccaratContent params={params} />
      </Suspense>
    </div>
  );
}

async function BaccaratContent({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const player = await requirePlayer(`/baccarat/${tableId}`);
  if (!isId(tableId)) notFound();

  const table = await getTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) notFound();
  if (table.game !== "baccarat") redirect(tablePath(table.game, table.id));

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table is closed.</p>
        <Link href="/baccarat" className="pixel-btn bg-neon-cyan text-ink">
          Find another table
        </Link>
      </div>
    );
  }

  // Deal anything that was waiting while nobody was watching.
  await dealIfReady(table);
  const view = await getBaccaratView((await getBaccaratTable(tableId)) ?? table, player.id);
  return <BaccaratTableView initialView={view} />;
}
