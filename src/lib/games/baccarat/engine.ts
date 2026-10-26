import { buildDecks, rankOf, suitOf, type Card } from "@/lib/games/deck";
import { secureRandomInt, shuffle, type RandomInt } from "@/lib/random";
import { bankerDraws, playerDraws, type BaccaratRules } from "./rules";

// The baccarat engine: pure functions for dealing a hand by the fixed drawing
// rules and paying every bet. Chips are whole numbers; fractions round down.

export type BaccaratBetKind =
  | "player"
  | "banker"
  | "tie"
  | "playerPair"
  | "bankerPair"
  | "eitherPair"
  | "perfectPair"
  | "dragonPlayer"
  | "dragonBanker"
  | "dragon7"
  | "panda8"
  | "big"
  | "small";

export const BACCARAT_BET_KINDS: readonly BaccaratBetKind[] = [
  "player", "banker", "tie", "playerPair", "bankerPair", "eitherPair", "perfectPair",
  "dragonPlayer", "dragonBanker", "dragon7", "panda8", "big", "small",
];

/** The three main bets (the rest are side bets). */
export const MAIN_BETS: readonly BaccaratBetKind[] = ["player", "banker", "tie"];

export type Winner = "player" | "banker" | "tie";

export type BaccaratHand = {
  /** Cards in the order they were dealt to each hand. */
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: Winner;
  /** Either hand had 8 or 9 in its first two cards. */
  natural: boolean;
};

/** Aces count 1, tens and faces 0, the rest face value. */
export function cardValue(card: Card): number {
  const rank = rankOf(card);
  if (rank === "A") return 1;
  if (rank === "T" || rank === "J" || rank === "Q" || rank === "K") return 0;
  return Number(rank);
}

/** Only the last digit counts: 7 + 8 = 15 counts as 5. */
export const handTotal = (cards: readonly Card[]) => cards.reduce((s, c) => s + cardValue(c), 0) % 10;

/** Works out the totals and winner for two finished hands. */
export function evaluate(player: Card[], banker: Card[]): BaccaratHand {
  const playerTotal = handTotal(player);
  const bankerTotal = handTotal(banker);
  const natural = handTotal(player.slice(0, 2)) >= 8 || handTotal(banker.slice(0, 2)) >= 8;
  const winner: Winner = playerTotal > bankerTotal ? "player" : bankerTotal > playerTotal ? "banker" : "tie";
  return { player, banker, playerTotal, bankerTotal, winner, natural };
}

/**
 * Deals one hand: Player, Banker, Player, Banker, then third cards by the
 * drawing rules. `draw` gives the next card from the shoe.
 */
export function dealHand(draw: () => Card): BaccaratHand {
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  const p2 = handTotal(player);
  const b2 = handTotal(banker);
  if (p2 < 8 && b2 < 8) {
    let playerThird: number | null = null;
    if (playerDraws(p2)) {
      const card = draw();
      player.push(card);
      playerThird = cardValue(card);
    }
    if (bankerDraws(b2, playerThird)) banker.push(draw());
  }
  return evaluate(player, banker);
}

// ---------- The shoe ----------

/** The shoe is reshuffled when fewer cards than this are left (where the cut card sits). */
export const CUT_CARD = 16;

export function newShoe(decks: number, randomInt: RandomInt = secureRandomInt): Card[] {
  return shuffle(buildDecks(decks), randomInt);
}

// ---------- Paying bets ----------

/** Why a bet isn't offered at this table, or null if it is. */
export function betNotOffered(rules: BaccaratRules, kind: BaccaratBetKind): string | null {
  if (!BACCARAT_BET_KINDS.includes(kind)) return "That isn't a bet at this table.";
  if (["playerPair", "bankerPair", "eitherPair", "perfectPair"].includes(kind) && !rules.pairs) {
    return "This table doesn't offer pair bets.";
  }
  if ((kind === "dragonPlayer" || kind === "dragonBanker") && !rules.dragonBonus) return "This table doesn't offer the Dragon Bonus.";
  if ((kind === "dragon7" || kind === "panda8") && !(rules.variant === "ez" && rules.dragon7Panda8)) {
    return "Dragon 7 and Panda 8 are only on EZ Baccarat tables.";
  }
  if ((kind === "big" || kind === "small") && !rules.bigSmall) return "This table doesn't offer Big / Small.";
  return null;
}

/** Side bets have no table minimum (main bets do). */
export const isMainBet = (kind: BaccaratBetKind) => MAIN_BETS.includes(kind);

export type BetOutcome = "win" | "lose" | "push";
export type Settlement = {
  outcome: BetOutcome;
  /** Chips won (0 unless the bet won). */
  winnings: number;
  /** Chips going back to the player: stake plus winnings, the stake on a push, 0 on a loss. */
  credit: number;
};

const won = (amount: number, winnings: number): Settlement => ({ outcome: "win", winnings, credit: amount + winnings });
const lost: Settlement = { outcome: "lose", winnings: 0, credit: 0 };
const pushed = (amount: number): Settlement => ({ outcome: "push", winnings: 0, credit: amount });

const pair = (cards: Card[]) => rankOf(cards[0]) === rankOf(cards[1]);
const perfect = (cards: Card[]) => pair(cards) && suitOf(cards[0]) === suitOf(cards[1]);
/** A three-card 7 for the Banker (EZ Baccarat's push, and the Dragon 7). */
export const isDragon7 = (h: BaccaratHand) => h.winner === "banker" && h.banker.length === 3 && h.bankerTotal === 7;
/** A three-card 8 for the Player (the Panda 8). */
export const isPanda8 = (h: BaccaratHand) => h.winner === "player" && h.player.length === 3 && h.playerTotal === 8;

/** Dragon Bonus odds by winning margin (non-natural wins). */
const DRAGON_MARGIN: Record<number, number> = { 9: 30, 8: 10, 7: 6, 6: 4, 5: 2, 4: 1 };

function dragonBonus(side: "player" | "banker", amount: number, h: BaccaratHand): Settlement {
  const mine = side === "player" ? h.player : h.banker;
  const myNatural = handTotal(mine.slice(0, 2)) >= 8 && mine.length === 2;
  if (h.winner === "tie") return h.natural && myNatural ? pushed(amount) : lost;
  if (h.winner !== side) return lost;
  if (myNatural) return won(amount, amount);
  const margin = Math.abs(h.playerTotal - h.bankerTotal);
  const odds = DRAGON_MARGIN[margin];
  return odds ? won(amount, amount * odds) : lost;
}

/** What a bet of `amount` on `kind` gets for this hand. */
export function settleBet(rules: BaccaratRules, kind: BaccaratBetKind, amount: number, h: BaccaratHand): Settlement {
  switch (kind) {
    case "player":
      if (h.winner === "tie") return pushed(amount);
      return h.winner === "player" ? won(amount, amount) : lost;
    case "banker":
      if (h.winner === "tie") return pushed(amount);
      if (h.winner !== "banker") return lost;
      if (rules.variant === "classic") return won(amount, Math.floor(amount * 0.95));
      if (rules.variant === "super6") return won(amount, h.bankerTotal === 6 ? Math.floor(amount / 2) : amount);
      return isDragon7(h) ? pushed(amount) : won(amount, amount);
    case "tie":
      return h.winner === "tie" ? won(amount, amount * rules.tiePays) : lost;
    case "playerPair":
      return pair(h.player) ? won(amount, amount * 11) : lost;
    case "bankerPair":
      return pair(h.banker) ? won(amount, amount * 11) : lost;
    case "eitherPair":
      return pair(h.player) || pair(h.banker) ? won(amount, amount * 5) : lost;
    case "perfectPair": {
      const both = perfect(h.player) && perfect(h.banker);
      return both ? won(amount, amount * 200) : perfect(h.player) || perfect(h.banker) ? won(amount, amount * 25) : lost;
    }
    case "dragonPlayer":
      return dragonBonus("player", amount, h);
    case "dragonBanker":
      return dragonBonus("banker", amount, h);
    case "dragon7":
      return isDragon7(h) ? won(amount, amount * 40) : lost;
    case "panda8":
      return isPanda8(h) ? won(amount, amount * 25) : lost;
    case "big":
      return h.player.length + h.banker.length >= 5 ? won(amount, Math.floor(amount * 0.54)) : lost;
    case "small":
      return h.player.length + h.banker.length === 4 ? won(amount, Math.floor(amount * 1.5)) : lost;
  }
}

/** "Banker wins, 7 over 5", "Tie, 6 each", … */
export function describeHand(h: BaccaratHand): string {
  if (h.winner === "tie") return `Tie, ${h.playerTotal} each`;
  const [w, l] = h.winner === "player" ? [h.playerTotal, h.bankerTotal] : [h.bankerTotal, h.playerTotal];
  return `${h.winner === "player" ? "Player" : "Banker"} wins, ${w} over ${l}${h.natural ? " (natural)" : ""}`;
}
