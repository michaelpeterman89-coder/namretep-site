"use client";

import { useActionState, type ReactNode } from "react";
import { AVATAR_STYLES, Avatar } from "@/components/avatar";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { AVATARS, type AvatarId } from "@/lib/avatars";
import { claimRefill, resetStats, updateProfile, type ActionState } from "./actions";

export function RefillForm({ disabledReason }: { disabledReason: ReactNode }) {
  const [state, formAction] = useActionState(claimRefill, {} as ActionState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {disabledReason ? (
        <p className="text-sm text-starlight/70">{disabledReason}</p>
      ) : (
        <SubmitButton pendingText="Refilling…">Claim daily refill</SubmitButton>
      )}
      <FormMessage error={state.error} message={state.message} />
    </form>
  );
}

export function EditProfileForm({ username, avatar }: { username: string; avatar: AvatarId }) {
  const [state, formAction] = useActionState(updateProfile, {} as ActionState);

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
        defaultValue={username}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-display text-[0.65rem] text-neon-cyan">Avatar</legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {AVATARS.map((id) => (
            <label
              key={id}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-space-700 p-2 has-checked:border-neon-gold has-checked:bg-neon-gold/10 has-focus-visible:outline-3 has-focus-visible:outline-neon-cyan"
            >
              <input type="radio" name="avatar" value={id} defaultChecked={id === avatar} className="sr-only" />
              <Avatar avatar={id} size={40} />
              <span className="text-xs">{AVATAR_STYLES[id].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage error={state.error} message={state.message} />
      <div>
        <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}

const RESET_CHOICES = [
  { game: "blackjack", label: "Clear blackjack stats", what: "your blackjack stats, On Book %, and missed plays" },
  { game: "holdem", label: "Clear poker stats", what: "your Texas Hold'em stats" },
  { game: "craps", label: "Clear craps stats", what: "your craps stats" },
  { game: "baccarat", label: "Clear baccarat stats", what: "your baccarat stats" },
  { game: "all", label: "Clear all stats", what: "all of your stats for every game" },
] as const;

export function ResetStatsForms() {
  return (
    <div className="flex flex-col gap-4">
      {RESET_CHOICES.map(({ game, label, what }) => (
        <ConfirmForm
          key={game}
          action={resetStats}
          fields={{ game }}
          label={label}
          question={`This permanently erases ${what}. Your chips stay as they are. Clear them?`}
          danger
        />
      ))}
    </div>
  );
}
