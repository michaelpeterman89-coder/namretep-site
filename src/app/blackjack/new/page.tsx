import type { Metadata } from "next";
import { CreateTableForm } from "./create-table-form";

export const metadata: Metadata = { title: "New blackjack table · Namretep" };

export default function NewTablePage() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">
        New blackjack table
      </h1>
      <CreateTableForm />
    </div>
  );
}
