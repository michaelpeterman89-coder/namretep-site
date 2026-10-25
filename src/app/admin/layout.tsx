import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin · Namretep" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Admin</h1>
        <AdminNav />
      </div>
      {children}
    </>
  );
}
