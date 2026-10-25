"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[0.65rem] text-neon-cyan">{label}</span>
      <input className="pixel-input" {...input} />
      {hint && <span className="text-sm text-starlight/60">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children, pendingText }: { children: ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="pixel-btn bg-neon-magenta text-ink disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded border-2 border-neon-magenta bg-neon-magenta/10 px-3 py-2 text-sm">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p role="status" className="rounded border-2 border-neon-cyan bg-neon-cyan/10 px-3 py-2 text-sm">
        {message}
      </p>
    );
  }
  return null;
}
