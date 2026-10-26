import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewTableButton } from "@/components/new-table-button";
import { GAMES, gameBySlug, type GameKey } from "@/lib/games/catalog";
import { GUIDES } from "../guides";

/** One page per game guide, built ahead of time. */
export function generateStaticParams() {
  return (Object.keys(GUIDES) as GameKey[]).map((key) => ({ game: GAMES[key].path.slice(1) }));
}

export async function generateMetadata({ params }: PageProps<"/how-to-play/[game]">): Promise<Metadata> {
  const key = gameBySlug((await params).game);
  if (!key) return { title: "How to play · Namretep" };
  return { title: `How to play ${GAMES[key].name} · Namretep`, description: GUIDES[key].blurb };
}

export default async function GuidePage({ params }: PageProps<"/how-to-play/[game]">) {
  const key = gameBySlug((await params).game);
  if (!key || !(key in GUIDES)) notFound();
  const game = GAMES[key];
  const { blurb, sections, Content } = GUIDES[key];
  const others = (Object.keys(GUIDES) as GameKey[]).filter((k) => k !== key);

  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <Link href="/how-to-play" className="self-start text-sm text-neon-cyan underline underline-offset-4">
        ← All guides
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className={`font-display text-lg drop-shadow-[3px_3px_0_var(--color-ink)] ${game.text}`}>
            How to play {game.name}
          </h1>
          <p className="text-starlight/80">{blurb}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={game.path} className="pixel-btn bg-space-800 text-starlight">
            Find a table
          </Link>
          <NewTableButton game={key} label="Start a table" />
        </div>
      </div>

      <nav aria-label="On this page" className="flex flex-wrap gap-2">
        {sections.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-md border-2 border-space-700 px-3 py-1.5 font-display text-[0.6rem] text-starlight hover:border-neon-cyan"
          >
            {label}
          </a>
        ))}
      </nav>

      <Content />

      <nav aria-label="Other guides" className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-starlight/70">More guides:</span>
        {others.map((k) => (
          <Link key={k} href={`/how-to-play${GAMES[k].path}`} className={`underline underline-offset-4 ${GAMES[k].text}`}>
            {GAMES[k].name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
