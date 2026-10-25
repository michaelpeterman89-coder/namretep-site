import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { Badge } from "../badge";
import { listPlayers, PLAYER_SORTS, PLAYERS_PER_PAGE, type PlayerSort } from "@/server/admin";

type SearchParams = PageProps<"/admin/players">["searchParams"];

export default function AdminPlayersPage({ searchParams }: PageProps<"/admin/players">) {
  return (
    <Suspense fallback={<div className="pixel-panel h-96 animate-pulse" />}>
      <Players searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Players({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin("/admin/players");
  const params = await searchParams;
  const q = one(params.q).slice(0, 100);
  const sort = (one(params.sort) in PLAYER_SORTS ? one(params.sort) : "newest") as PlayerSort;
  const page = Math.max(1, Math.floor(Number(one(params.page)) || 1));
  const { players, total } = await listPlayers(q, sort, page);
  const pages = Math.max(1, Math.ceil(total / PLAYERS_PER_PAGE));
  const pageHref = (p: number) => `/admin/players?${new URLSearchParams({ q, sort, page: String(p) })}`;

  return (
    <section aria-labelledby="players-heading" className="pixel-panel flex flex-col gap-5 p-6 sm:p-8">
      <h2 id="players-heading" className="font-display text-sm text-neon-cyan">
        Players
      </h2>
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
          <span className="font-display text-[0.65rem] text-neon-cyan">Search username or email</span>
          <input name="q" type="search" defaultValue={q} className="pixel-input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[0.65rem] text-neon-cyan">Sort by</span>
          <select name="sort" defaultValue={sort} className="pixel-input">
            {Object.entries(PLAYER_SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="pixel-btn bg-neon-cyan text-ink">
          Search
        </button>
      </form>

      <p className="text-sm text-starlight/70" role="status">
        {total === 0 ? "No players match." : `${formatChips(total)} player${total === 1 ? "" : "s"}`}
      </p>

      {players.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-starlight/70">
              <tr>
                <th className="py-2 pr-3 font-normal">Player</th>
                <th className="py-2 pr-3 font-normal">Email</th>
                <th className="py-2 pr-3 text-right font-normal">Chips</th>
                <th className="py-2 pr-3 font-normal">Joined</th>
                <th className="py-2 font-normal">Last signed in</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-space-700">
              {players.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/players/${p.id}`} className="flex items-center gap-2 hover:text-neon-cyan">
                      <Avatar avatar={p.avatar} size={24} />
                      <span className="underline underline-offset-4">{p.username}</span>
                      {p.isAdmin && <Badge className="border-neon-gold text-neon-gold">Admin</Badge>}
                      {p.suspendedAt && <Badge className="border-neon-magenta text-neon-magenta">Suspended</Badge>}
                    </Link>
                  </td>
                  <td className="max-w-56 truncate py-2 pr-3 text-starlight/80">{p.email ?? "—"}</td>
                  <td className="py-2 pr-3 text-right font-display text-xs text-neon-gold">{formatChips(p.chips)}</td>
                  <td className="py-2 pr-3 text-starlight/80">
                    <LocalTime iso={p.createdAt.toISOString()} />
                  </td>
                  <td className="py-2 text-starlight/80">
                    {p.lastSignInAt ? <LocalTime iso={p.lastSignInAt.toISOString()} /> : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="text-neon-cyan underline underline-offset-4">Previous</Link> : <span />}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)} className="text-neon-cyan underline underline-offset-4">Next</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
