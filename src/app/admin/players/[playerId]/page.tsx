import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { LocalTime } from "@/components/local-time";
import { signed, Tile } from "@/components/stat-tile";
import { requireAdmin } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { getPlayerDetail } from "@/server/admin";
import { isId } from "@/server/tables";
import { AdminLogList } from "../../admin-log-list";
import { AdjustChipsForm, AdminRoleForm, RenameForm, SuspendForm } from "../../admin-forms";
import { Badge } from "../../badge";
import { GAME_NAMES, LEDGER_REASONS } from "../../labels";

export default function AdminPlayerPage({ params }: PageProps<"/admin/players/[playerId]">) {
  return (
    <Suspense fallback={<div className="pixel-panel h-96 animate-pulse" />}>
      <PlayerContent params={params} />
    </Suspense>
  );
}

function Panel({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="pixel-panel flex flex-col gap-4 p-6 sm:p-8">
      <h2 id={id} className="font-display text-sm text-neon-cyan">
        {title}
      </h2>
      {children}
    </section>
  );
}

async function PlayerContent({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const admin = await requireAdmin(`/admin/players/${playerId}`);
  if (!isId(playerId)) notFound();
  const p = await getPlayerDetail(playerId);
  if (!p) notFound();
  const isMe = p.id === admin.id;

  return (
    <>
      <Link href="/admin/players" className="self-start text-sm text-neon-cyan underline underline-offset-4">
        ← All players
      </Link>

      <section className="pixel-panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
        <Avatar avatar={p.avatar} size={72} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-base break-all text-starlight">
            {p.username}
            {p.isAdmin && <Badge className="border-neon-gold text-neon-gold">Admin</Badge>}
            {p.suspendedAt && <Badge className="border-neon-magenta text-neon-magenta">Suspended</Badge>}
          </h2>
          <p className="break-all text-starlight/80">{p.email ?? "No email"}</p>
          <p className="text-sm text-starlight/70">
            Joined <LocalTime iso={p.createdAt.toISOString()} /> · Last signed in{" "}
            {p.lastSignInAt ? <LocalTime iso={p.lastSignInAt.toISOString()} /> : "never"}
          </p>
          {p.suspendedAt && (
            <p className="text-sm text-neon-magenta">
              Suspended <LocalTime iso={p.suspendedAt.toISOString()} />
            </p>
          )}
        </div>
        <p className="flex items-baseline gap-2">
          <span className="font-display text-2xl text-neon-gold">{formatChips(p.chips)}</span>
          <span className="text-starlight/70">chips</span>
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Give or take chips" id="chips-heading">
          <AdjustChipsForm playerId={p.id} />
        </Panel>
        <Panel title="Account" id="account-heading">
          <RenameForm playerId={p.id} username={p.username} />
          {isMe ? (
            <p className="text-sm text-starlight/70">
              This is your account. Another admin would have to change your admin access or suspend you.
            </p>
          ) : (
            <div className="flex flex-col gap-4 border-t-2 border-space-700 pt-4">
              <AdminRoleForm playerId={p.id} isAdmin={p.isAdmin} username={p.username} />
              <SuspendForm playerId={p.id} suspended={Boolean(p.suspendedAt)} username={p.username} />
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Stats" id="stats-heading">
        {p.stats.length === 0 ? (
          <p className="text-starlight/70">No games played yet.</p>
        ) : (
          p.stats.map((s) => (
            <div key={s.game} className="flex flex-col gap-2">
              <h3 className="text-sm text-neon-gold">{GAME_NAMES[s.game] ?? s.game}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label={s.game === "holdem" ? "Hands" : "Rounds"} value={formatChips(s.rounds)} />
                <Tile label="Won" value={formatChips(s.wins)} />
                <Tile label="Net chips" value={signed(s.net)} />
                <Tile label="Biggest win / loss" value={`${formatChips(s.biggestWin)} / ${formatChips(s.biggestLoss)}`} />
              </div>
            </div>
          ))
        )}
      </Panel>

      {p.seats.length > 0 && (
        <Panel title="Seated at" id="seats-heading">
          <ul className="flex flex-col gap-2">
            {p.seats.map((s) => (
              <li key={s.tableId} className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/${s.game === "holdem" ? "poker" : "blackjack"}/${s.tableId}`}
                  className="text-neon-cyan underline underline-offset-4"
                >
                  {s.tableName}
                </Link>
                <span className="text-sm text-starlight/70">
                  {GAME_NAMES[s.game]}
                  {s.stack !== null && ` · ${formatChips(s.stack)} chips on the table`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Recent chip history" id="ledger-heading">
        {p.ledger.length === 0 ? (
          <p className="text-starlight/70">No chip history.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-starlight/70">
                <tr>
                  <th className="py-2 pr-3 font-normal">When</th>
                  <th className="py-2 pr-3 font-normal">What</th>
                  <th className="py-2 pr-3 text-right font-normal">Change</th>
                  <th className="py-2 text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-space-700">
                {p.ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 pr-3 text-starlight/80">
                      <LocalTime iso={l.at.toISOString()} />
                    </td>
                    <td className="py-1.5 pr-3">{LEDGER_REASONS[l.reason] ?? l.reason}</td>
                    <td className={`py-1.5 pr-3 text-right ${l.amount < 0 ? "text-neon-magenta" : "text-neon-cyan"}`}>
                      {signed(l.amount)}
                    </td>
                    <td className="py-1.5 text-right">{formatChips(l.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-starlight/60">Last 40 changes. Their current balance is shown at the top.</p>
      </Panel>

      <Panel title="Admin history" id="history-heading">
        <AdminLogList lines={p.history} showTarget={false} />
      </Panel>
    </>
  );
}
