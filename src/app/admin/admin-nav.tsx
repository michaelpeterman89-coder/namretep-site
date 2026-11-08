import { ProjectNav } from "@/components/project-nav";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/tables", label: "Tables" },
  { href: "/admin/log", label: "Admin log" },
] as const;

export function AdminNav() {
  return <ProjectNav label="Admin sections" links={LINKS} columns="grid-cols-2" />;
}
