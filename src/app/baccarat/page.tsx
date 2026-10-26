import type { Metadata } from "next";
import { Suspense } from "react";
import { GameTables } from "@/components/game-tables";
import { NewTableButton } from "@/components/new-table-button";

export const metadata: Metadata = { title: "Baccarat · Namretep" };

export default function BaccaratHome() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Baccarat</h1>
        <NewTableButton game="baccarat" />
      </div>
      <Suspense fallback={<div className="pixel-panel h-40 animate-pulse" />}>
        <GameTables game="baccarat" />
      </Suspense>
    </div>
  );
}
