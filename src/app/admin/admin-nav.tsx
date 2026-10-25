"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/tables", label: "Tables" },
  { href: "/admin/log", label: "Admin log" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
      {LINKS.map(({ href, label }) => {
        const current = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-md border-2 px-3 py-1.5 font-display text-[0.65rem] ${
              current ? "border-neon-gold bg-neon-gold/10 text-neon-gold" : "border-space-700 text-starlight hover:border-neon-cyan"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
