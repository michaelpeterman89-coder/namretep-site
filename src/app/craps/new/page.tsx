import type { Metadata } from "next";
import { CreateCrapsForm } from "./create-craps-form";

export const metadata: Metadata = { title: "New craps table · Namretep" };

export default function NewCrapsTablePage() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">New craps table</h1>
      <CreateCrapsForm />
    </div>
  );
}
