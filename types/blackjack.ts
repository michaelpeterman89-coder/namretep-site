export interface BlackjackTableConfig {
  id: string;
  name: string;
  createdBy: string;
  isActive: boolean;

  // Deck
  numDecks: 1 | 2 | 4 | 6 | 8;

  // Payout
  blackjackPayout: '3:2' | '6:5' | '1:1';

  // Dealer
  dealerHitsSoft17: boolean;
  dealerPeeks: boolean;

  // Player Options
  allowDouble: boolean;
  allowSplit: boolean;
  maxSplits: number;
  resplitAces: boolean;
  doubleAfterSplit: boolean;
  allowSurrender: boolean;

  // Betting
  minBet: number;
  maxBet: number;
  maxBetAfterSplit: number;

  // Flow
  maxPlayers: number;
  penetration: number;
  idleTimeout: number;

  // Special
  europeanStyle: boolean;
  charlieRule: boolean;

  createdAt: Date;
  closedAt?: Date;
}

export const PRESETS = {
  classicVegas: {
    numDecks: 6,
    blackjackPayout: '3:2' as const,
    dealerHitsSoft17: true,
    // ... fill in
  },
  singleDeck: {
    numDecks: 1,
    blackjackPayout: '3:2' as const,
    // ...
  }
} as const;