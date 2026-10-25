import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import type { AdminLogLine } from "@/server/admin";
import { describeAdminAction } from "./labels";

export function AdminLogList({ lines, showTarget = true }: { lines: AdminLogLine[]; showTarget?: boolean }) {
  if (lines.length === 0) return <p className="text-starlight/70">No admin actions yet.</p>;
  return (
    <ol className="flex flex-col divide-y-2 divide-space-700">
      {lines.map((line) => (
        <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
          <span>
            <span className="text-neon-gold">{line.adminName ?? "A deleted admin"}</span> {describeAdminAction(line)}
            {showTarget && line.targetId && line.action !== "close_table" && (
              <>
                {" "}
                for{" "}
                <Link href={`/admin/players/${line.targetId}`} className="text-neon-cyan underline underline-offset-4">
                  {line.targetName ?? "a deleted player"}
                </Link>
              </>
            )}
          </span>
          <span className="text-xs text-starlight/60">
            <LocalTime iso={line.at.toISOString()} />
          </span>
        </li>
      ))}
    </ol>
  );
}
