'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface TableConfig {
  name: string;
  numDecks: number;
  blackjackPayout: string;
  dealerHitsSoft17: boolean;
  minBet: number;
}

export default function BlackjackHub() {
  const [config, setConfig] = useState<TableConfig | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('currentTable');
    if (saved) {
      setConfig(JSON.parse(saved));
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-8xl mb-6">🃏</div>
          <h1 className="text-7xl font-bold text-yellow-400">Blackjack</h1>
        </div>

        {config ? (
          <div className="bg-zinc-900 rounded-3xl p-12 text-center">
            <h2 className="text-4xl mb-4">{config.name}</h2>
            <p className="text-zinc-400 mb-8">{config.numDecks} Decks • {config.blackjackPayout}</p>
            <button className="bg-yellow-500 text-black px-16 py-6 rounded-2xl text-xl font-semibold">
              Play This Table
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xl text-zinc-400 mb-8">No active table</p>
            <Link href="/create-table" className="inline-block bg-yellow-500 hover:bg-yellow-400 text-black px-16 py-6 rounded-2xl text-xl font-semibold">
              Create New Table
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}