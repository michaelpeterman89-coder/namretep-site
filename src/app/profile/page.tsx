import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { LocalTime } from "@/components/local-time";
import { requirePlayer } from "@/lib/auth";
import { REFILL_LOW_THRESHOLD, formatChips, getRefillStatus } from "@/lib/chips";
import { EditProfileForm, RefillForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profile · Namretep" };

export default function ProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-6 sm:pt-12">
      <Suspense fallback={<div className="pixel-panel h-72 animate-pulse" />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

async function ProfileContent() {
  const player = await requirePlayer("/profile");
  const refill = getRefillStatus(player.chips, player.lastRefillAt, new Date());

  const disabledReason =
    refill.kind === "not-low"
      ? `Refills unlock when you drop below ${formatChips(REFILL_LOW_THRESHOLD)} chips.`
      : refill.kind === "cooldown"
        ? <>Next refill available <LocalTime iso={refill.availableAt.toISOString()} />.</>
        : null;

  return (
    <>
      <section className="pixel-panel flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <Avatar avatar={player.avatar} size={96} />
        <div className="flex flex-1 flex-col gap-3">
          <h1 className="font-display text-lg break-all text-starlight">{player.username}</h1>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-2xl text-neon-gold">{formatChips(player.chips)}</span>
            <span className="text-starlight/70">chips</span>
          </p>
        </div>
        <div className="sm:max-w-56">
          <RefillForm disabledReason={disabledReason} />
        </div>
      </section>

      <section aria-labelledby="edit-heading" className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
        <h2 id="edit-heading" className="font-display text-sm text-neon-cyan">
          Edit profile
        </h2>
        <EditProfileForm username={player.username} avatar={player.avatar} />
      </section>

      <p className="text-center text-sm text-starlight/60">Per-game stats arrive with Blackjack.</p>
    </>
  );
}
