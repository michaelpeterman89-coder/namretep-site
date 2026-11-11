import type { Metadata } from "next";
import Link from "next/link";
import { getExperiment } from "../experiments";

// The frame around every experiment: back link, title, description, credit.
// Each experiment's page.tsx wraps its own client component in this.

export function experimentMetadata(slug: string): Metadata {
  const e = getExperiment(slug);
  return { title: `${e.title} · Star Studio · Namretep`, description: e.description };
}

export function ExperimentPage({ slug, children }: { slug: string; children: React.ReactNode }) {
  const e = getExperiment(slug);
  return (
    <div className="flex flex-col gap-5 pt-6 sm:pt-10">
      <Link
        href="/studio"
        className="flex min-h-11 w-fit items-center font-display text-[0.65rem] text-neon-cyan hover:text-starlight"
      >
        ← All experiments
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-lg leading-relaxed text-neon-lime drop-shadow-[3px_3px_0_var(--color-ink)]">
          {e.title}
        </h1>
        <p className="max-w-2xl text-starlight/80">{e.description}</p>
      </div>
      {children}
      {e.inspiredBy && (
        <p className="text-sm text-starlight/60">
          Inspired by{" "}
          <a
            href={e.inspiredBy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neon-cyan underline underline-offset-4 hover:text-starlight"
          >
            {e.inspiredBy.label}
          </a>
          . Original code written for Namretep.
        </p>
      )}
    </div>
  );
}
