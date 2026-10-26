import type { Metadata } from "next";
import Link from "next/link";
import { GAMES, PLANNED_GAMES, type GameKey } from "@/lib/games/catalog";
import { REFILL_LOW_THRESHOLD, STARTING_CHIPS, formatChips } from "@/lib/chips";
import { Bullets, Section } from "./guide-parts";
import { GUIDES } from "./guides";

export const metadata: Metadata = {
  title: "How to play · Namretep",
  description: "Rules, bets, payouts, and tips for every game on Namretep.",
};

export default function HowToPlayPage() {
  return (
    <div className="flex flex-col gap-6 pt-6 sm:pt-10">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-lg text-starlight drop-shadow-[3px_3px_0_var(--color-ink)]">How to play</h1>
        <p className="max-w-2xl text-starlight/80">
          New to a game, or to Namretep? Start with the basics below, then open the guide for any game: the rules, every
          bet and what it pays, the table settings, and the controls.
        </p>
      </div>

      <section aria-labelledby="games-heading" className="flex flex-col gap-4">
        <h2 id="games-heading" className="font-display text-sm text-neon-cyan">
          Game guides
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(GUIDES) as GameKey[]).map((key) => {
            const game = GAMES[key];
            return (
              <li key={key}>
                <Link
                  href={`/how-to-play${game.path}`}
                  className="pixel-panel flex h-full flex-col gap-2 p-5 transition-transform hover:-translate-y-0.5"
                >
                  <span className={`font-display text-sm ${game.text}`}>{game.name}</span>
                  <span className="text-sm text-starlight/80">{GUIDES[key].blurb}</span>
                  <span className={`mt-auto font-display text-[0.6rem] ${game.text}`}>Read the guide →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <Section id="basics" title="Namretep basics">
        <Bullets>
          <li>
            <strong>Virtual chips only.</strong> There&apos;s no real money here: nothing to buy and nothing to cash out.
          </li>
          <li>
            Every account starts with <strong>{formatChips(STARTING_CHIPS)} chips</strong>. If you drop below{" "}
            {formatChips(REFILL_LOW_THRESHOLD)}, you can claim a free refill back to {formatChips(STARTING_CHIPS)} on
            your profile once every 24 hours, so you can always keep playing.
          </li>
          <li>
            <strong>Tables</strong> lists every open table. Pick a game to see just its tables, or start your own with
            the rules you like.
          </li>
          <li>
            A table can be <strong>public</strong> (listed for everyone) or <strong>private</strong> (only people with
            your invite link can join). Make a one-seat private table to play solo.
          </li>
          <li>
            Playing with others? Each game has short timers so nobody waits forever. Playing alone, there are none.
          </li>
          <li>
            Your <strong>profile</strong> keeps stats for every game. <strong>Start fresh</strong> clears a game&apos;s
            stats (your chips stay put).
          </li>
          <li>
            The <strong>Leaders</strong> page ranks profit and loss by day, week, month, year, and all time, plus the
            richest players and all-time records.
          </li>
          <li>
            Sound and the retro screen effect can be switched off at the bottom of any page. The site follows your
            device&apos;s reduced-motion setting.
          </li>
        </Bullets>
      </Section>

      <Section id="coming" title="Coming later">
        <p>These are planned. Each will get its own guide here when it opens.</p>
        <ul className="flex flex-col gap-2">
          {PLANNED_GAMES.map((g) => (
            <li key={g.name}>
              <strong>{g.name}</strong> <span className="text-starlight/70">— {g.note}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
