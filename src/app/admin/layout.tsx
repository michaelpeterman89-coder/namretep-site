import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectBar } from "@/components/project-bar";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin · Namretep" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="pixel-panel h-64 animate-pulse" />}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}

/** Non-admins see "not found", so they never learn the admin pages exist. */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");
  return (
    <>
      <ProjectBar name="ADMIN" href="/admin" color="text-neon-gold" heading>
        <AdminNav />
      </ProjectBar>
      {children}
    </>
  );
}
