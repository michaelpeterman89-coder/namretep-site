import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GameTables } from "@/components/game-tables";

export const metadata: Metadata = { title: "Texas Hold'em · Namretep" };

export default function PokerHome() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">
          Texas Hold&apos;em
        </h1>
        <Link href="/poker/new" className="pixel-btn bg-neon-gold text-ink">
          New poker table
        </Link>
      </div>
      <Suspense fallback={<div className="pixel-panel h-40 animate-pulse" />}>
        <GameTables game="holdem" />
      </Suspense>
    </div>
  );
}
