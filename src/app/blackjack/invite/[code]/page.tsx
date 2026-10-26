import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { tablePath } from "@/lib/games/catalog";
import { getTable, joinByInvite } from "@/server/tables";

export const metadata: Metadata = { title: "Table invite · Namretep" };

export default function InvitePage({ params }: PageProps<"/blackjack/invite/[code]">) {
  return (
    <div className="pt-6 sm:pt-12">
      <Suspense fallback={<div className="pixel-panel mx-auto h-40 max-w-md animate-pulse" />}>
        <AcceptInvite params={params} />
      </Suspense>
    </div>
  );
}

async function AcceptInvite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const player = await requirePlayer(`/blackjack/invite/${encodeURIComponent(code)}`);
  const tableId = await joinByInvite(code, player.id);
  if (tableId) {
    const table = await getTable(tableId);
    redirect(tablePath(table?.game ?? "blackjack", tableId));
  }

  return (
    <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <h1 className="font-display text-base text-starlight">Invite not found</h1>
      <p className="text-starlight/70">This invite link is wrong, or the table has closed.</p>
      <Link href="/tables" className="pixel-btn bg-neon-cyan text-ink">
        Find another table
      </Link>
    </div>
  );
}
