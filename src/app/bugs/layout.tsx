import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectBar } from "@/components/project-bar";
import { ProjectNav } from "@/components/project-nav";

export const metadata: Metadata = { title: "Bug reports · Namretep" };

const LINKS = [
  { href: "/bugs", label: "All reports", exact: true },
  { href: "/bugs/new", label: "Report a bug" },
] as const;

export default function BugsLayout({ children }: LayoutProps<"/bugs">) {
  return (
    <>
      <ProjectBar name="BUGS" href="/bugs" color="text-neon-cyan">
        <Suspense fallback={<div className="h-11 flex-1" />}>
          <ProjectNav label="Bug reports" links={LINKS} columns="grid-cols-2" />
        </Suspense>
      </ProjectBar>
      {children}
    </>
  );
}
