import type { Metadata } from "next";
import Link from "next/link";

// Everything fantasy-only lives under /fantasy, with its own menu. There's no
// data source yet (see CLAUDE.md here).

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function FantasyLayout({ children }: LayoutProps<"/fantasy">) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-space-700/70 pb-3">
        <Link href="/fantasy" className="font-display text-xs text-neon-lime hover:text-starlight">
          FANTASY
        </Link>
      </div>
      {children}
    </>
  );
}
