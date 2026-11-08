"use client";

import { useActionState, type ComponentProps } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import {
  BUG_BODY_MAX,
  BUG_BODY_MIN,
  BUG_COMMENT_MAX,
  BUG_STATUSES,
  BUG_TITLE_MAX,
  BUG_TITLE_MIN,
} from "@/lib/bugs";
import {
  addCommentAction,
  createBugAction,
  deleteCommentAction,
  deleteReportAction,
  respondAction,
} from "./actions";

function TextArea({ label, hint, ...input }: { label: string; hint?: string } & ComponentProps<"textarea">) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[0.65rem] text-neon-cyan">{label}</span>
      <textarea className="pixel-input w-full" {...input} />
      {hint && <span className="text-sm text-starlight/60">{hint}</span>}
    </label>
  );
}

export function NewBugForm() {
  const [state, formAction] = useActionState(createBugAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Title"
        name="title"
        required
        minLength={BUG_TITLE_MIN}
        maxLength={BUG_TITLE_MAX}
        defaultValue={state.values?.title}
        hint="A short summary, e.g. “Cards freeze after I hit”."
      />
      <TextArea
        label="What happened?"
        name="body"
        required
        rows={7}
        minLength={BUG_BODY_MIN}
        maxLength={BUG_BODY_MAX}
        defaultValue={state.values?.body}
        hint="What you did, what you expected, and what happened instead. Everyone can read this, so don't include passwords or private details."
      />
      <FormMessage error={state.error} message={state.message} />
      <div>
        <SubmitButton pendingText="Sending…">Send report</SubmitButton>
      </div>
    </form>
  );
}

export function CommentForm({ reportId }: { reportId: number }) {
  const [state, formAction] = useActionState(addCommentAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="reportId" value={reportId} />
      <TextArea
        label="Add a comment"
        name="body"
        required
        rows={3}
        maxLength={BUG_COMMENT_MAX}
        defaultValue={state.values?.body}
        hint="Everyone can read this."
      />
      <FormMessage error={state.error} message={state.message} />
      <div>
        <SubmitButton pendingText="Posting…">Post comment</SubmitButton>
      </div>
    </form>
  );
}

/** Admins only: set the status and reply in one go. */
export function RespondForm({ reportId, status }: { reportId: number; status: string }) {
  const [state, formAction] = useActionState(respondAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="reportId" value={reportId} />
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-[0.65rem] text-neon-cyan">Status</span>
        <select name="status" defaultValue={status} key={status} className="pixel-input w-full sm:w-64">
          {BUG_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <TextArea
        label="Reply (optional)"
        name="body"
        rows={3}
        maxLength={BUG_COMMENT_MAX}
        defaultValue={state.values?.body}
        hint="Posted publicly with your name and an Admin label."
      />
      <FormMessage error={state.error} message={state.message} />
      <div>
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteReportForm({ reportId }: { reportId: number }) {
  return (
    <ConfirmForm
      action={deleteReportAction}
      fields={{ reportId: String(reportId) }}
      label="Delete report"
      question="Delete this report and all its comments for everyone? This can't be undone, and it goes in the admin log."
      danger
    />
  );
}

export function DeleteCommentForm({ commentId }: { commentId: number }) {
  return (
    <ConfirmForm
      action={deleteCommentAction}
      fields={{ commentId: String(commentId) }}
      label="Delete comment"
      question="Delete this comment for everyone? This can't be undone, and it goes in the admin log."
      danger
    />
  );
}
