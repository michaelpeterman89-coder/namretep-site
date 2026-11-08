"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { cleanBugText, isBugStatus, parseBugId, validateBugComment, validateBugReport } from "@/lib/bugs";
import {
  addBugComment,
  createBugReport,
  deleteBugComment,
  deleteBugReport,
  respondToBugReport,
} from "@/server/bugs";
import { GameError } from "@/server/tables";

// Server actions are public endpoints: check who's calling every time, and
// never trust the form's values.

export type BugFormState = { error?: string; message?: string; values?: { title?: string; body?: string } };

function failed(e: unknown, values?: BugFormState["values"]): BugFormState {
  if (e instanceof GameError) return { error: e.message, values };
  console.error("Bug report action failed", e);
  return { error: "Something went wrong. Please try again.", values };
}

export async function createBugAction(_prev: BugFormState, formData: FormData): Promise<BugFormState> {
  const title = cleanBugText(formData.get("title"));
  const body = cleanBugText(formData.get("body"));
  const values = { title, body };
  const player = await getCurrentPlayer();
  if (!player) return { error: "Log in to report a bug.", values };
  const invalid = validateBugReport(title, body);
  if (invalid) return { error: invalid, values };

  let id: number;
  try {
    id = await createBugReport(player.id, title, body);
  } catch (e) {
    return failed(e, values);
  }
  redirect(`/bugs/${id}`);
}

export async function addCommentAction(_prev: BugFormState, formData: FormData): Promise<BugFormState> {
  const body = cleanBugText(formData.get("body"));
  const values = { body };
  const player = await getCurrentPlayer();
  if (!player) return { error: "Log in to comment.", values };
  const reportId = parseBugId(formData.get("reportId"));
  if (!reportId) return { error: "That report doesn't exist.", values };
  const invalid = validateBugComment(body);
  if (invalid) return { error: invalid, values };

  try {
    await addBugComment(player.id, reportId, body);
    refresh();
    return {};
  } catch (e) {
    return failed(e, values);
  }
}

export async function respondAction(_prev: BugFormState, formData: FormData): Promise<BugFormState> {
  const body = cleanBugText(formData.get("body"));
  const values = { body };
  const admin = await getCurrentPlayer();
  if (!admin?.isAdmin) return { error: "Only admins can do that.", values };
  const reportId = parseBugId(formData.get("reportId"));
  const status = formData.get("status");
  if (!reportId || !isBugStatus(status)) return { error: "That report or status doesn't exist.", values };
  const invalid = body ? validateBugComment(body) : null;
  if (invalid) return { error: invalid, values };

  try {
    await respondToBugReport(admin.id, reportId, status, body || null);
    refresh();
    return { message: "Saved." };
  } catch (e) {
    return failed(e, values);
  }
}

export async function deleteReportAction(_prev: BugFormState, formData: FormData): Promise<BugFormState> {
  const admin = await getCurrentPlayer();
  if (!admin?.isAdmin) return { error: "Only admins can do that." };
  const reportId = parseBugId(formData.get("reportId"));
  if (!reportId) return { error: "That report doesn't exist." };

  try {
    await deleteBugReport(admin.id, reportId);
  } catch (e) {
    return failed(e);
  }
  redirect("/bugs");
}

export async function deleteCommentAction(_prev: BugFormState, formData: FormData): Promise<BugFormState> {
  const admin = await getCurrentPlayer();
  if (!admin?.isAdmin) return { error: "Only admins can do that." };
  const commentId = parseBugId(formData.get("commentId"));
  if (!commentId) return { error: "That comment doesn't exist." };

  try {
    await deleteBugComment(admin.id, commentId);
    refresh();
    return {};
  } catch (e) {
    return failed(e);
  }
}
