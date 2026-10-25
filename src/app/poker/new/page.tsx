import type { Metadata } from "next";
import { CreatePokerForm } from "./create-poker-form";

export const metadata: Metadata = { title: "New poker table · Namretep" };

export default function NewPokerTablePage() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">
        New Texas Hold&apos;em table
      </h1>
      <CreatePokerForm />
    </div>
  );
}
