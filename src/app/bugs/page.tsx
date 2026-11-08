import Link from "next/link";
import { Suspense } from "react";
import { BUG_STATUSES, isBugStatus } from "@/lib/bugs";
import { countBugReports, listBugReports } from "@/server/bugs";
import { Byline, StatusBadge } from "./bug-parts";

export default function BugsPage({ searchParams }: PageProps<"/bugs">) {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Bug reports</h1>
      <p className="max-w-2xl text-starlight/80">
        Found something broken? Anyone can read these, and you just need an account to report a bug or comment.
      </p>
      <Suspense fallback={<div className="pixel-panel h-64 animate-pulse" />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Reports({ searchParams }: { searchParams: PageProps<"/bugs">["searchParams"] }) {
  const { status: wanted, page: wantedPage } = await searchParams;
  const status = isBugStatus(wanted) ? wanted : null;
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(wantedPage)) || 1));
  const [{ reports, hasMore }, counts] = await Promise.all([listBugReports(status, page), countBugReports()]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const filters = [
    { key: null, label: "All", count: total },
    ...BUG_STATUSES.map((s) => ({ key: s.key, label: s.label, count: counts[s.key] ?? 0 })),
  ];
  const pageHref = (n: number) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (n > 1) query.set("page", String(n));
    return query.size ? `/bugs?${query}` : "/bugs";
  };

  return (
    <>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {filters.map(({ key, label, count }) => {
          const current = key === status;
          return (
            <Link
              key={label}
              href={key ? `/bugs?status=${key}` : "/bugs"}
              scroll={false}
              aria-current={current ? "page" : undefined}
              className={`rounded-md border-2 px-3 py-2.5 font-display text-[0.65rem] ${
                current ? "border-neon-gold bg-neon-gold/10 text-neon-gold" : "border-space-700 text-starlight hover:border-neon-cyan"
              }`}
            >
              {label} ({count})
            </Link>
          );
        })}
      </nav>

      {reports.length === 0 ? (
        <div className="pixel-panel p-8 text-center text-starlight/80">
          {status ? "No reports with this status." : "No bugs reported yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.id} className="pixel-panel flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <Link href={`/bugs/${r.id}`} className="min-w-0 break-words text-lg text-neon-cyan underline-offset-4 hover:underline">
                  <span className="text-starlight/60">#{r.id}</span> {r.title}
                </Link>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <Byline author={r.author} at={r.createdAt} />
                <span className="text-sm text-starlight/70">
                  {r.updates} {r.updates === 1 ? "update" : "updates"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-4 text-sm">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="p-3 text-neon-cyan underline underline-offset-4">
              Newer
            </Link>
          )}
          <span className="text-starlight/70">Page {page}</span>
          {hasMore && (
            <Link href={pageHref(page + 1)} className="p-3 text-neon-cyan underline underline-offset-4">
              Older
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
