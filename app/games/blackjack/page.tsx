'use client';

import Link from 'next/link';

export default function BlackjackHub() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-8xl mb-6">🃏</div>
          <h1 className="text-7xl font-bold text-yellow-400">Blackjack</h1>
          <p className="text-zinc-400 text-xl mt-4">Multiple tables • Friends only</p>
        </div>

        <div className="flex flex-col items-center gap-6">
          <Link href="/create-table" 
            className="bg-yellow-500 hover:bg-yellow-400 text-black px-16 py-6 rounded-2xl text-2xl font-semibold transition w-full max-w-md text-center">
            + Create New Table
          </Link>

          <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 text-center mt-8">
            <p className="text-zinc-400">Active Tables</p>
            <p className="text-sm text-zinc-500 mt-4">(List coming soon)</p>
          </div>
        </div>
      </div>
    </div>
  );
}