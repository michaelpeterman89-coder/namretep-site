import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { listAdminLog } from "@/server/admin";
import { AdminLogList } from "../admin-log-list";

export default function AdminLogPage() {
  return (
    <Suspense fallback={<div className="pixel-panel h-64 animate-pulse" />}>
      <Log />
    </Suspense>
  );
}

async function Log() {
  await requireAdmin("/admin/log");
  const lines = await listAdminLog({ limit: 200 });
  return (
    <section aria-labelledby="log-heading" className="pixel-panel flex flex-col gap-4 p-6 sm:p-8">
      <h2 id="log-heading" className="font-display text-sm text-neon-cyan">
        Admin log
      </h2>
      <p className="text-sm text-starlight/70">Every change an admin makes, newest first (last 200).</p>
      <AdminLogList lines={lines} />
    </section>
  );
}
