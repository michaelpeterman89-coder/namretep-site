"use client";

import { useActionState } from "react";
import { AVATAR_STYLES, Avatar } from "@/components/avatar";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { AVATARS, type AvatarId } from "@/lib/avatars";
import { updateProfile, type ActionState } from "./actions";

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
