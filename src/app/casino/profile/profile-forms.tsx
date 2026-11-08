"use client";

import { useActionState, type ReactNode } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { FormMessage, SubmitButton } from "@/components/form";
import { claimRefill, resetStats, type ActionState } from "./actions";

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
