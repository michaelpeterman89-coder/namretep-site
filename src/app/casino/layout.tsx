import Link from "next/link";
import { Suspense } from "react";
import { getCurrentPlayer } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { guidePath } from "@/lib/games/catalog";
import { CasinoNav } from "./casino-nav";

// Everything casino-only lives under /casino: its own menu with the chip
// balance, and the virtual-chips notice.

export default function CasinoLayout({ children }: LayoutProps<"/casino">) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-space-700/70 pb-3">
        <Link href="/casino" className="font-display text-xs text-neon-magenta hover:text-starlight">
          CASINO
        </Link>
        {/* Reads the login cookie, so it streams in after the rest of the page. */}
        <Suspense fallback={<div className="h-8 w-48" />}>
          <CasinoMenu />
        </Suspense>
      </div>
      {children}
      <div className="mt-12 flex flex-col items-center gap-3 text-center text-sm text-starlight/60">
        <p>Virtual chips only. No real money, no purchases, no cash-out.</p>
        <Link href={guidePath()} className="text-neon-cyan underline underline-offset-4 hover:text-starlight">
          How to play
        </Link>
      </div>
    </>
  );
}

async function CasinoMenu() {
  const player = await getCurrentPlayer();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <CasinoNav signedIn={Boolean(player)} />
      {player && (
        <Link
          href="/casino/profile"
          className="font-display text-xs text-neon-gold hover:text-starlight"
          aria-label={`Your chips: ${formatChips(player.chips)}`}
        >
          {formatChips(player.chips)}
        </Link>
      )}
    </div>
  );
}
