import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fantasy · Namretep",
  description: "Fantasy sports league standings, matchups, rosters, and more.",
};

export default function FantasyHome() {
  return (
    <section className="flex flex-col items-center gap-6 pt-10 text-center sm:pt-16">
      <h1 className="font-display text-xl leading-relaxed text-starlight drop-shadow-[4px_4px_0_var(--color-ink)] sm:text-3xl">
        Fantasy <span className="text-neon-lime">among the stars</span>
      </h1>
      <p className="max-w-xl text-lg text-starlight/80">
        League standings, matchups, rosters, and transactions are on the way.
      </p>
    </section>
  );
}
