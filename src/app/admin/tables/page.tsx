import Link from "next/link";
import { Suspense } from "react";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/auth";
import { listOpenTables } from "@/server/admin";
import { CloseTableForm } from "../admin-forms";
import { gameName, tablePath } from "@/lib/games/catalog";

export default function AdminTablesPage() {
  return (
    <Suspense fallback={<div className="pixel-panel h-64 animate-pulse" />}>
      <Tables />
    </Suspense>
  );
}

async function Tables() {
  await requireAdmin("/admin/tables");
  const tables = await listOpenTables();
  return (
    <section aria-labelledby="tables-heading" className="pixel-panel flex flex-col gap-4 p-6 sm:p-8">
      <h2 id="tables-heading" className="font-display text-sm text-neon-cyan">
        Open tables
      </h2>
      <p className="text-sm text-starlight/70">
        Every open table, public and private. You can only close a table between hands.
      </p>
      {tables.length === 0 ? (
        <p className="text-starlight/70">No tables are open.</p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-space-700">
          {tables.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={tablePath(t.game, t.id)}
                  className="break-all text-neon-cyan underline underline-offset-4"
                >
                  {t.name}
                </Link>
                <span className="text-sm text-starlight/80">
                  {gameName(t.game)} · {t.visibility === "public" ? "Public" : "Private"} · made by {t.ownerName}
                </span>
                <span className="text-sm text-starlight/70">
                  {t.seated} of {t.seats} seats taken{t.bots > 0 && ` + ${t.bots} bot${t.bots === 1 ? "" : "s"}`} · last
                  active <LocalTime iso={t.lastActivityAt.toISOString()} />
                </span>
              </div>
              <CloseTableForm tableId={t.id} name={t.name} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
