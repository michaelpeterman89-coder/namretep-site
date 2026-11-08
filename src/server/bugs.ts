import "server-only";
import type { AvatarId } from "@/lib/avatars";
import type { BugStatus } from "@/lib/bugs";
import { createAdminClient } from "@/lib/supabase/admin";
import { GameError } from "./tables";

// Bug reports are public, so reading needs no player, but only these fields of
// a player's profile ever leave this file. Writes go through SQL functions that
// check the player again, so callers only need to pass who's asking.

const PAGE_SIZE = 30;

type AuthorRow = { username: string; avatar: string; is_admin: boolean } | null;
const AUTHOR = "author:profiles!author_id(username, avatar, is_admin)";

export type BugAuthor = { username: string; avatar: AvatarId; isAdmin: boolean } | null;

const toAuthor = (row: AuthorRow): BugAuthor =>
  row && { username: row.username, avatar: row.avatar as AvatarId, isAdmin: row.is_admin };

function bugError(error: { message: string }): Error {
  const { message } = error;
  if (message.includes("TOO_MANY_POSTS")) return new GameError("You've posted a lot in the last hour. Please try again later.");
  if (message.includes("CANNOT_POST")) return new GameError("Your account can't post right now.");
  if (message.includes("NOT_ADMIN")) return new GameError("Only admins can do that.");
  if (message.includes("NO_REPORT")) return new GameError("That's already been removed.");
  return new Error(message);
}

export type BugListItem = {
  id: number;
  title: string;
  status: string;
  author: BugAuthor;
  updates: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function listBugReports(status: BugStatus | null, page: number) {
  const from = (page - 1) * PAGE_SIZE;
  let query = createAdminClient()
    .from("bug_reports")
    .select(`id, title, status, created_at, updated_at, ${AUTHOR}, bug_comments(count)`, { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  // A page number past the end (e.g. from an old link) is just an empty page.
  if (error?.code === "PGRST103") return { reports: [], hasMore: false };
  if (error) throw bugError(error);
  const reports: BugListItem[] = data.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    author: toAuthor(r.author),
    updates: r.bug_comments[0]?.count ?? 0,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }));
  return { reports, hasMore: from + reports.length < (count ?? 0) };
}

/** How many reports have each status. */
export async function countBugReports(): Promise<Record<string, number>> {
  const { data, error } = await createAdminClient().rpc("bug_report_counts");
  if (error) throw bugError(error);
  return Object.fromEntries(data.map((row) => [row.status, Number(row.reports)]));
}

export type BugComment = {
  id: number;
  author: BugAuthor;
  body: string | null;
  status: string | null;
  at: Date;
};

export type BugReport = {
  id: number;
  title: string;
  body: string;
  status: string;
  author: BugAuthor;
  createdAt: Date;
  comments: BugComment[];
};

export async function getBugReport(id: number): Promise<BugReport | null> {
  const db = createAdminClient();
  const [report, comments] = await Promise.all([
    db.from("bug_reports").select(`id, title, body, status, created_at, ${AUTHOR}`).eq("id", id).maybeSingle(),
    db
      .from("bug_comments")
      .select(`id, body, status, created_at, ${AUTHOR}`)
      .eq("report_id", id)
      .order("created_at")
      .order("id"),
  ]);
  if (report.error) throw bugError(report.error);
  if (comments.error) throw bugError(comments.error);
  if (!report.data) return null;
  return {
    id: report.data.id,
    title: report.data.title,
    body: report.data.body,
    status: report.data.status,
    author: toAuthor(report.data.author),
    createdAt: new Date(report.data.created_at),
    comments: comments.data.map((c) => ({
      id: c.id,
      author: toAuthor(c.author),
      body: c.body,
      status: c.status,
      at: new Date(c.created_at),
    })),
  };
}

export async function createBugReport(playerId: string, title: string, body: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("bug_report_create", {
    p_player: playerId,
    p_title: title,
    p_body: body,
  });
  if (error) throw bugError(error);
  return data;
}

export async function addBugComment(playerId: string, reportId: number, body: string) {
  const { error } = await createAdminClient().rpc("bug_comment_add", {
    p_player: playerId,
    p_report: reportId,
    p_body: body,
  });
  if (error) throw bugError(error);
}

/** Sets the status, posting the reply with it if there is one. */
export async function respondToBugReport(adminId: string, reportId: number, status: BugStatus, reply: string | null) {
  const { error } = await createAdminClient().rpc("bug_report_respond", {
    p_admin: adminId,
    p_report: reportId,
    p_status: status,
    p_body: reply as string,
  });
  if (error) throw bugError(error);
}

export async function deleteBugReport(adminId: string, reportId: number) {
  const { error } = await createAdminClient().rpc("bug_report_delete", { p_admin: adminId, p_report: reportId });
  if (error) throw bugError(error);
}

export async function deleteBugComment(adminId: string, commentId: number) {
  const { error } = await createAdminClient().rpc("bug_comment_delete", { p_admin: adminId, p_comment: commentId });
  if (error) throw bugError(error);
}
