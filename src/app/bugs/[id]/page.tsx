import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentPlayer } from "@/lib/auth";
import { bugStatus, parseBugId } from "@/lib/bugs";
import { getBugReport } from "@/server/bugs";
import { CommentForm, DeleteCommentForm, DeleteReportForm, RespondForm } from "../bug-forms";
import { Byline, StatusBadge } from "../bug-parts";

export default function BugPage({ params }: PageProps<"/bugs/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-6 sm:pt-10">
      <Suspense fallback={<div className="pixel-panel h-96 animate-pulse" />}>
        <Report params={params} />
      </Suspense>
    </div>
  );
}

async function Report({ params }: { params: PageProps<"/bugs/[id]">["params"] }) {
  const { id } = await params;
  const reportId = parseBugId(id);
  if (!reportId) notFound();
  const [report, player] = await Promise.all([getBugReport(reportId), getCurrentPlayer()]);
  if (!report) notFound();
  const isAdmin = Boolean(player?.isAdmin);

  return (
    <>
      <section className="pixel-panel flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 text-xl break-words text-starlight">
            <span className="text-starlight/60">#{report.id}</span> {report.title}
          </h1>
          <StatusBadge status={report.status} />
        </div>
        <Byline author={report.author} at={report.createdAt} />
        <p className="break-words whitespace-pre-wrap text-starlight/90">{report.body}</p>
      </section>

      {report.comments.length > 0 && (
        <ol aria-label="Comments and updates" className="flex flex-col gap-3">
          {report.comments.map((c) => (
            <li
              key={c.id}
              className={`flex flex-col gap-2 rounded-md border-2 bg-space-900/85 p-4 ${
                c.author?.isAdmin ? "border-neon-gold/50" : "border-space-700"
              }`}
            >
              <Byline author={c.author} at={c.at} />
              {c.status && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-starlight/80">
                  Marked this as <StatusBadge status={c.status} />
                  <span className="sr-only">{bugStatus(c.status).label}</span>
                </p>
              )}
              {c.body && <p className="break-words whitespace-pre-wrap">{c.body}</p>}
              {isAdmin && c.body && <DeleteCommentForm commentId={c.id} />}
            </li>
          ))}
        </ol>
      )}

      {isAdmin ? (
        <section aria-labelledby="respond-heading" className="pixel-panel flex flex-col gap-4 p-6 sm:p-8">
          <h2 id="respond-heading" className="font-display text-sm text-neon-gold">
            Respond
          </h2>
          <RespondForm reportId={report.id} status={report.status} />
          <div className="border-t-2 border-space-700 pt-4">
            <DeleteReportForm reportId={report.id} />
          </div>
        </section>
      ) : player ? (
        <section className="pixel-panel p-6 sm:p-8">
          <CommentForm reportId={report.id} />
        </section>
      ) : (
        <p className="pixel-panel p-6 text-center text-starlight/80">
          <Link
            href={`/login?next=${encodeURIComponent(`/bugs/${report.id}`)}`}
            className="text-neon-cyan underline underline-offset-4"
          >
            Log in
          </Link>{" "}
          to comment.
        </p>
      )}
    </>
  );
}
