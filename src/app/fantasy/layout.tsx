import type { Metadata } from "next";
import Link from "next/link";

// Everything fantasy-only lives under /fantasy: its own menu and the Yahoo
// attribution, which Yahoo requires wherever its data is shown.

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
      <div className="mt-12 flex flex-col items-center gap-3 text-center text-sm text-starlight/60">
        <a
          href="https://sports.yahoo.com/fantasy/"
          className="text-neon-cyan underline underline-offset-4 hover:text-starlight"
        >
          Fantasy data provided by Yahoo Fantasy
        </a>
      </div>
    </>
  );
}
