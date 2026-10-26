import Link from "next/link";

// Playable games use their own color (see GAMES in lib/games/catalog).
const games: { name: string; status: string; accent: string; border?: string; href?: string }[] = [
  { name: "Blackjack", status: "Play now", accent: "text-neon-magenta", border: "border-neon-magenta hover:bg-neon-magenta/10", href: "/blackjack" },
  { name: "Roulette", status: "Later", accent: "text-starlight/70" },
  { name: "Craps", status: "Play now", accent: "text-neon-cyan", border: "border-neon-cyan hover:bg-neon-cyan/10", href: "/craps" },
  { name: "Baccarat", status: "Play now", accent: "text-neon-lime", border: "border-neon-lime hover:bg-neon-lime/10", href: "/baccarat" },
  { name: "Texas Hold'em", status: "Play now", accent: "text-neon-gold", border: "border-neon-gold hover:bg-neon-gold/10", href: "/poker" },
  { name: "Video Poker", status: "Later", accent: "text-starlight/70" },
];

function PixelCard({ rank, suit, red, tilt }: { rank: string; suit: string; red?: boolean; tilt: string }) {
  return (
    <div
      className={`pixel-card flex h-32 w-22 flex-col justify-between p-2 font-display sm:h-40 sm:w-28 ${
        red ? "text-neon-magenta" : "text-ink"
      }`}
      style={{ "--tilt": tilt } as React.CSSProperties}
    >
      <span className="text-sm">{rank}</span>
      <span className="self-center text-3xl sm:text-4xl">{suit}</span>
      <span className="rotate-180 text-sm">{rank}</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-12 pt-6 sm:pt-12">
      <section className="flex flex-col items-center gap-8 text-center">
        <div className="flex gap-4" aria-hidden>
          <PixelCard rank="A" suit="♠" tilt="-6deg" />
          <PixelCard rank="K" suit="♥" red tilt="5deg" />
        </div>
        <h1 className="font-display text-xl leading-relaxed text-starlight drop-shadow-[4px_4px_0_var(--color-ink)] sm:text-3xl">
          Casino games <span className="text-neon-magenta">among the stars</span>
        </h1>
        <p className="max-w-xl text-lg text-starlight/80">
          Create a table, set the rules your way, and play solo or with friends. Track your stats
          and see how often you play by the book.
        </p>
        <Link href="/signup" className="pixel-btn bg-neon-magenta text-ink">
          Get 10,000 free chips
        </Link>
        <p className="font-display text-xs text-neon-gold">Virtual chips only</p>
      </section>

      <section aria-labelledby="games-heading" className="pixel-panel p-5 sm:p-8">
        <h2 id="games-heading" className="mb-6 font-display text-sm text-neon-cyan">
          Games
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <li key={game.name}>
              {game.href ? (
                <Link
                  href={game.href}
                  className={`flex items-center justify-between rounded-md border-2 bg-space-950/60 px-4 py-3 ${game.border}`}
                >
                  <span className="font-semibold">{game.name}</span>
                  <span className={`font-display text-[0.6rem] ${game.accent}`}>{game.status} →</span>
                </Link>
              ) : (
                <div className="flex items-center justify-between rounded-md border-2 border-space-700 bg-space-950/60 px-4 py-3">
                  <span className="font-semibold">{game.name}</span>
                  <span className={`font-display text-[0.6rem] ${game.accent}`}>{game.status}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-starlight/70">
          New here?{" "}
          <Link href="/how-to-play" className="text-neon-cyan underline underline-offset-4">
            Learn how to play every game
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
