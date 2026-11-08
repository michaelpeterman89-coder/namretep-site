"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string; exact?: boolean };

/**
 * A project's menu links, for inside a ProjectBar. On phones several links drop
 * to their own row of evenly sized buttons (`columns` sets the grid, as literal
 * classes so Tailwind sees them); a single link just sits beside the name.
 * Reads the page address, so it must render inside a <Suspense> boundary.
 */
export function ProjectNav({ label, links, columns }: { label: string; links: readonly NavLink[]; columns: string }) {
  const pathname = usePathname();
  const layout =
    links.length > 1
      ? `order-last grid w-full gap-1 border-t-2 border-space-700 pt-1 md:order-none md:flex md:w-auto md:items-center md:gap-4 md:border-0 md:pt-0 lg:gap-5 ${columns}`
      : "ml-auto flex md:ml-0";
  return (
    <nav aria-label={label} className={layout}>
      {links.map(({ href, label: text, exact }) => {
        const current = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center text-center font-display text-[0.65rem] leading-normal hover:text-starlight md:whitespace-nowrap ${current ? "text-neon-gold" : "text-neon-cyan"}`}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
