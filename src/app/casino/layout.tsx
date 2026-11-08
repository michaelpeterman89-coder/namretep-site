import Link from "next/link";
import { Suspense } from "react";
import { ProjectBar } from "@/components/project-bar";
import { getCurrentPlayer } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { guidePath } from "@/lib/games/catalog";
import { CasinoNav } from "./casino-nav";

// Everything casino-only lives under /casino: its own menu with the chip
// balance, and the virtual-chips notice.

export default function CasinoLayout({ children }: LayoutProps<"/casino">) {
  return (
    <>
      <ProjectBar name="CASINO" href="/casino" color="text-neon-magenta">
        {/* Reads the login cookie, so it streams in after the rest of the page. */}
        <Suspense fallback={<div className="h-11 flex-1" />}>
          <CasinoMenu />
        </Suspense>
      </ProjectBar>
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
    <>
      <CasinoNav signedIn={Boolean(player)} />
      {player && (
        <Link
          href="/casino/profile"
          className="ml-auto flex items-baseline gap-2 rounded-sm border-2 border-neon-gold/40 bg-neon-gold/10 px-2.5 py-1.5 font-display hover:border-neon-gold"
        >
          <span className="text-[0.5rem] text-starlight/80">CHIPS</span>
          <span className="text-xs text-neon-gold">{formatChips(player.chips)}</span>
        </Link>
      )}
    </>
  );
}
