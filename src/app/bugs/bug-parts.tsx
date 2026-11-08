import { Badge } from "@/app/admin/badge";
import { Avatar } from "@/components/avatar";
import { LocalTime } from "@/components/local-time";
import { bugStatus } from "@/lib/bugs";
import type { BugAuthor } from "@/server/bugs";

export function StatusBadge({ status }: { status: string }) {
  const { label, badge } = bugStatus(status);
  return <Badge className={`whitespace-nowrap ${badge}`}>{label}</Badge>;
}

/** Who posted something and when. Admins are labeled, so their replies stand out. */
export function Byline({ author, at }: { author: BugAuthor; at: Date }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-starlight/70">
      {author && <Avatar avatar={author.avatar} size={20} />}
      <span className="break-all text-starlight">{author?.username ?? "Deleted player"}</span>
      {author?.isAdmin && <Badge className="border-neon-gold text-neon-gold">Admin</Badge>}
      <LocalTime iso={at.toISOString()} />
    </span>
  );
}
