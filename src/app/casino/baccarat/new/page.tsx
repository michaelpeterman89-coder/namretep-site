import type { Metadata } from "next";
import { CreateBaccaratForm } from "./create-baccarat-form";

export const metadata: Metadata = { title: "New baccarat table · Namretep" };

export default function NewBaccaratTablePage() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">New baccarat table</h1>
      <CreateBaccaratForm />
    </div>
  );
}
