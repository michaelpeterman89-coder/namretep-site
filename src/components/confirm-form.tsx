"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage } from "@/components/form";

export type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * A button that asks "Are you sure?" before it runs. Used for anything that's
 * a pain to undo by accident.
 */
export function ConfirmForm({
  action,
  fields,
  label,
  question,
  danger = false,
  withNote = false,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  question: string;
  danger?: boolean;
  withNote?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [asking, setAsking] = useState(false);
  const color = danger ? "bg-neon-magenta text-ink" : "bg-neon-cyan text-ink";

  return (
    <form
      action={(formData) => {
        setAsking(false);
        formAction(formData);
      }}
      className="flex flex-col gap-3"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {asking ? (
        <div className="flex flex-col gap-3 rounded-md border-2 border-neon-gold/60 bg-neon-gold/5 p-3">
          <p className="text-sm">{question}</p>
          {withNote && <Field label="Reason (optional)" name="note" maxLength={200} autoFocus />}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`pixel-btn ${color}`} autoFocus={!withNote}>
              Yes, {label.toLowerCase()}
            </button>
            <button type="button" className="pixel-btn bg-space-800 text-starlight" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() => setAsking(true)}
            className={`pixel-btn ${danger ? "bg-space-800 text-neon-magenta" : "bg-space-800 text-neon-cyan"} disabled:cursor-wait disabled:opacity-70`}
          >
            {pending ? "Working…" : label}
          </button>
        </div>
      )}
      <FormMessage error={state.error} message={state.message} />
    </form>
  );
}
