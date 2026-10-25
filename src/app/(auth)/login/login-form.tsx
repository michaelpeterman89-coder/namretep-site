"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { logIn, type AuthFormState } from "../actions";

export function LoginForm() {
  const [state, formAction] = useActionState(logIn, {} as AuthFormState);
  const next = useSearchParams().get("next") ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        defaultValue={state.values?.email}
      />
      <Field label="Password" name="password" type="password" required autoComplete="current-password" />
      <FormMessage error={state.error} message={state.message} />
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
