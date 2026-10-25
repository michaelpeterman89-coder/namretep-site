"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { signUp, type AuthFormState } from "../actions";

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, {} as AuthFormState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="Username"
        name="username"
        required
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_]+"
        autoComplete="username"
        defaultValue={state.values?.username}
        hint="3–20 letters, numbers, or underscores. Shown to other players."
      />
      <Field
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        defaultValue={state.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      />
      <FormMessage error={state.error} message={state.message} />
      <SubmitButton pendingText="Launching…">Create account</SubmitButton>
    </form>
  );
}
