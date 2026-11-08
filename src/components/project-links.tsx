"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROJECTS } from "@/lib/projects";

/** The site header's link to each live project, with the one you're in underlined. */
export function ProjectLinks({ className }: { className: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Projects" className={`flex min-w-0 flex-wrap items-center gap-x-3 sm:gap-x-5 ${className}`}>
      {PROJECTS.filter((p) => p.status === "live").map((p) => {
        const current = pathname === p.path || pathname.startsWith(`${p.path}/`);
        return (
          <Link
            key={p.key}
            href={p.path}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-11 items-center border-y-[3px] border-t-transparent font-display text-[0.65rem] hover:text-starlight ${
              current ? `border-b-current ${p.text}` : "border-b-transparent text-starlight/80"
            }`}
          >
            {p.name}
          </Link>
        );
      })}
    </nav>
  );
}
