import { beforeAll, describe, expect, it } from "vitest";
import { RANKS, type Card } from "@/lib/games/deck";
import { seededRandom } from "@/lib/random";
import {
  BACCARAT_BET_KINDS,
  betNotOffered,
  cardValue,
  dealHand,
  describeHand,
  evaluate,
  handTotal,
  newShoe,
  settleBet,
  type BaccaratBetKind,
  type BaccaratHand,
} from "./engine";
import { bankerDraws, DEFAULT_BACCARAT_RULES, playerDraws, type BaccaratRules } from "./rules";

const RULES = DEFAULT_BACCARAT_RULES;
const rules = (r: Partial<BaccaratRules> = {}): BaccaratRules => ({ ...RULES, ...r });

/** Deals from a fixed list of cards. */
const deal = (...cards: Card[]) => {
  let i = 0;
  return dealHand(() => {
    if (i >= cards.length) throw new Error("ran out of cards");
    return cards[i++];
  });
};

describe("card values and totals", () => {
  it("counts aces as 1, tens and faces as 0, and keeps the last digit", () => {
    expect(["As", "9h", "Td", "Kc"].map((c) => cardValue(c as Card))).toEqual([1, 9, 0, 0]);
    expect(handTotal(["7s", "8h"])).toBe(5);
    expect(handTotal(["Ks", "Qh"])).toBe(0);
  });
});

describe("drawing rules", () => {
  it("Player draws on 0–5 and stands on 6–7", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(playerDraws)).toEqual([true, true, true, true, true, true, false, false]);
  });

  it("Banker follows the third-card table", () => {
    // Rows: Banker total 0..7; columns: Player's third card 0..9.
    const table = [
      "DDDDDDDDDD",
      "DDDDDDDDDD",
      "DDDDDDDDDD",
      "DDDDDDDDSD",
      "SSDDDDDDSS",
      "SSSSDDDDSS",
      "SSSSSSDDSS",
      "SSSSSSSSSS",
    ];
    table.forEach((row, total) =>
      [...row].forEach((cell, third) => expect(bankerDraws(total, third), `banker ${total} vs ${third}`).toBe(cell === "D")),
    );
    expect(bankerDraws(5, null)).toBe(true);
    expect(bankerDraws(6, null)).toBe(false);
  });

  it("deals P, B, P, B, then third cards", () => {
    // Player 2+3=5 draws a 4 (9). Banker 6+K=6 stands on a Player 4.
    const h = deal("2s", "6h", "3d", "Kc", "4s");
    expect(h.player).toEqual(["2s", "3d", "4s"]);
    expect(h.banker).toEqual(["6h", "Kc"]);
    expect(h).toMatchObject({ playerTotal: 9, bankerTotal: 6, winner: "player", natural: false });
  });

  it("stops at a natural", () => {
    const h = deal("4s", "9h", "4d", "Kc");
    expect(h.player).toHaveLength(2);
    expect(h).toMatchObject({ playerTotal: 8, bankerTotal: 9, winner: "banker", natural: true });
  });
});

describe("main bets", () => {
  const bankerWins = (bankerTotal: number, cards = 2): BaccaratHand =>
    ({ player: ["2s", "Ks", ...(cards === 3 ? ["Kd"] : [])], banker: ["Ks", "Kh", "Kc"].slice(0, cards), playerTotal: 2, bankerTotal, winner: "banker", natural: false }) as BaccaratHand;

  it("classic Banker pays 19:20; Player pays even; ties push both", () => {
    const h = bankerWins(5);
    expect(settleBet(RULES, "banker", 20, h)).toEqual({ outcome: "win", winnings: 19, credit: 39 });
    expect(settleBet(RULES, "player", 20, h).outcome).toBe("lose");
    const tie = evaluate(["5s", "Kh"], ["5d", "Kc"]);
    expect(settleBet(RULES, "player", 20, tie)).toEqual({ outcome: "push", winnings: 0, credit: 20 });
    expect(settleBet(RULES, "tie", 10, tie).winnings).toBe(80);
    expect(settleBet(rules({ tiePays: 9 }), "tie", 10, tie).winnings).toBe(90);
  });

  it("Super 6: Banker pays even money, but half on a winning 6", () => {
    const s6 = rules({ variant: "super6" });
    expect(settleBet(s6, "banker", 20, bankerWins(5)).winnings).toBe(20);
    expect(settleBet(s6, "banker", 20, bankerWins(6)).winnings).toBe(10);
  });

  it("EZ: Banker pays even money, but a 3-card 7 pushes", () => {
    const ez = rules({ variant: "ez" });
    expect(settleBet(ez, "banker", 20, bankerWins(7, 2)).winnings).toBe(20);
    expect(settleBet(ez, "banker", 20, bankerWins(7, 3)).outcome).toBe("push");
    expect(settleBet(ez, "dragon7", 5, bankerWins(7, 3)).winnings).toBe(200);
    expect(settleBet(ez, "dragon7", 5, bankerWins(7, 2)).outcome).toBe("lose");
  });
});

describe("side bets", () => {
  it("pays pairs from the first two cards of each hand", () => {
    const h = evaluate(["8s", "8h", "Kd"], ["2c", "Qd"]);
    expect(settleBet(RULES, "playerPair", 5, h).winnings).toBe(55);
    expect(settleBet(RULES, "bankerPair", 5, h).outcome).toBe("lose");
    expect(settleBet(RULES, "eitherPair", 5, h).winnings).toBe(25);
    expect(settleBet(RULES, "perfectPair", 5, h).outcome).toBe("lose");
    const suited = evaluate(["8s", "8s"], ["2c", "Qd"]);
    expect(settleBet(RULES, "perfectPair", 5, suited).winnings).toBe(125);
    const both = evaluate(["8s", "8s"], ["2c", "2c"]);
    expect(settleBet(RULES, "perfectPair", 5, both).winnings).toBe(1000);
  });

  it("Dragon Bonus pays by margin, even money on a natural, and pushes a natural tie", () => {
    // Player 9 (three cards) over Banker 0: wins by 9 → 30:1.
    const by9 = evaluate(["2s", "3h", "4d"], ["Ks", "Qh", "Jd"]);
    expect(settleBet(RULES, "dragonPlayer", 5, by9).winnings).toBe(150);
    // Win by 3 (not a natural) loses.
    const by3 = evaluate(["2s", "3h", "Kd"], ["Ks", "2h", "Jd"]);
    expect(settleBet(RULES, "dragonPlayer", 5, by3).outcome).toBe("lose");
    // Natural win pays 1:1.
    const natural = evaluate(["4s", "4h"], ["Ks", "2h", "Jd"]);
    expect(settleBet(RULES, "dragonPlayer", 5, natural).winnings).toBe(5);
    // Natural tie pushes.
    const natTie = evaluate(["4s", "4h"], ["5s", "3h"]);
    expect(settleBet(RULES, "dragonBanker", 5, natTie).outcome).toBe("push");
  });

  it("Panda 8 pays on a Player 3-card 8; Big/Small on the card count", () => {
    const panda = evaluate(["2s", "3h", "3d"], ["Ks", "4h", "Jd"]);
    expect(settleBet(rules({ variant: "ez" }), "panda8", 4, panda).winnings).toBe(100);
    expect(settleBet(RULES, "big", 100, panda).winnings).toBe(54);
    const four = evaluate(["4s", "4h"], ["Ks", "9h"]);
    expect(settleBet(RULES, "small", 10, four).winnings).toBe(15);
    expect(settleBet(RULES, "big", 10, four).outcome).toBe("lose");
  });

  it("only offers bets the table allows", () => {
    expect(betNotOffered(RULES, "dragon7")).toMatch(/EZ/);
    expect(betNotOffered(rules({ variant: "ez" }), "dragon7")).toBeNull();
    expect(betNotOffered(rules({ pairs: false }), "eitherPair")).toMatch(/pair/);
    expect(betNotOffered(rules({ bigSmall: false }), "big")).toMatch(/Big/);
    expect(betNotOffered(RULES, "player")).toBeNull();
  });
});

describe("the shoe", () => {
  it("holds every card of every deck, shuffled", () => {
    const shoe = newShoe(8, (n) => Math.floor(seededRandom(3)() * n));
    expect(shoe).toHaveLength(416);
    expect(new Set(shoe).size).toBe(52);
  });

  it("describes a hand", () => {
    expect(describeHand(deal("4s", "9h", "4d", "Kc"))).toBe("Banker wins, 9 over 8 (natural)");
  });
});

// ---------- Exact house edges ----------

/**
 * Deals every possible hand from a fresh shoe (suits ignored, so no Perfect
 * Pair), weighted by probability, through the engine's own dealHand. Returns
 * the house edge (%) for each bet.
 */
function exactEdges(decks: number, r: BaccaratRules, kinds: BaccaratBetKind[]) {
  const counts = RANKS.map(() => 4 * decks);
  let left = 52 * decks;
  const ev = new Map<BaccaratBetKind, number>(kinds.map((k) => [k, 0]));
  class NeedMore extends Error {}
  const prefix: number[] = [];

  const visit = (p: number) => {
    let used = 0;
    let hand: BaccaratHand;
    try {
      hand = dealHand(() => {
        if (used >= prefix.length) throw new NeedMore();
        return `${RANKS[prefix[used++]]}s` as Card;
      });
    } catch (e) {
      if (!(e instanceof NeedMore)) throw e;
      for (let i = 0; i < 13; i++) {
        if (counts[i] === 0) continue;
        const q = p * (counts[i] / left);
        counts[i]--;
        left--;
        prefix.push(i);
        visit(q);
        prefix.pop();
        counts[i]++;
        left++;
      }
      return;
    }
    for (const k of kinds) {
      const s = settleBet(r, k, 100, hand);
      ev.set(k, ev.get(k)! + p * (s.credit - 100));
    }
  };
  visit(1);
  return Object.fromEntries(kinds.map((k) => [k, -ev.get(k)!])) as Record<BaccaratBetKind, number>;
}

describe("house edges, 8 decks (exact)", () => {
  type Edges = Record<BaccaratBetKind, number>;
  let classic: Edges, nine: Edges, super6: Edges, ez: Edges;
  beforeAll(() => {
    classic = exactEdges(8, rules(), BACCARAT_BET_KINDS.filter((k) => k !== "perfectPair"));
    nine = exactEdges(8, rules({ tiePays: 9 }), ["tie"]);
    super6 = exactEdges(8, rules({ variant: "super6" }), ["banker"]);
    ez = exactEdges(8, rules({ variant: "ez" }), ["banker"]);
  }, 120_000);

  const published: [string, () => number, number][] = [
    ["Banker (5% commission)", () => classic.banker, 1.06],
    ["Player", () => classic.player, 1.24],
    ["Tie 8:1", () => classic.tie, 14.36],
    ["Tie 9:1", () => nine.tie, 4.84],
    ["Banker, no-commission Super 6", () => super6.banker, 1.46],
    ["Banker, EZ Baccarat", () => ez.banker, 1.02],
    ["Dragon 7 (40:1)", () => classic.dragon7, 7.61],
    ["Panda 8 (25:1)", () => classic.panda8, 10.19],
    ["Player Pair (11:1)", () => classic.playerPair, 10.36],
    ["Dragon Bonus on Player", () => classic.dragonPlayer, 2.65],
    ["Dragon Bonus on Banker", () => classic.dragonBanker, 9.37],
    ["Big (0.54:1)", () => classic.big, 4.35],
    ["Small (1.5:1)", () => classic.small, 5.28],
  ];
  for (const [name, actual, expected] of published) {
    it(`${name}: ${expected}%`, () => {
      if (process.env.SHOW_EDGES) console.log("EDGE", name, actual().toFixed(4));
      expect(Math.abs(actual() - expected)).toBeLessThan(0.02);
    });
  }
  it("Banker Pair matches Player Pair", () => expect(classic.bankerPair).toBeCloseTo(classic.playerPair, 6));
});
