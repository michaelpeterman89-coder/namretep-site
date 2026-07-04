'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto p-8">
        <header className="text-center py-16">
          <h1 className="text-8xl font-bold tracking-tighter bg-gradient-to-r from-yellow-400 via-red-500 to-purple-500 bg-clip-text text-transparent">Namretep</h1>
          <p className="text-2xl text-zinc-400">Casino Games for now</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/games/blackjack" className="group bg-zinc-900 hover:bg-zinc-800 border border-yellow-500/30 rounded-3xl p-12 transition hover:scale-105">
            <div className="text-8xl mb-6">🃏</div>
            <h2 className="text-4xl font-semibold mb-4">Blackjack</h2>
            <p className="text-zinc-400">Configurable tables • Hit/Stand • Dealer AI</p>
          </Link>

          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-12 opacity-75">
            <div className="text-8xl mb-6">🎲</div>
            <h2 className="text-4xl font-semibold mb-4">More Games</h2>
            <p className="text-zinc-400">Craps, Roulette, Texas Hold'em coming soon...</p>
          </div>
        </div>

        <div className="mt-16 text-center text-zinc-500">
          Login • Stats • Admin Panel • Coming Soon
        </div>
      </div>
    </main>
  );
}