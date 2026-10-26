import type { ComponentType } from "react";
import type { GameKey } from "@/lib/games/catalog";
import { BaccaratGuide } from "./baccarat";
import { BlackjackGuide } from "./blackjack";
import { CrapsGuide } from "./craps";
import { PokerGuide } from "./poker";

// One guide per game. Adding a game? Write its guide in this folder and add it
// here; the How to Play page, its link, and its card appear automatically.

export type Guide = {
  /** One line for the overview card. */
  blurb: string;
  /** Jump links at the top of the guide: [section id, label]. */
  sections: [string, string][];
  Content: ComponentType;
};

export const GUIDES: Record<GameKey, Guide> = {
  blackjack: {
    blurb: "Beat the dealer to 21 without going over. Every rule is yours to set, and On Book % shows how close you play to perfect.",
    sections: [
      ["goal", "The goal"],
      ["round", "A round"],
      ["payouts", "Payouts"],
      ["settings", "Settings"],
      ["on-book", "On Book %"],
      ["controls", "Controls"],
      ["tips", "Tips"],
    ],
    Content: BlackjackGuide,
  },
  holdem: {
    blurb: "No-Limit Texas Hold'em cash games against friends or bots. Two cards each, five shared, best hand wins.",
    sections: [
      ["goal", "The goal"],
      ["round", "A hand"],
      ["hands", "Hand rankings"],
      ["settings", "Settings"],
      ["controls", "Controls"],
      ["tips", "Tips"],
    ],
    Content: PokerGuide,
  },
  craps: {
    blurb: "Everyone bets on the same roll of the dice. Learn the Pass Line first, then every prop, hop, and bonus bet.",
    sections: [
      ["goal", "The idea"],
      ["round", "The flow"],
      ["crapless", "Crapless"],
      ["bets", "Bets"],
      ["settings", "Settings"],
      ["playing", "Playing here"],
      ["tips", "Tips"],
    ],
    Content: CrapsGuide,
  },
  baccarat: {
    blurb: "Bet on Player, Banker, or Tie and watch the cards decide. Three versions, side bets, and scoreboards.",
    sections: [
      ["goal", "The idea"],
      ["round", "A hand"],
      ["versions", "Versions"],
      ["bets", "Bets"],
      ["scoreboards", "Scoreboards"],
      ["playing", "Playing here"],
    ],
    Content: BaccaratGuide,
  },
};
