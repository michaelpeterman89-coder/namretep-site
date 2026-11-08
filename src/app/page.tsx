import Link from "next/link";
import { PROJECTS } from "@/lib/projects";

// The front door to every Namretep project. Projects come from lib/projects,
// so a new one shows up here as soon as it's listed there.

/** A small pixel planet with a ring, drawn in CSS. */
function Planet({ color, size, ring }: { color: string; size: string; ring?: boolean }) {
  return (
    <span aria-hidden className="relative inline-block" style={{ width: size, height: size }}>
      <span className="hub-planet absolute inset-0 rounded-full" style={{ "--planet": color } as React.CSSProperties} />
      {ring && <span className="hub-ring absolute top-1/2 left-1/2" />}
    </span>
  );
}

export default function Home() {
  const live = PROJECTS.filter((p) => p.status === "live");
  const soon = PROJECTS.filter((p) => p.status === "soon");

  return (
    <div className="flex flex-col gap-12 pt-8 sm:pt-16">
      <section className="flex flex-col items-center gap-8 text-center">
        <div className="hub-orbit relative grid size-40 place-items-center sm:size-52" aria-hidden>
          <Planet color="#7b3eff" size="5rem" ring />
          <span className="hub-moon absolute">
            <Planet color="#3ef0ff" size="1.25rem" />
          </span>
        </div>
        <h1 className="font-display text-2xl leading-relaxed text-neon-gold drop-shadow-[4px_4px_0_var(--color-ink)] sm:text-4xl">
          NAMRETEP
        </h1>
        <p className="max-w-xl text-lg text-starlight/80">
          A small universe of games and projects, all in one place. One account works across every one of them.
        </p>
      </section>

      <section aria-labelledby="projects-heading" className="flex flex-col gap-5">
        <h2 id="projects-heading" className="font-display text-sm text-neon-cyan">
          Projects
        </h2>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((p) => (
            <li key={p.key}>
              <Link
                href={p.path}
                className={`pixel-panel flex h-full flex-col gap-3 border-2 p-6 transition-transform hover:-translate-y-1 ${p.border}`}
              >
                <span className={`font-display text-base ${p.text}`}>{p.name}</span>
                <span className="text-starlight/80">{p.tagline}</span>
                <span className={`mt-auto font-display text-[0.65rem] ${p.text}`}>Enter →</span>
              </Link>
            </li>
          ))}
          {soon.map((p) => (
            <li key={p.key}>
              <div className="flex h-full flex-col gap-3 rounded-lg border-2 border-dashed border-space-700 p-6">
                <span className="font-display text-base text-starlight/70">{p.name}</span>
                <span className="text-starlight/60">{p.tagline}</span>
                <span className="mt-auto font-display text-[0.65rem] text-starlight/50">Coming soon</span>
              </div>
            </li>
          ))}
          <li aria-hidden className="hidden lg:block">
            <div className="flex h-full min-h-40 items-center justify-center rounded-lg border-2 border-dashed border-space-700/60 p-6 text-center font-display text-[0.6rem] text-starlight/40">
              More on the way
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}
