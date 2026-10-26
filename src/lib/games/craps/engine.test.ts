import { describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/random";
import {
  cantRemove,
  IllegalCrapsBet,
  newCrapsState,
  placeBet,
  removeBet,
  roll,
  setOnComeOut,
  type BetKind,
  type BetRequest,
  type CrapsConfig,
  type CrapsState,
  type Dice,
  type RollResult,
} from "./engine";
import { DEFAULT_CRAPS_RULES, type CrapsRules } from "./rules";

const P = "p1";
const config = (rules: Partial<CrapsRules> = {}, minBet = 5, maxBet = 1_000_000): CrapsConfig => ({
  rules: { ...DEFAULT_CRAPS_RULES, ...rules },
  minBet,
  maxBet,
});
const STD = config();
const CRAPLESS = config({ variant: "crapless" });

/** Dice that add up to `total` (not doubles unless they have to be). */
const easy = (total: number): Dice => {
  if (total <= 7) return [1, total - 1];
  return [total - 6, 6];
};

class Table {
  state: CrapsState = newCrapsState();
  last!: RollResult;
  constructor(public cfg: CrapsConfig = STD) {}
  bet(r: BetRequest, player = P) {
    const res = placeBet(this.state, this.cfg, player, r);
    this.state = res.state;
    return res;
  }
  roll(dice: Dice | number) {
    this.last = roll(this.state, this.cfg, typeof dice === "number" ? easy(dice) : dice);
    this.state = this.last.state;
    return this.last;
  }
  /** The result for this bet in the last roll. */
  result(betId: string) {
    return this.last.results.find((r) => r.betId === betId);
  }
  has(betId: string) {
    return this.state.bets.some((b) => b.id === betId);
  }
}

describe("the Pass Line", () => {
  it("wins on a come-out 7 or 11 and stays up; loses on 2, 3, 12", () => {
    for (const total of [7, 11]) {
      const t = new Table();
      const { bet } = t.bet({ kind: "pass", amount: 10 });
      expect(t.roll(total).event).toBe("natural");
      expect(t.result(bet.id)).toMatchObject({ outcome: "win", winnings: 10, credit: 10, stays: true });
      expect(t.has(bet.id)).toBe(true);
    }
    for (const total of [2, 3, 12]) {
      const t = new Table();
      const { bet } = t.bet({ kind: "pass", amount: 10 });
      expect(t.roll(total).event).toBe("craps");
      expect(t.result(bet.id)).toMatchObject({ outcome: "lose", credit: 0 });
      expect(t.has(bet.id)).toBe(false);
    }
  });

  it("sets a point, wins when it's made, and loses on a seven-out", () => {
    const t = new Table();
    const { bet } = t.bet({ kind: "pass", amount: 10 });
    expect(t.roll(6).event).toBe("pointSet");
    expect(t.state.point).toBe(6);
    expect(t.state.bets[0].number).toBe(6);
    t.roll(9);
    expect(t.result(bet.id)).toBeUndefined();
    expect(t.roll(6).event).toBe("pointMade");
    expect(t.result(bet.id)).toMatchObject({ outcome: "win", winnings: 10, stays: true });
    expect(t.state.point).toBeNull();

    t.roll(8);
    expect(t.roll(7).event).toBe("sevenOut");
    expect(t.result(bet.id)?.outcome).toBe("lose");
    expect(t.state.shooterRolls).toBe(0);
  });

  it("can't be made once there's a point, and can't come down after", () => {
    const t = new Table();
    const { bet } = t.bet({ kind: "pass", amount: 10 });
    t.roll(5);
    expect(() => t.bet({ kind: "pass", amount: 10 })).toThrow(IllegalCrapsBet);
    expect(cantRemove(t.state, t.state.bets[0])).toMatch(/stay up/);
    expect(() => removeBet(t.state, P, bet.id)).toThrow(IllegalCrapsBet);
  });
});

describe("crapless craps", () => {
  it("makes 2, 3, 11, and 12 points; only 7 wins on the come-out", () => {
    for (const total of [2, 3, 11, 12]) {
      const t = new Table(CRAPLESS);
      t.bet({ kind: "pass", amount: 10 });
      expect(t.roll(total).event).toBe("pointSet");
      expect(t.state.point).toBe(total);
    }
    const t = new Table(CRAPLESS);
    const { bet } = t.bet({ kind: "pass", amount: 10 });
    expect(t.roll(7).event).toBe("natural");
    expect(t.result(bet.id)?.outcome).toBe("win");
  });

  it("has no Don't bets, pays odds on 2/12 at 6:1, and lets you place the 11", () => {
    const t = new Table(CRAPLESS);
    expect(() => t.bet({ kind: "dontPass", amount: 10 })).toThrow(/no Don't/);
    const { bet: line } = t.bet({ kind: "pass", amount: 10 });
    t.roll(12);
    const { bet: odds } = t.bet({ kind: "odds", amount: 30, parentId: line.id });
    const { bet: place } = t.bet({ kind: "place", number: 11, amount: 20 });
    t.roll([5, 6]);
    expect(t.result(place.id)).toMatchObject({ outcome: "win", winnings: 55 }); // 11:4
    t.roll([6, 6]);
    expect(t.result(odds.id)).toMatchObject({ outcome: "win", winnings: 180, credit: 210 }); // 6:1
  });
});

describe("Don't Pass", () => {
  it("wins on 2 or 3, ties on 12, loses on 7 or 11 at the come-out", () => {
    const outcomes: Record<number, string> = { 2: "win", 3: "win", 12: "push", 7: "lose", 11: "lose" };
    for (const [total, outcome] of Object.entries(outcomes)) {
      const t = new Table();
      const { bet } = t.bet({ kind: "dontPass", amount: 10 });
      t.roll(Number(total));
      expect(t.result(bet.id)?.outcome).toBe(outcome);
      if (outcome === "push") expect(t.has(bet.id)).toBe(true);
    }
  });

  it("wins on a seven-out and loses when the point is made", () => {
    const t = new Table();
    const { bet } = t.bet({ kind: "dontPass", amount: 10 });
    t.roll(4);
    t.roll(7);
    expect(t.result(bet.id)).toMatchObject({ outcome: "win", winnings: 10 });
    t.roll(4);
    t.roll(4);
    expect(t.result(bet.id)?.outcome).toBe("lose");
  });
});

describe("odds", () => {
  it("allows 3x on 4/10, 4x on 5/9, 5x on 6/8 and pays true odds", () => {
    for (const [pointTotal, maxOdds, win] of [
      [4, 30, 60],
      [5, 40, 60],
      [6, 50, 60],
    ] as const) {
      const t = new Table();
      const { bet: line } = t.bet({ kind: "pass", amount: 10 });
      t.roll(pointTotal);
      expect(() => t.bet({ kind: "odds", amount: maxOdds + 1, parentId: line.id })).toThrow(/up to/);
      const { bet: odds } = t.bet({ kind: "odds", amount: maxOdds, parentId: line.id });
      t.roll(pointTotal);
      expect(t.result(odds.id)).toMatchObject({ outcome: "win", winnings: win, credit: win + maxOdds });
      expect(t.has(odds.id)).toBe(false);
    }
  });

  it("is lost on a seven-out", () => {
    const t = new Table();
    const { bet: line } = t.bet({ kind: "pass", amount: 10 });
    t.roll(8);
    const { bet: odds } = t.bet({ kind: "odds", amount: 50, parentId: line.id });
    t.roll(7);
    expect(t.result(odds.id)?.outcome).toBe("lose");
  });

  it("lays odds against the point, limited to the same win", () => {
    const t = new Table();
    const { bet: dp } = t.bet({ kind: "dontPass", amount: 10 });
    t.roll(4);
    // 3x on the 4 wins 60, so you can lay up to 120 at 1:2.
    expect(() => t.bet({ kind: "layOdds", amount: 122, parentId: dp.id })).toThrow(/at most 60/);
    const { bet: lay } = t.bet({ kind: "layOdds", amount: 120, parentId: dp.id });
    t.roll(7);
    expect(t.result(lay.id)).toMatchObject({ outcome: "win", winnings: 60, credit: 180 });
  });

  it("needs a line bet with a point, owned by the same player", () => {
    const t = new Table();
    const { bet: line } = t.bet({ kind: "pass", amount: 10 });
    expect(() => t.bet({ kind: "odds", amount: 10, parentId: line.id })).toThrow(/has a point/);
    t.roll(6);
    expect(() => t.bet({ kind: "odds", amount: 10, parentId: line.id }, "p2")).toThrow(/has a point/);
  });
});

describe("Come and Don't Come", () => {
  it("travels to a number, then wins on it (with odds) and comes down", () => {
    const t = new Table();
    t.bet({ kind: "pass", amount: 10 });
    t.roll(4);
    expect(() => t.bet({ kind: "dontPass", amount: 10 })).toThrow();
    const { bet: come } = t.bet({ kind: "come", amount: 10 });
    t.roll(9);
    expect(t.result(come.id)).toMatchObject({ outcome: "moved", movedTo: 9 });
    expect(t.state.bets.find((b) => b.id === come.id)?.number).toBe(9);
    const { bet: odds } = t.bet({ kind: "odds", amount: 40, parentId: come.id });
    t.roll(9);
    expect(t.result(come.id)).toMatchObject({ outcome: "win", winnings: 10, credit: 20 });
    expect(t.result(odds.id)).toMatchObject({ outcome: "win", winnings: 60, credit: 100 });
    expect(t.has(come.id)).toBe(false);
  });

  it("wins on 7/11 in the come box and loses on craps", () => {
    const t = new Table();
    t.bet({ kind: "pass", amount: 10 });
    t.roll(5);
    const { bet: come } = t.bet({ kind: "come", amount: 10 });
    t.roll(11);
    expect(t.result(come.id)).toMatchObject({ outcome: "win", credit: 20 });
    const { bet: come2 } = t.bet({ kind: "come", amount: 10 });
    t.roll(12);
    expect(t.result(come2.id)?.outcome).toBe("lose");
  });

  it("keeps come odds off on the come-out roll unless turned on", () => {
    const t = new Table();
    const { bet: line } = t.bet({ kind: "pass", amount: 10 });
    t.roll(5);
    const { bet: come } = t.bet({ kind: "come", amount: 10 });
    t.roll(6);
    const { bet: odds } = t.bet({ kind: "odds", amount: 50, parentId: come.id });
    t.roll(5); // point made: next roll is a come-out
    expect(t.state.point).toBeNull();
    t.roll(7); // come-out 7: Pass wins, the Come bet on 6 loses, its odds come back
    expect(t.result(line.id)?.outcome).toBe("win");
    expect(t.result(come.id)?.outcome).toBe("lose");
    expect(t.result(odds.id)).toMatchObject({ outcome: "push", credit: 50 });

    // Turned on, the odds are lost too.
    const u = new Table();
    const { bet: l2 } = u.bet({ kind: "pass", amount: 10 });
    u.roll(5);
    const { bet: c2 } = u.bet({ kind: "come", amount: 10 });
    u.roll(6);
    const { bet: o2 } = u.bet({ kind: "odds", amount: 50, parentId: c2.id });
    u.state = setOnComeOut(u.state, P, o2.id, true);
    u.roll(5);
    u.roll(7);
    expect(u.result(l2.id)?.outcome).toBe("win");
    expect(u.result(o2.id)?.outcome).toBe("lose");
  });

  it("Don't Come travels and wins on the 7", () => {
    const t = new Table();
    t.bet({ kind: "pass", amount: 10 });
    t.roll(8);
    const { bet: dc } = t.bet({ kind: "dontCome", amount: 10 });
    t.roll(10);
    const { bet: lay } = t.bet({ kind: "layOdds", amount: 60, parentId: dc.id });
    t.roll(7);
    expect(t.result(dc.id)).toMatchObject({ outcome: "win", credit: 20 });
    expect(t.result(lay.id)).toMatchObject({ outcome: "win", winnings: 30 });
  });
});

describe("place, buy, and lay", () => {
  it("place bets are off on the come-out, pay house odds, and stay up", () => {
    const t = new Table();
    const { bet: place } = t.bet({ kind: "place", number: 6, amount: 12 });
    t.roll(6); // come-out: off (and sets the point)
    expect(t.result(place.id)).toBeUndefined();
    t.roll(6);
    expect(t.result(place.id)).toMatchObject({ outcome: "win", winnings: 14, credit: 14, stays: true });
    t.roll(8);
    t.roll(7);
    expect(t.result(place.id)?.outcome).toBe("lose");
  });

  it("buy bets pay true odds less 5% of the bet (on wins, or up front)", () => {
    const onWin = new Table();
    onWin.bet({ kind: "pass", amount: 10 });
    onWin.roll(5);
    const { bet: buy, cost } = onWin.bet({ kind: "buy", number: 4, amount: 20 });
    expect(cost).toBe(20);
    onWin.roll(4);
    expect(onWin.result(buy.id)?.winnings).toBe(39);

    const upfront = new Table(config({ vig: "upfront" }));
    upfront.bet({ kind: "pass", amount: 10 });
    upfront.roll(5);
    const res = upfront.bet({ kind: "buy", number: 4, amount: 20 });
    expect(res.cost).toBe(21);
    upfront.roll(4);
    expect(upfront.result(res.bet.id)?.winnings).toBe(40);
    // Taking it down returns the commission too.
    expect(removeBet(upfront.state, P, res.bet.id).refund).toBe(21);
  });

  it("lay bets win on 7 (less 5% of the win) and work on the come-out", () => {
    const t = new Table();
    const { bet: lay } = t.bet({ kind: "lay", number: 4, amount: 40 });
    t.roll(7);
    expect(t.result(lay.id)).toMatchObject({ outcome: "win", winnings: 19, stays: true });
    t.roll(4);
    expect(t.result(lay.id)?.outcome).toBe("lose");
  });
});

describe("field, big 6/8, and hardways", () => {
  it("field pays double on 2 and double or triple on 12", () => {
    const pays = (total: number, field12: 2 | 3) => {
      const t = new Table(config({ field12 }));
      const { bet } = t.bet({ kind: "field", amount: 10 });
      t.roll(total === 12 ? [6, 6] : total === 2 ? [1, 1] : total);
      return t.result(bet.id)!;
    };
    expect(pays(2, 3).winnings).toBe(20);
    expect(pays(12, 3).winnings).toBe(30);
    expect(pays(12, 2).winnings).toBe(20);
    expect(pays(9, 3).winnings).toBe(10);
    for (const total of [5, 6, 7, 8]) expect(pays(total, 3).outcome).toBe("lose");
  });

  it("big 8 pays even money", () => {
    const t = new Table();
    const { bet } = t.bet({ kind: "big8", amount: 10 });
    t.roll(8);
    expect(t.result(bet.id)).toMatchObject({ outcome: "win", winnings: 10 });
  });

  it("hard 8 wins only on 4+4; easy 8 or 7 loses", () => {
    const t = new Table();
    t.bet({ kind: "pass", amount: 10 });
    t.roll(5);
    const { bet } = t.bet({ kind: "hard", number: 8, amount: 5 });
    t.roll([4, 4]);
    expect(t.result(bet.id)).toMatchObject({ outcome: "win", winnings: 45 });
    t.roll([2, 6]);
    expect(t.result(bet.id)?.outcome).toBe("lose");
  });
});

describe("proposition and hop bets", () => {
  const oneRoll = (kind: BetKind, amount: number, dice: Dice, extra: Partial<BetRequest> = {}) => {
    const t = new Table();
    const { bet } = t.bet({ kind, amount, ...extra });
    t.roll(dice);
    return t.result(bet.id)!;
  };

  it("pays the standard prop odds", () => {
    expect(oneRoll("any7", 5, [3, 4]).winnings).toBe(20);
    expect(oneRoll("anyCraps", 5, [1, 2]).winnings).toBe(35);
    expect(oneRoll("two", 5, [1, 1]).winnings).toBe(150);
    expect(oneRoll("yo", 5, [5, 6]).winnings).toBe(75);
    expect(oneRoll("twelve", 5, [6, 6]).winnings).toBe(150);
    expect(oneRoll("any7", 5, [3, 3]).outcome).toBe("lose");
  });

  it("splits Horn, C&E, and World bets", () => {
    expect(oneRoll("horn", 4, [1, 1]).winnings).toBe(27); // 30 on the 2, minus the other three
    expect(oneRoll("horn", 4, [5, 6]).winnings).toBe(12);
    expect(oneRoll("ce", 2, [1, 2]).winnings).toBe(6);
    expect(oneRoll("ce", 2, [5, 6]).winnings).toBe(14);
    expect(oneRoll("world", 5, [3, 4])).toMatchObject({ outcome: "push", credit: 0, stays: true });
    expect(oneRoll("world", 5, [6, 6]).winnings).toBe(26);
    expect(() => new Table().bet({ kind: "horn", amount: 5 })).toThrow(/multiple of 4/);
  });

  it("pays hops 15:1 (or 30:1 for doubles), in either dice order", () => {
    expect(oneRoll("hop", 2, [4, 2], { dice: [2, 4] }).winnings).toBe(30);
    expect(oneRoll("hop", 2, [3, 3], { dice: [3, 3] }).winnings).toBe(60);
    expect(oneRoll("hop", 2, [1, 5], { dice: [2, 4] }).outcome).toBe("lose");
  });

  it("respects the table's bonus settings", () => {
    const t = new Table(config({ props: false, hops: false, fireBet: false, allSmallTall: false }));
    expect(() => t.bet({ kind: "any7", amount: 5 })).toThrow(/proposition/);
    expect(() => t.bet({ kind: "hop", amount: 5, dice: [1, 2] })).toThrow(/hop/);
    expect(() => t.bet({ kind: "fire", amount: 5 })).toThrow(/Fire/);
    expect(() => t.bet({ kind: "allSmall", amount: 5 })).toThrow(/All Small/);
  });
});

describe("Fire Bet", () => {
  /** Makes each point in turn, then sevens out. */
  const shooter = (points: number[]) => {
    const t = new Table();
    const { bet: line } = t.bet({ kind: "pass", amount: 10 });
    const { bet: fire } = t.bet({ kind: "fire", amount: 5 });
    for (const p of points) {
      t.roll(p);
      t.roll(p);
    }
    if (!t.result(fire.id)) {
      t.roll(points.length ? 4 : 6);
      t.roll(7);
    }
    return { t, fire, line };
  };

  it("pays 24:1 for four different points, at the seven-out", () => {
    const { t, fire } = shooter([4, 5, 4, 6, 8]);
    expect(t.result(fire.id)).toMatchObject({ outcome: "win", winnings: 120 });
  });

  it("loses with fewer than four points", () => {
    const { t, fire } = shooter([4, 5, 6]);
    expect(t.result(fire.id)?.outcome).toBe("lose");
  });

  it("pays 999:1 as soon as all six points are made", () => {
    const { t, fire } = shooter([4, 5, 6, 8, 9, 10]);
    expect(t.result(fire.id)).toMatchObject({ outcome: "win", winnings: 4995 });
    expect(t.last.event).toBe("pointMade");
  });

  it("only goes up before the shooter's first roll", () => {
    const t = new Table();
    t.roll(8);
    expect(() => t.bet({ kind: "fire", amount: 5 })).toThrow(/new shooter/);
  });
});

describe("All Small / All Tall / Make 'Em All", () => {
  it("All Small wins when 2–6 all roll before a 7", () => {
    const t = new Table();
    const { bet: small } = t.bet({ kind: "allSmall", amount: 5 });
    const { bet: all } = t.bet({ kind: "makeEmAll", amount: 5 });
    for (const total of [2, 3, 4, 5, 3, 8]) t.roll(total === 2 ? [1, 1] : total);
    expect(t.has(small.id)).toBe(true);
    t.roll(6);
    expect(t.result(small.id)).toMatchObject({ outcome: "win", winnings: 170 });
    expect(t.has(all.id)).toBe(true);
    t.roll(7);
    expect(t.result(all.id)?.outcome).toBe("lose");
  });

  it("opens again only after a 7", () => {
    const t = new Table();
    t.roll(5);
    expect(() => t.bet({ kind: "allTall", amount: 5 })).toThrow(/after the next 7/);
    t.roll(7);
    expect(() => t.bet({ kind: "allTall", amount: 5 })).not.toThrow();
  });
});

describe("limits and taking bets down", () => {
  it("applies the table minimum to main bets but not to props", () => {
    const t = new Table(config({}, 10, 500));
    expect(() => t.bet({ kind: "pass", amount: 5 })).toThrow(/minimum/);
    expect(() => t.bet({ kind: "any7", amount: 1 })).not.toThrow();
    expect(() => t.bet({ kind: "field", amount: 600 })).toThrow(/maximum/);
  });

  it("adds to an existing bet instead of making a second one", () => {
    const t = new Table();
    t.bet({ kind: "place", number: 8, amount: 6 });
    t.bet({ kind: "place", number: 8, amount: 6 });
    expect(t.state.bets).toHaveLength(1);
    expect(t.state.bets[0].amount).toBe(12);
  });

  it("lets place bets come down, but not bonus bets once rolling", () => {
    const t = new Table();
    const { bet: place } = t.bet({ kind: "place", number: 5, amount: 10 });
    const { bet: fire } = t.bet({ kind: "fire", amount: 5 });
    expect(removeBet(t.state, P, fire.id).refund).toBe(5); // nobody has rolled yet
    t.roll(9);
    expect(removeBet(t.state, P, place.id).refund).toBe(10);
    expect(() => removeBet(t.state, P, fire.id)).toThrow(/stay up/);
    expect(() => removeBet(t.state, "p2", place.id)).toThrow(/isn't yours/);
  });
});

// ---------- House edges ----------

/** Exact expected loss (% of the bet) for a one-roll bet, over all 36 dice. */
function oneRollEdge(r: BetRequest, cfg = STD) {
  let net = 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      const t = new Table(cfg);
      const { bet } = t.bet(r);
      t.roll([a, b]);
      const res = t.result(bet.id)!;
      net += res.outcome === "lose" ? -r.amount : res.winnings;
    }
  }
  return (-net / 36 / r.amount) * 100;
}

describe("one-roll house edges (exact)", () => {
  const cases: [string, BetRequest, number, CrapsConfig?][] = [
    ["Field (12 pays 3x)", { kind: "field", amount: 10 }, 2.78],
    ["Field (12 pays 2x)", { kind: "field", amount: 10 }, 5.56, config({ field12: 2 })],
    ["Any 7", { kind: "any7", amount: 10 }, 16.67],
    ["Any Craps", { kind: "anyCraps", amount: 10 }, 11.11],
    ["Snake eyes (2)", { kind: "two", amount: 10 }, 13.89],
    ["Yo (11)", { kind: "yo", amount: 10 }, 11.11],
    ["Horn", { kind: "horn", amount: 40 }, 12.5],
    ["C&E", { kind: "ce", amount: 20 }, 11.11],
    ["World", { kind: "world", amount: 50 }, 13.33],
    ["Easy hop", { kind: "hop", amount: 10, dice: [2, 5] }, 11.11],
    ["Hard hop", { kind: "hop", amount: 10, dice: [3, 3] }, 13.89],
  ];
  for (const [name, r, edge, cfg] of cases) {
    it(`${name}: ${edge}%`, () => expect(oneRollEdge(r, cfg)).toBeCloseTo(edge, 1));
  }
});

/**
 * Plays a bet until it's decided, many times over, and returns the house
 * edge (% of each bet). Winning bets that stay up are taken down after one win.
 */
function simulatedEdge(setup: (t: Table) => string, cfg: CrapsConfig, decisions: number, seed = 7) {
  const rng = seededRandom(seed);
  const die = () => 1 + Math.floor(rng() * 6);
  let net = 0;
  let staked = 0;
  let t = new Table(cfg);
  for (let n = 0; n < decisions; ) {
    t.state = { ...t.state, bets: [] };
    const id = setup(t);
    const amount = t.state.bets.find((b) => b.id === id)!.amount;
    for (;;) {
      t.roll([die(), die()]);
      const res = t.result(id);
      if (!res || res.outcome === "moved") continue;
      if (res.outcome === "push" && res.stays) continue; // bar 12
      net += res.outcome === "lose" ? -amount : res.outcome === "win" ? res.winnings : 0;
      if (res.outcome !== "push") {
        staked += amount;
        n++;
      }
      break;
    }
    if (t.state.point !== null) t = new Table(cfg); // start every line bet on a come-out
  }
  return (-net / staked) * 100;
}

/** Within 0.3 percentage points of the published edge. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(0.3);

describe("multi-roll house edges (simulated)", { timeout: 60_000 }, () => {
  const D = 1_000_000;
  const line = (kind: BetKind) => (t: Table) => t.bet({ kind, amount: 10 }).bet.id;
  const always = (kind: BetKind, number: number, amount: number) => (t: Table) => {
    const { bet } = t.bet({ kind, number, amount });
    t.state = setOnComeOut(t.state, P, bet.id, true);
    return bet.id;
  };

  it("Pass Line ≈ 1.41%", () => near(simulatedEdge(line("pass"), STD, D), 1.41));
  it("Don't Pass ≈ 1.36% (ties not counted)", () => {
    // Per decided bet (bar-12 ties excluded) the edge is 1.40%.
    near(simulatedEdge(line("dontPass"), STD, D), 1.4);
  });
  it("Crapless Pass ≈ 5.38%", () => near(simulatedEdge(line("pass"), CRAPLESS, D), 5.38));
  it("Place 6 ≈ 1.52%", () => near(simulatedEdge(always("place", 6, 600), STD, D), 1.52));
  it("Place 5 ≈ 4.00%", () => near(simulatedEdge(always("place", 5, 500), STD, D), 4.0));
  it("Place 4 ≈ 6.67%", () => near(simulatedEdge(always("place", 4, 500), STD, D), 6.67));
  it("Buy 4, commission on wins ≈ 1.67%", () => {
    near(simulatedEdge(always("buy", 4, 1000), STD, D), 1.67);
  });
  it("Hard 6 ≈ 9.09%", () => near(simulatedEdge(always("hard", 6, 100), STD, D), 9.09));
  it("Big 8 ≈ 9.09%", () => {
    const big8 = (t: Table) => t.bet({ kind: "big8", amount: 100 }).bet.id;
    near(simulatedEdge(big8, STD, D), 9.09);
  });
});
