"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/casino/tables", label: "Tables", signedIn: true },
  { href: "/casino/leaderboard", label: "Leaders", signedIn: true },
  { href: "/casino/how-to-play", label: "How to play", signedIn: false },
  { href: "/casino/profile", label: "My stats", signedIn: true },
] as const;

/** The casino's own menu. Pages that need an account are left out when signed out. */
export function CasinoNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Casino" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {LINKS.filter((l) => signedIn || !l.signedIn).map(({ href, label }) => {
        const current = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`font-display text-[0.65rem] hover:text-starlight ${current ? "text-neon-gold" : "text-neon-cyan"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
