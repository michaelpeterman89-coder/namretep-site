const games = [
  { name: "Blackjack", status: "Coming first", accent: "text-neon-cyan" },
  { name: "Roulette", status: "Later", accent: "text-starlight/50" },
  { name: "Craps", status: "Later", accent: "text-starlight/50" },
  { name: "Baccarat", status: "Later", accent: "text-starlight/50" },
  { name: "Texas Hold'em", status: "Later", accent: "text-starlight/50" },
  { name: "Video Poker", status: "Later", accent: "text-starlight/50" },
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
        <p className="font-display text-xs text-neon-gold">Virtual chips only</p>
      </section>

      <section aria-labelledby="games-heading" className="pixel-panel p-5 sm:p-8">
        <h2 id="games-heading" className="mb-6 font-display text-sm text-neon-cyan">
          Games
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <li
              key={game.name}
              className="flex items-center justify-between rounded-md border-2 border-space-700 bg-space-950/60 px-4 py-3"
            >
              <span className="font-semibold">{game.name}</span>
              <span className={`font-display text-[0.6rem] ${game.accent}`}>{game.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
