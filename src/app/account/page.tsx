import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { logOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import { requirePlayer } from "@/lib/auth";
import { PROJECTS } from "@/lib/projects";
import { EditProfileForm } from "./edit-profile-form";

export const metadata: Metadata = { title: "Account · Namretep" };

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-6 sm:pt-12">
      <Suspense fallback={<div className="pixel-panel h-72 animate-pulse" />}>
        <AccountContent />
      </Suspense>
    </div>
  );
}

async function AccountContent() {
  const player = await requirePlayer("/account");
  const live = PROJECTS.filter((p) => p.status === "live");

  return (
    <>
      <section className="pixel-panel flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <Avatar avatar={player.avatar} size={96} />
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="font-display text-lg break-all text-starlight">{player.username}</h1>
          <p className="text-starlight/70">One account for every Namretep project.</p>
        </div>
      </section>

      <section aria-labelledby="projects-heading" className="pixel-panel flex flex-col gap-4 p-6 sm:p-8">
        <h2 id="projects-heading" className="font-display text-sm text-neon-cyan">
          Your projects
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {live.map((p) => (
            <li key={p.key}>
              <Link
                href={p.accountPath ?? p.path}
                className={`flex flex-col gap-1 rounded-md border-2 bg-space-950/60 px-4 py-3 ${p.border}`}
              >
                <span className={`font-display text-xs ${p.text}`}>{p.name}</span>
                <span className="text-sm text-starlight/80">{p.accountNote ?? p.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="edit-heading" className="pixel-panel flex flex-col gap-6 p-6 sm:p-8">
        <h2 id="edit-heading" className="font-display text-sm text-neon-cyan">
          Edit profile
        </h2>
        <EditProfileForm username={player.username} avatar={player.avatar} />
      </section>

      <form action={logOut} className="flex justify-center">
        <button type="submit" className="pixel-btn bg-space-800 text-starlight">
          Log out
        </button>
      </form>
    </>
  );
}
