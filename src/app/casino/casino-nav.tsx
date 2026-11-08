import { ProjectNav } from "@/components/project-nav";

const LINKS = [
  { href: "/casino/tables", label: "Tables", signedIn: true },
  { href: "/casino/leaderboard", label: "Leaders", signedIn: true },
  { href: "/casino/how-to-play", label: "How to play", signedIn: false },
  { href: "/casino/profile", label: "My stats", signedIn: true },
] as const;

/** The casino's own menu. Pages that need an account are left out when signed out. */
export function CasinoNav({ signedIn }: { signedIn: boolean }) {
  return (
    <ProjectNav
      label="Casino"
      links={LINKS.filter((l) => signedIn || !l.signedIn)}
      columns="grid-cols-2 min-[380px]:grid-cols-4"
    />
  );
}
