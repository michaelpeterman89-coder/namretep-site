import { describe, expect, it } from "vitest";
import { buildDecks, type Card } from "@/lib/games/deck";
import {
  actionOptions,
  applyAction,
  buildPots,
  IllegalPokerAction,
  publicHand,
  startHand,
  type PokerAction,
  type PokerConfig,
  type PokerHand,
} from "./engine";

const NL: PokerConfig = { variant: "holdem", structure: "no-limit", smallBlind: 5, bigBlind: 10, ante: 0 };

const players = (...stacks: number[]) => stacks.map((stack, i) => ({ playerId: `p${i}`, stack }));

/**
 * A deck where the listed cards come out first (in dealing order), followed
 * by the rest of the deck. Hole cards are dealt one at a time starting left of
 * the button; a burn card comes before each board deal.
 */
function stacked(...cards: string[]): Card[] {
  const first = cards.join(" ").split(/\s+/).filter(Boolean) as Card[];
  return [...first, ...buildDecks(1).filter((c) => !first.includes(c))];
}

function act(hand: PokerHand, ...actions: (string | [string, number])[]): PokerHand {
  return actions.reduce((h, a) => {
    const [type, amount] = Array.isArray(a) ? a : [a, undefined];
    return applyAction(h, { type: type as PokerAction["type"], seat: h.toAct!, amount });
  }, hand);
}

const chips = (h: PokerHand) => h.seats.reduce((sum, s) => sum + s.stack + (h.phase === "complete" ? 0 : s.total), 0);

describe("blinds and action order", () => {
  it("3-handed: small and big blind left of the button, under the gun acts first", () => {
    const h = startHand(NL, players(1000, 1000, 1000), 0);
    expect(h.seats.map((s) => s.committed)).toEqual([0, 5, 10]);
    expect(h.seats.map((s) => s.stack)).toEqual([1000, 995, 990]);
    expect(h.toAct).toBe(0);
    expect(h.seats.every((s) => s.hole.length === 2)).toBe(true);
    expect(actionOptions(h, 0)).toEqual({ fold: true, check: false, call: 10, raise: { min: 20, max: 1000 } });
    expect(actionOptions(h, 1)).toBeNull();
  });

  it("heads-up: the button posts the small blind and acts first before the flop, last after", () => {
    let h = startHand(NL, players(1000, 1000), 0);
    expect(h.seats.map((s) => s.committed)).toEqual([5, 10]);
    expect(h.toAct).toBe(0);
    h = act(h, "call", "check"); // big blind checks its option
    expect(h.street).toBe("flop");
    expect(h.board).toHaveLength(3);
    expect(h.toAct).toBe(1);
  });

  it("gives the big blind its option when everyone just calls", () => {
    let h = startHand(NL, players(1000, 1000, 1000), 0);
    h = act(h, "call", "call");
    expect(h.toAct).toBe(2);
    expect(actionOptions(h, 2)).toMatchObject({ check: true, raise: { min: 20, max: 1000 } });
  });

  it("deals the turn and river and goes to showdown when everyone checks", () => {
    let h = startHand(NL, players(1000, 1000, 1000), 0);
    h = act(h, "call", "call", "check");
    for (const street of ["flop", "turn", "river"]) {
      expect(h.street).toBe(street);
      h = act(h, "check", "check", "check");
    }
    expect(h.phase).toBe("complete");
    expect(h.board).toHaveLength(5);
    expect(h.result!.shown).toEqual([0, 1, 2]);
    expect(chips(h)).toBe(3000);
  });
});

describe("raising", () => {
  it("sets the minimum re-raise to the size of the last raise", () => {
    let h = startHand(NL, players(1000, 1000, 1000), 0);
    h = act(h, ["raise", 30]); // raise by 20
    expect(actionOptions(h, 1)!.raise).toEqual({ min: 50, max: 1000 });
    h = act(h, ["raise", 100]); // raise by 70
    expect(actionOptions(h, 2)!.raise).toEqual({ min: 170, max: 1000 });
  });

  it("rejects raises below the minimum or above the stack", () => {
    const h = startHand(NL, players(1000, 1000, 1000), 0);
    expect(() => act(h, ["raise", 15])).toThrow(IllegalPokerAction);
    expect(() => act(h, ["raise", 1001])).toThrow(IllegalPokerAction);
    expect(() => act(h, "check")).toThrow(IllegalPokerAction);
  });

  it("lets a short stack go all-in for less than a minimum raise", () => {
    let h = startHand(NL, players(1000, 45, 1000), 0);
    h = act(h, ["raise", 30]);
    expect(actionOptions(h, 1)!.raise).toEqual({ min: 45, max: 45 });
    h = act(h, ["raise", 45]);
    expect(h.seats[1].allIn).toBe(true);
  });

  it("doesn't reopen betting after a short all-in raise", () => {
    // UTG raises to 30; small blind is all-in for 45 (only 15 more, not a full raise).
    let h = startHand(NL, players(1000, 45, 1000), 0);
    h = act(h, ["raise", 30], ["raise", 45], "call"); // big blind calls 45
    expect(h.toAct).toBe(0);
    expect(actionOptions(h, 0)).toEqual({ fold: true, check: false, call: 15, raise: null });
  });

  it("does reopen betting after a full raise", () => {
    let h = startHand(NL, players(1000, 1000, 1000), 0);
    h = act(h, ["raise", 30], ["raise", 60], "call");
    expect(actionOptions(h, 0)!.raise).toEqual({ min: 90, max: 1000 });
  });

  it("calls the rest of a stack when the bet is bigger", () => {
    let h = startHand(NL, players(1000, 1000, 50), 0);
    h = act(h, ["raise", 200], "fold");
    expect(actionOptions(h, 2)).toEqual({ fold: true, check: false, call: 40, raise: null });
  });
});

describe("winning without a showdown", () => {
  it("gives the pot to the last player when everyone else folds", () => {
    let h = startHand(NL, players(1000, 1000, 1000), 0);
    h = act(h, ["raise", 30], "fold", "fold");
    expect(h.phase).toBe("complete");
    expect(h.result!.shown).toEqual([]);
    expect(h.seats.map((s) => s.stack)).toEqual([1015, 995, 990]);
    expect(h.board).toEqual([]);
  });
});

describe("all-ins, side pots, and splits", () => {
  it("builds a main pot, a side pot, and returns the uncalled bet", () => {
    const pots = buildPots([
      { total: 100, folded: false },
      { total: 300, folded: false },
      { total: 500, folded: false },
    ] as never);
    expect(pots).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
      { amount: 200, eligible: [2] },
    ]);
  });

  it("keeps folded players' chips in the pot but out of the running", () => {
    const pots = buildPots([
      { total: 50, folded: true },
      { total: 200, folded: false },
      { total: 200, folded: false },
    ] as never);
    expect(pots).toEqual([{ amount: 450, eligible: [1, 2] }]);
  });

  it("runs out the board when everyone is all-in and pays each pot to its best hand", () => {
    // Button p0 (100 chips), p1 (300), p2 (500). Deal order: p1, p2, p0, p1, p2, p0.
    // p0: AA, p1: KK, p2: QQ; board has no help.
    const deck = stacked("Kh Qd As Kd Qs Ac", "2c 3d 7h 9s", "2d 4h", "2s 8c");
    let h = startHand(NL, players(100, 300, 500), 0, { deck });
    // p2 can only call: everyone else is all-in, so there's nobody to raise against.
    expect(() => act(h, ["raise", 100], ["raise", 300], ["raise", 500])).toThrow(IllegalPokerAction);
    h = act(h, ["raise", 100], ["raise", 300], "call");
    expect(h.phase).toBe("complete");
    expect(h.board).toHaveLength(5);
    const pots = h.result!.pots.map((p) => [p.amount, p.winners]);
    expect(pots).toEqual([
      [300, [0]], // AA wins the main pot
      [400, [1]], // KK beats QQ for the side pot
    ]);
    // p2 only had to put in 300, so 200 never left their stack.
    expect(h.seats.map((s) => s.stack)).toEqual([300, 400, 200]);
  });

  it("splits a tied pot and gives the odd chip to the first winner after the button", () => {
    // Board is a royal flush: everyone ties. Three players, 5 + 10 + 10 = 25 in the pot.
    const deck = stacked("2c 3c 4c 2d 3d 4d", "5c Ah Kh Qh", "6c Jh", "7c Th");
    let h = startHand(NL, players(100, 100, 100), 0, { deck });
    h = act(h, "call", "call", "check", "check", "check", "check", "check", "check", "check", "check", "check", "check");
    expect(h.result!.pots).toHaveLength(1);
    expect(h.result!.pots[0]).toMatchObject({ amount: 30, winners: [0, 1, 2], hand: "Royal Flush" });
    expect(h.seats.map((s) => s.stack)).toEqual([100, 100, 100]);

    // The button folds; the blinds split 10 + 10 evenly.
    let odd = startHand({ ...NL, smallBlind: 5, bigBlind: 10 }, players(100, 100, 100), 0, { deck });
    odd = act(odd, "fold", "call", "check", "check", "check", "check", "check", "check", "check");
    expect(odd.seats.map((s) => s.stack)).toEqual([100, 100, 100]);
  });

  it("gives the odd chip to the first winner left of the button", () => {
    // A 1-chip ante from each of three players makes the pot odd: 3 + 10 + 10 = 23.
    const deck = stacked("2c 3c 4c 2d 3d 4d", "5c Ah Kh Qh", "6c Jh", "7c Th");
    let h = startHand({ ...NL, ante: 1 }, players(100, 100, 100), 0, { deck });
    h = act(h, "fold", "call", "check", "check", "check", "check", "check", "check", "check");
    // Pot: antes 3 + blinds 20 = 23, split between p1 and p2: 12 to p1 (first after button), 11 to p2.
    expect(h.result!.payouts).toEqual([0, 12, 11]);
  });
});

describe("variants", () => {
  it("deals four hole cards in Omaha and uses exactly two of them", () => {
    const h = startHand({ ...NL, variant: "omaha" }, players(500, 500), 0);
    expect(h.seats.every((s) => s.hole.length === 4)).toBe(true);
  });
});

describe("what players can see", () => {
  it("shows only your own hole cards until showdown", () => {
    let h = startHand(NL, players(1000, 1000, 1000), 0);
    const view = publicHand(h, "p1");
    expect(view.seats[1].hole).toHaveLength(2);
    expect(view.seats[0].hole).toEqual([]);
    expect(view.seats[0].holeCount).toBe(2);
    expect(view).not.toHaveProperty("deck");
    expect(JSON.stringify(view)).not.toContain(h.seats[0].hole[0]);

    h = act(h, "call", "call", "check", "check", "check", "check", "check", "check", "check", "check", "check", "check");
    const after = publicHand(h, "p1");
    expect(after.seats[0].hole).toHaveLength(2);
  });

  it("never shows folded hands", () => {
    let h = startHand(NL, players(1000, 1000, 1000), 0);
    h = act(h, "fold", "call", "check", "check", "check", "check", "check", "check", "check");
    expect(publicHand(h, "p1").seats[0].hole).toEqual([]);
  });
});

describe("random hands", () => {
  it("always finish, never go negative, and never create or lose chips", () => {
    const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
    for (let n = 0; n < 3000; n++) {
      const count = 2 + Math.floor(Math.random() * 8);
      const stacks = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 400));
      const start = stacks.reduce((a, b) => a + b, 0);
      let h = startHand(
        { ...NL, variant: pick(["holdem", "omaha"] as const), ante: pick([0, 0, 1]) },
        players(...stacks),
        Math.floor(Math.random() * count),
      );
      for (let steps = 0; h.phase !== "complete"; steps++) {
        expect(steps).toBeLessThan(500);
        const o = actionOptions(h, h.toAct!)!;
        const choices: [PokerAction["type"], number?][] = [];
        if (o.fold) choices.push(["fold"]);
        if (o.check) choices.push(["check"]);
        if (o.call > 0) choices.push(["call"], ["call"]);
        if (o.raise) choices.push(["raise", o.raise.min], ["raise", o.raise.max]);
        const [type, amount] = pick(choices);
        h = applyAction(h, { type, seat: h.toAct!, amount });
        expect(h.seats.every((s) => s.stack >= 0)).toBe(true);
      }
      expect(h.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(start);
      expect(h.result!.payouts.reduce((a, b) => a + b, 0)).toBe(h.seats.reduce((sum, s) => sum + s.total, 0));
      if (h.result!.shown.length > 1) expect(h.board).toHaveLength(5);
    }
  });
});
