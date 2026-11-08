import { Suspense } from "react";
import { requirePlayer } from "@/lib/auth";
import { NewBugForm } from "../bug-forms";

export default function NewBugPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">Report a bug</h1>
      <Suspense fallback={<div className="pixel-panel h-96 animate-pulse" />}>
        <NewBug />
      </Suspense>
    </div>
  );
}

async function NewBug() {
  await requirePlayer("/bugs/new");
  return (
    <section className="pixel-panel p-6 sm:p-8">
      <NewBugForm />
    </section>
  );
}
