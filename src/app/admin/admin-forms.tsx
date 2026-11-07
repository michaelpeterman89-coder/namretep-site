"use client";

import { useActionState } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import {
  adjustChipsAction,
  clearChipStatsAction,
  closeTableAdminAction,
  renameAction,
  setAdminAction,
  setSuspendedAction,
} from "./actions";

export function AdjustChipsForm({ playerId }: { playerId: string }) {
  const [state, formAction] = useActionState(adjustChipsAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="playerId" value={playerId} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Give or take</legend>
        {(["give", "take"] as const).map((direction) => (
          <label
            key={direction}
            className="cursor-pointer rounded-md border-2 border-space-700 px-3 py-1.5 font-display text-[0.65rem] has-checked:border-neon-gold has-checked:bg-neon-gold/10 has-focus-visible:outline-3 has-focus-visible:outline-neon-cyan"
          >
            <input type="radio" name="direction" value={direction} defaultChecked={direction === "give"} className="sr-only" />
            {direction === "give" ? "Give chips" : "Take chips"}
          </label>
        ))}
      </fieldset>
      <Field label="Amount" name="amount" type="number" required min={1} max={100_000_000} step={1} inputMode="numeric" />
      <Field label="Note (optional)" name="note" maxLength={200} hint="Saved in the admin log, e.g. “tournament prize”." />
      <FormMessage error={state.error} message={state.message} />
      <div>
        <SubmitButton pendingText="Saving…">Apply</SubmitButton>
      </div>
    </form>
  );
}

export function ClearChipStatsForm({ playerId, username }: { playerId?: string; username?: string }) {
  return (
    <ConfirmForm
      action={clearChipStatsAction}
      fields={playerId ? { playerId } : {}}
      label={playerId ? "Clear their admin chip stats" : "Clear admin chip stats for everyone"}
      question={`Stop past admin chip changes counting on the Leaders page${username ? ` for ${username}` : " for everyone"}? Balances and the chip history stay as they are, and this goes in the admin log. New changes count from now on.`}
      danger
    />
  );
}

export function RenameForm({ playerId, username }: { playerId: string; username: string }) {
  const [state, formAction] = useActionState(renameAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="playerId" value={playerId} />
      <Field
        label="Username"
        name="username"
        required
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_]+"
        defaultValue={username}
        key={username}
      />
      <FormMessage error={state.error} message={state.message} />
      <div>
        <SubmitButton pendingText="Saving…">Rename</SubmitButton>
      </div>
    </form>
  );
}

export function AdminRoleForm({ playerId, isAdmin, username }: { playerId: string; isAdmin: boolean; username: string }) {
  return isAdmin ? (
    <ConfirmForm
      action={setAdminAction}
      fields={{ playerId, makeAdmin: "false" }}
      label="Remove admin"
      question={`Remove ${username}'s admin access?`}
      danger
    />
  ) : (
    <ConfirmForm
      action={setAdminAction}
      fields={{ playerId, makeAdmin: "true" }}
      label="Make admin"
      question={`Make ${username} an admin? They'll be able to change anyone's chips, suspend accounts, and make other admins.`}
    />
  );
}

export function SuspendForm({ playerId, suspended, username }: { playerId: string; suspended: boolean; username: string }) {
  return suspended ? (
    <ConfirmForm
      action={setSuspendedAction}
      fields={{ playerId, suspend: "false" }}
      label="Restore account"
      question={`Let ${username} log in and play again?`}
    />
  ) : (
    <ConfirmForm
      action={setSuspendedAction}
      fields={{ playerId, suspend: "true" }}
      label="Suspend account"
      question={`Suspend ${username}? They're logged out of everything, can't log back in, and are taken off their tables (poker chips go back to their balance).`}
      danger
      withNote
    />
  );
}

export function CloseTableForm({ tableId, name }: { tableId: string; name: string }) {
  return (
    <ConfirmForm
      action={closeTableAdminAction}
      fields={{ tableId }}
      label="Close"
      question={`Close “${name}”? Everyone is unseated. Poker players get their chips back, and a poker hand in progress is called off. Other games finish the hand in play first.`}
      danger
    />
  );
}
