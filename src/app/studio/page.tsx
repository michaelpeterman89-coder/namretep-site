import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EXPERIMENTS, experimentPath } from "./experiments";

export const metadata: Metadata = {
  title: "Star Studio · Namretep",
  description: "Wacky, beautiful, and interactive experiments that run right in your browser.",
};

// The gallery. Only thumbnails load here; each experiment's code loads on its own page.

export default function StudioGallery() {
  return (
    <div className="flex flex-col gap-10 pt-6 sm:pt-10">
      <section className="flex flex-col gap-3">
        <h1 className="sr-only">Star Studio</h1>
        <p className="max-w-2xl text-lg text-starlight/80">
          A cabinet of curiosities from across the galaxy: simulations, toys, and visual oddities to poke at. Pick one
          and play.
        </p>
      </section>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {EXPERIMENTS.map((e) => (
          <li key={e.slug}>
            {/* The title's link stretches over the whole card; the credit link sits above it. */}
            <article className="pixel-panel group relative flex h-full flex-col overflow-hidden border-2 border-neon-lime/60 transition-transform hover:-translate-y-1 hover:border-neon-lime focus-within:border-neon-lime">
              <Image
                src={e.thumbnail}
                alt=""
                sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                className="aspect-[4/3] w-full border-b-2 border-ink object-cover [image-rendering:pixelated]"
              />
              <div className="flex flex-1 flex-col gap-3 p-5">
                <h2 className="font-display text-sm leading-relaxed text-neon-lime">
                  <Link href={experimentPath(e.slug)} className="after:absolute after:inset-0 after:content-['']">
                    {e.title}
                  </Link>
                </h2>
                <p className="text-starlight/80">{e.description}</p>
                {e.inspiredBy && (
                  <p className="mt-auto pt-1 text-sm text-starlight/60">
                    Inspired by{" "}
                    <a
                      href={e.inspiredBy.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 text-neon-cyan underline underline-offset-4 hover:text-starlight"
                    >
                      {e.inspiredBy.label}
                    </a>
                  </p>
                )}
              </div>
            </article>
          </li>
        ))}
        <li aria-hidden className="hidden sm:block">
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border-2 border-dashed border-space-700/60 p-6 text-center font-display text-[0.6rem] text-starlight/40">
            More experiments brewing
          </div>
        </li>
      </ul>
    </div>
  );
}
