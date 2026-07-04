'use client';

import { useState, useEffect } from 'react';

interface TableConfig {
  name: string;
  numDecks: number;
  blackjackPayout: string;
  dealerHitsSoft17: boolean;
  minBet: number;
}

export default function Blackjack() {
  const [config, setConfig] = useState<TableConfig | null>(null);
  const [playerHand, setPlayerHand] = useState<number[]>([]);
  const [dealerHand, setDealerHand] = useState<number[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem('currentTable');
    if (saved) {
      setConfig(JSON.parse(saved));
    }
  }, []);

  const dealCard = () => Math.floor(Math.random() * 13) + 1;

  const getCardValue = (card: number) => card > 10 ? 10 : card;

  const calculateHand = (hand: number[]) => {
    let total = hand.reduce((sum, card) => sum + getCardValue(card), 0);
    const aces = hand.filter(card => card === 1).length;
    for (let i = 0; i < aces; i++) {
      if (total + 10 <= 21) total += 10;
    }
    return total;
  };

  const startGame = () => {
    if (!config) return;
    const p1 = dealCard();
    const p2 = dealCard();
    const d1 = dealCard();
    const d2 = dealCard();
    setPlayerHand([p1, p2]);
    setDealerHand([d1, d2]);
    setGameOver(false);
    setMessage("");
  };

  // ... hit and stand functions (same as before)

  if (!config) {
    return <div className="p-8">No table selected. Go to Create Table first.</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold text-yellow-400 mb-2">{config.name}</h1>
        <p className="text-zinc-400 mb-8">{config.numDecks} Decks • {config.blackjackPayout} Blackjack</p>

        {/* Game UI same as before */}
        {/* ... (add the previous game code here) */}

        <button onClick={startGame} className="bg-yellow-500 text-black px-8 py-4 rounded-xl">
          Deal Cards
        </button>
      </div>
    </div>
  );
}