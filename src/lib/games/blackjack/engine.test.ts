import { describe, expect, it } from "vitest";
import { buildDecks, handValue, isBust, type Card, type Shoe } from "./cards";
import {
  actionCost,
  applyAction,
  IllegalActionError,
  isPlayerBlackjack,
  legalActions,
  publicView,
  seatReturned,
  seatWagered,
  startRound,
  type ActionType,
  type BlackjackRound,
} from "./engine";
import { DEFAULT_RULES, type BlackjackRules } from "./rules";

// ---------- Test helpers ----------

const rules = (overrides: Partial<BlackjackRules> = {}): BlackjackRules => ({
  ...DEFAULT_RULES,
  insurance: false,
  ...overrides,
});

/** A full-size shoe whose first cards are `cards`, in dealing order. Filler is all 2s. */
function stacked(r: BlackjackRules, cards: Card[]): Shoe {
  const size = r.decks * 52;
  return { cards: [...cards, ...Array<Card>(size - cards.length).fill("2c")], size };
}

/**
 * Starts a one-seat round with a bet of 100.
 * Dealing order: player, dealer up, player, dealer hole (peek games only), then `rest`.
 */
function deal(r: BlackjackRules, player: [Card, Card], dealer: Card[], rest: Card[] = []): BlackjackRound {
  const order = r.dealerPeeks
    ? [player[0], dealer[0], player[1], dealer[1], ...rest]
    : [player[0], dealer[0], player[1], ...rest];
  return startRound(r, stacked(r, order), [{ playerId: "p1", bet: 100 }]);
}

function play(r: BlackjackRules, round: BlackjackRound, ...actions: ActionType[]): BlackjackRound {
  return actions.reduce((state, type) => applyAction(r, state, { type, seat: 0 }), round);
}

const hand = (round: BlackjackRound, i = 0) => round.seats[0].hands[i];

// ---------- Basic results ----------

describe("basic results", () => {
  const r = rules();

  it("pays 1:1 when the player beats the dealer", () => {
    const round = play(r, deal(r, ["Ts", "Qh"], ["9d", "Tc"]), "stand");
    expect(round.phase).toBe("settled");
    expect(hand(round)).toMatchObject({ outcome: "win", returned: 200 });
  });

  it("returns the bet on a push", () => {
    const round = play(r, deal(r, ["Ts", "8h"], ["9d", "9c"]), "stand");
    expect(hand(round)).toMatchObject({ outcome: "push", returned: 100 });
  });

  it("loses when the dealer is higher", () => {
    const round = play(r, deal(r, ["Ts", "7h"], ["9d", "Tc"]), "stand");
    expect(hand(round)).toMatchObject({ outcome: "lose", returned: 0 });
  });

  it("busts, and the dealer doesn't draw when nobody is left", () => {
    const round = play(r, deal(r, ["Ts", "6h"], ["9d", "5c"], ["Kd"]), "hit");
    expect(hand(round)).toMatchObject({ outcome: "bust", returned: 0 });
    expect(round.dealer).toEqual(["9d", "5c"]);
  });

  it("wins when the dealer busts", () => {
    const round = play(r, deal(r, ["Ts", "2h"], ["6d", "Tc"], ["Kd"]), "stand");
    expect(round.dealer).toEqual(["6d", "Tc", "Kd"]);
    expect(hand(round)).toMatchObject({ outcome: "win", returned: 200 });
  });

  it("stands automatically on 21", () => {
    const round = play(r, deal(r, ["7s", "4h"], ["9d", "Tc"], ["Kd"]), "hit");
    expect(handValue(hand(round).cards).total).toBe(21);
    expect(round.phase).toBe("settled");
    expect(hand(round).outcome).toBe("win");
  });
});

// ---------- Blackjack payouts ----------

describe("blackjack", () => {
  it.each<[BlackjackRules["blackjackPayout"], number]>([
    ["3:2", 250],
    ["6:5", 220],
    ["1:1", 200],
  ])("pays %s", (payout, returned) => {
    const r = rules({ blackjackPayout: payout });
    const round = deal(r, ["As", "Kh"], ["9d", "Tc"]);
    expect(round.phase).toBe("settled");
    expect(hand(round)).toMatchObject({ outcome: "blackjack", returned });
    expect(round.dealer).toEqual(["9d", "Tc"]); // dealer doesn't draw against only a blackjack
  });

  it("rounds odd payouts down (3:2 on 5 pays 7)", () => {
    const r = rules();
    const round = startRound(r, stacked(r, ["As", "9d", "Kh", "Tc"]), [{ playerId: "p1", bet: 5 }]);
    expect(hand(round).returned).toBe(12);
  });

  it("pushes against a dealer blackjack", () => {
    const r = rules();
    const round = deal(r, ["As", "Kh"], ["Td", "Ac"]);
    expect(hand(round)).toMatchObject({ outcome: "push", returned: 100 });
    expect(round.dealerBlackjack).toBe(true);
  });
});

// ---------- Dealer peek and insurance ----------

describe("dealer peek", () => {
  it("ends the round at once when the dealer has blackjack under a ten", () => {
    const r = rules();
    const round = deal(r, ["Ts", "9h"], ["Kd", "Ac"]);
    expect(round.phase).toBe("settled");
    expect(hand(round)).toMatchObject({ outcome: "lose", returned: 0 });
  });

  it("marks the round as peeked when the dealer doesn't have blackjack", () => {
    const r = rules();
    const round = deal(r, ["Ts", "9h"], ["Kd", "7c"]);
    expect(round.phase).toBe("playing");
    expect(round.peeked).toBe(true);
  });
});

describe("insurance", () => {
  const r = rules({ insurance: true });

  it("is offered against an ace, before play", () => {
    const round = deal(r, ["Ts", "9h"], ["Ad", "Kc"]);
    expect(round.phase).toBe("early");
    expect(legalActions(r, round, 0)).toEqual(["insurance", "decline"]);
  });

  it("pays 2:1 when the dealer has blackjack", () => {
    const round = play(r, deal(r, ["Ts", "9h"], ["Ad", "Kc"]), "insurance");
    expect(round.phase).toBe("settled");
    const seat = round.seats[0];
    expect(seat.insurance).toBe(50);
    expect(seat.insuranceReturned).toBe(150);
    expect(seatWagered(seat)).toBe(150);
    expect(seatReturned(seat)).toBe(150); // broke even
  });

  it("is lost when the dealer doesn't have blackjack, then play continues", () => {
    let round = play(r, deal(r, ["Ts", "9h"], ["Ad", "7c"]), "insurance");
    expect(round.phase).toBe("playing");
    expect(round.peeked).toBe(true);
    round = play(r, round, "stand");
    expect(round.seats[0].insuranceReturned).toBe(0);
    expect(hand(round).outcome).toBe("win");
  });

  it("works as even money for a player blackjack", () => {
    const vsBlackjack = play(r, deal(r, ["As", "Kh"], ["Ad", "Kc"]), "insurance");
    expect(seatReturned(vsBlackjack.seats[0]) - seatWagered(vsBlackjack.seats[0])).toBe(100);

    const vsNothing = play(r, deal(r, ["As", "Kh"], ["Ad", "7c"]), "insurance");
    expect(seatReturned(vsNothing.seats[0]) - seatWagered(vsNothing.seats[0])).toBe(100);
  });

  it("isn't offered when the table turns it off", () => {
    const round = deal(rules({ insurance: false }), ["Ts", "9h"], ["Ad", "7c"]);
    expect(round.phase).toBe("playing");
  });
});

// ---------- Dealer soft 17 ----------

describe("dealer soft 17", () => {
  it("S17: dealer stands on soft 17", () => {
    const r = rules({ dealerHitsSoft17: false });
    const round = play(r, deal(r, ["Ts", "8h"], ["Ad", "6c"], ["3d"]), "stand");
    expect(round.dealer).toEqual(["Ad", "6c"]);
    expect(hand(round).outcome).toBe("win");
  });

  it("H17: dealer hits soft 17", () => {
    const r = rules({ dealerHitsSoft17: true });
    const round = play(r, deal(r, ["Ts", "8h"], ["Ad", "6c"], ["3d"]), "stand");
    expect(round.dealer).toEqual(["Ad", "6c", "3d"]);
    expect(hand(round).outcome).toBe("lose");
  });

  it("both stand on hard 17", () => {
    const r = rules({ dealerHitsSoft17: true });
    const round = play(r, deal(r, ["Ts", "8h"], ["Td", "7c"], ["3d"]), "stand");
    expect(round.dealer).toEqual(["Td", "7c"]);
  });
});

// ---------- Doubling ----------

describe("double down", () => {
  it("doubles the bet, takes one card, and is paid on the doubled bet", () => {
    const r = rules();
    const start = deal(r, ["6s", "5h"], ["9d", "7c"], ["Td", "4c"]);
    expect(actionCost(start, { type: "double", seat: 0 })).toBe(100);
    const round = play(r, start, "double");
    expect(hand(round)).toMatchObject({ cards: ["6s", "5h", "Td"], bet: 200, doubled: true, outcome: "win", returned: 400 });
  });

  it("can't double after hitting", () => {
    const r = rules();
    const round = play(r, deal(r, ["2s", "3h"], ["9d", "7c"], ["4d"]), "hit");
    expect(legalActions(r, round, 0)).not.toContain("double");
  });

  it.each<[BlackjackRules["doubleOn"], [Card, Card], boolean]>([
    ["any", ["Ts", "6h"], true],
    ["any", ["As", "7h"], true],
    ["9-11", ["5s", "4h"], true],
    ["9-11", ["6s", "5h"], true],
    ["9-11", ["Ts", "2h"], false],
    ["9-11", ["As", "8h"], false],
    ["10-11", ["5s", "4h"], false],
    ["10-11", ["6s", "4h"], true],
  ])("doubleOn %s with %j: %s", (doubleOn, cards, allowed) => {
    const r = rules({ doubleOn });
    const round = deal(r, cards, ["9d", "7c"]);
    expect(legalActions(r, round, 0).includes("double")).toBe(allowed);
  });
});

// ---------- Splitting ----------

describe("splitting", () => {
  it("splits a pair, dealing each hand's second card when it comes up", () => {
    const r = rules({ doubleAfterSplit: true });
    let round = deal(r, ["8s", "8h"], ["6d", "Tc"], ["3d", "Ts", "9d", "9c"]);
    expect(actionCost(round, { type: "split", seat: 0 })).toBe(100);

    round = play(r, round, "split");
    expect(hand(round, 0).cards).toEqual(["8s", "3d"]);
    expect(hand(round, 1).cards).toEqual(["8h"]); // not dealt yet
    expect(legalActions(r, round, 0)).toContain("double"); // DAS

    round = play(r, round, "double"); // 8+3+T = 21
    expect(hand(round, 1).cards).toEqual(["8h", "9d"]);
    expect(round.turn).toEqual({ seat: 0, hand: 1 });

    round = play(r, round, "stand"); // dealer 16 draws 9c and busts
    expect(round.dealer).toEqual(["6d", "Tc", "9c"]);
    expect(hand(round, 0)).toMatchObject({ outcome: "win", returned: 400 });
    expect(hand(round, 1)).toMatchObject({ outcome: "win", returned: 200 });
    expect(seatWagered(round.seats[0])).toBe(300);
    expect(seatReturned(round.seats[0])).toBe(600);
  });

  it("doesn't allow doubling after a split without DAS", () => {
    const r = rules({ doubleAfterSplit: false });
    const round = play(r, deal(r, ["8s", "8h"], ["6d", "Tc"], ["3d"]), "split");
    expect(legalActions(r, round, 0)).not.toContain("double");
  });

  it("lets any two ten-value cards split", () => {
    const r = rules();
    expect(legalActions(r, deal(r, ["Ks", "Th"], ["6d", "Tc"]), 0)).toContain("split");
    expect(legalActions(r, deal(r, ["Ks", "9h"], ["6d", "Tc"]), 0)).not.toContain("split");
  });

  it("counts a two-card 21 after splitting as 21, not blackjack", () => {
    const r = rules();
    const round = play(r, deal(r, ["Ks", "Kh"], ["9d", "Tc"], ["Ad", "9s"]), "split", "stand");
    expect(isPlayerBlackjack(hand(round, 0))).toBe(false);
    expect(hand(round, 0)).toMatchObject({ outcome: "win", returned: 200 });
  });

  it("limits the number of hands", () => {
    const r = rules({ maxSplitHands: 2 });
    const round = play(r, deal(r, ["8s", "8h"], ["6d", "Tc"], ["8d"]), "split");
    expect(hand(round, 0).cards).toEqual(["8s", "8d"]);
    expect(legalActions(r, round, 0)).not.toContain("split");

    const r4 = rules({ maxSplitHands: 4 });
    const round4 = play(r4, deal(r4, ["8s", "8h"], ["6d", "Tc"], ["8d"]), "split");
    expect(legalActions(r4, round4, 0)).toContain("split");
  });

  it("gives split aces one card each when they can't be hit", () => {
    const r = rules({ hitSplitAces: false });
    const round = play(r, deal(r, ["As", "Ah"], ["9d", "Tc"], ["5d", "Ts"]), "split");
    expect(round.phase).toBe("settled");
    expect(hand(round, 0).cards).toEqual(["As", "5d"]);
    expect(hand(round, 1)).toMatchObject({ cards: ["Ah", "Ts"], outcome: "win" }); // 21, not blackjack
    expect(hand(round, 0).outcome).toBe("lose");
  });

  it("allows hitting split aces when the table permits it", () => {
    const r = rules({ hitSplitAces: true });
    const round = play(r, deal(r, ["As", "Ah"], ["9d", "Tc"], ["5d"]), "split");
    expect(legalActions(r, round, 0)).toContain("hit");
  });

  it("only re-splits aces when allowed", () => {
    const noRsa = rules({ resplitAces: false });
    const a = play(noRsa, deal(noRsa, ["As", "Ah"], ["9d", "Tc"], ["Ad", "5s"]), "split");
    expect(a.turn).toBeNull(); // both aces locked, round over

    const rsa = rules({ resplitAces: true });
    const b = play(rsa, deal(rsa, ["As", "Ah"], ["9d", "Tc"], ["Ad", "5s"]), "split");
    expect(legalActions(rsa, b, 0)).toEqual(["stand", "split"]);
    const c = play(rsa, b, "split");
    expect(c.seats[0].hands).toHaveLength(3);
  });
});

// ---------- Surrender ----------

describe("surrender", () => {
  it("late: gives back half the bet", () => {
    const r = rules({ surrender: "late" });
    const round = play(r, deal(r, ["Ts", "6h"], ["Td", "7c"]), "surrender");
    expect(hand(round)).toMatchObject({ outcome: "surrender", returned: 50 });
    expect(round.dealer).toEqual(["Td", "7c"]); // dealer doesn't draw for nobody
  });

  it("isn't allowed after hitting, after splitting, or when turned off", () => {
    const r = rules({ surrender: "late" });
    expect(legalActions(r, play(r, deal(r, ["2s", "3h"], ["Td", "7c"], ["4d"]), "hit"), 0)).not.toContain("surrender");
    expect(legalActions(r, play(r, deal(r, ["8s", "8h"], ["Td", "7c"], ["3d"]), "split"), 0)).not.toContain("surrender");
    const off = rules({ surrender: "none" });
    expect(legalActions(off, deal(off, ["Ts", "6h"], ["Td", "7c"]), 0)).not.toContain("surrender");
  });

  it("late: can't escape a dealer blackjack when the dealer peeks", () => {
    const r = rules({ surrender: "late" });
    const round = deal(r, ["Ts", "6h"], ["Td", "Ac"]);
    expect(round.phase).toBe("settled");
    expect(hand(round).outcome).toBe("lose");
  });

  it("early: can surrender before the peek and get half back against a blackjack", () => {
    const r = rules({ surrender: "early" });
    let round = deal(r, ["Ts", "6h"], ["Td", "Ac"]);
    expect(round.phase).toBe("early");
    expect(legalActions(r, round, 0)).toEqual(["surrender", "decline"]);
    round = play(r, round, "surrender");
    expect(round.phase).toBe("settled");
    expect(hand(round)).toMatchObject({ outcome: "surrender", returned: 50 });
  });

  it("early: skips the pre-peek step for a player blackjack", () => {
    const r = rules({ surrender: "early" });
    const round = deal(r, ["As", "Kh"], ["Td", "7c"]);
    expect(round.phase).toBe("settled");
    expect(hand(round).outcome).toBe("blackjack");
  });
});

// ---------- No hole card (European) ----------

describe("no-peek (ENHC) games", () => {
  const r = rules({ dealerPeeks: false });

  it("deals the dealer one card, then the second after players act", () => {
    const round = deal(r, ["Ts", "8h"], ["Ad"], ["Kc"]);
    expect(round.dealer).toEqual(["Ad"]);
    expect(round.phase).toBe("playing");
    const done = play(r, round, "stand");
    expect(done.dealer).toEqual(["Ad", "Kc"]);
    expect(done.dealerBlackjack).toBe(true);
  });

  it("loses doubled bets to a dealer blackjack", () => {
    const round = play(r, deal(r, ["6s", "5h"], ["Td"], ["9c", "Ac"]), "double");
    expect(hand(round)).toMatchObject({ bet: 200, outcome: "lose", returned: 0 });
  });

  it("late surrender loses the full bet to a dealer blackjack", () => {
    const late = rules({ dealerPeeks: false, surrender: "late" });
    const round = play(late, deal(late, ["Ts", "6h"], ["Td"], ["Ac"]), "surrender");
    expect(hand(round)).toMatchObject({ outcome: "lose", returned: 0 });
  });

  it("early surrender still returns half against a dealer blackjack", () => {
    const early = rules({ dealerPeeks: false, surrender: "early" });
    const round = play(early, deal(early, ["Ts", "6h"], ["Td"], ["Ac"]), "surrender");
    expect(hand(round)).toMatchObject({ outcome: "surrender", returned: 50 });
  });
});

// ---------- What players can see ----------

describe("publicView", () => {
  it("hides the hole card and the shoe until the round is settled", () => {
    const r = rules();
    const round = deal(r, ["Ts", "8h"], ["9d", "8c"]);
    const view = publicView(round);
    expect(view.dealer).toEqual(["9d"]);
    expect(view.dealerHidden).toBe(1);
    expect(view).not.toHaveProperty("shoe");
    expect(JSON.stringify(view)).not.toContain("8c");

    const settled = publicView(play(r, round, "stand"));
    expect(settled.dealer).toEqual(["9d", "8c"]);
    expect(settled.dealerHidden).toBe(0);
  });
});

// ---------- Turns, legality, and the shoe ----------

describe("turns and legality", () => {
  it("plays seats in order and rejects out-of-turn actions", () => {
    const r = rules();
    const shoe = stacked(r, ["Ts", "5h", "9d", "Th", "8c", "7c"]); // seat0 T,T  seat1 5,8  dealer 9,7
    let round = startRound(r, shoe, [
      { playerId: "a", bet: 10 },
      { playerId: "b", bet: 20 },
    ]);
    expect(round.turn).toEqual({ seat: 0, hand: 0 });
    expect(legalActions(r, round, 1)).toEqual([]);
    expect(() => applyAction(r, round, { type: "stand", seat: 1 })).toThrow(IllegalActionError);

    round = applyAction(r, round, { type: "stand", seat: 0 });
    expect(round.turn).toEqual({ seat: 1, hand: 0 });
  });

  it("doesn't change the original state when an action is applied or rejected", () => {
    const r = rules();
    const round = deal(r, ["Ts", "6h"], ["9d", "7c"], ["Kd"]);
    const before = structuredClone(round);
    applyAction(r, round, { type: "hit", seat: 0 });
    expect(() => applyAction(r, round, { type: "insurance", seat: 0 })).toThrow(IllegalActionError);
    expect(round).toEqual(before);
  });

  it("rejects bad bets", () => {
    const r = rules();
    expect(() => startRound(r, null, [])).toThrow(IllegalActionError);
    expect(() => startRound(r, null, [{ playerId: "a", bet: 0 }])).toThrow(IllegalActionError);
    expect(() => startRound(r, null, [{ playerId: "a", bet: 2.5 }])).toThrow(IllegalActionError);
  });
});

describe("shoe handling", () => {
  it("reshuffles when there's no shoe, the deck count changed, or the cut card is reached", () => {
    const r = rules({ decks: 6, penetration: 0.75 });
    const bet = [{ playerId: "a", bet: 10 }];
    expect(startRound(r, null, bet).reshuffled).toBe(true);
    expect(startRound(r, { cards: buildDecks(1), size: 52 }, bet).reshuffled).toBe(true);
    expect(startRound(r, { cards: buildDecks(6).slice(234), size: 312 }, bet).reshuffled).toBe(true);
    expect(startRound(r, { cards: buildDecks(6).slice(100), size: 312 }, bet).reshuffled).toBe(false);
  });

  it("reshuffles the cards not on the table if the shoe runs out mid-round", () => {
    const r = rules({ decks: 1 });
    let round = deal(r, ["2s", "3h"], ["9d", "7c"]);
    round = { ...round, shoe: { cards: [], size: 52 } };
    round = play(r, round, "hit");
    const onTable = [...round.dealer, ...hand(round).cards];
    expect(new Set(onTable).size).toBe(onTable.length);
    expect(round.shoe.cards.length + onTable.length).toBe(52);
  });
});

// ---------- Random play ----------

describe("random rounds", () => {
  it("always finish with consistent payouts under random rules and choices", () => {
    const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
    for (let i = 0; i < 3000; i++) {
      const r: BlackjackRules = {
        decks: pick([1, 2, 4, 6, 8] as const),
        dealerHitsSoft17: pick([true, false]),
        blackjackPayout: pick(["3:2", "6:5", "1:1"] as const),
        dealerPeeks: pick([true, false]),
        doubleOn: pick(["any", "9-11", "10-11"] as const),
        doubleAfterSplit: pick([true, false]),
        maxSplitHands: pick([2, 3, 4] as const),
        resplitAces: pick([true, false]),
        hitSplitAces: pick([true, false]),
        surrender: pick(["none", "late", "early"] as const),
        insurance: pick([true, false]),
        penetration: 0.85,
      };
      const seats = 1 + Math.floor(Math.random() * 7);
      let round = startRound(
        r,
        null,
        Array.from({ length: seats }, (_, s) => ({ playerId: `p${s}`, bet: 1 + Math.floor(Math.random() * 500) })),
      );

      for (let steps = 0; round.phase !== "settled"; steps++) {
        expect(steps).toBeLessThan(200);
        const seat = round.phase === "playing" ? round.turn!.seat : round.seats.findIndex((s) => !s.earlyDecided);
        const actions = legalActions(r, round, seat);
        expect(actions.length).toBeGreaterThan(0);
        round = applyAction(r, round, { type: pick(actions), seat });
      }

      const live = round.seats.flatMap((s) => s.hands).some((h) => !h.surrendered && !isBust(h.cards) && !isPlayerBlackjack(h));
      if (live && !round.dealerBlackjack) expect(handValue(round.dealer).total).toBeGreaterThanOrEqual(17);
      for (const seat of round.seats) {
        expect(seat.hands.length).toBeLessThanOrEqual(r.maxSplitHands);
        for (const h of seat.hands) {
          expect(h.done).toBe(true);
          expect(h.returned).toBeGreaterThanOrEqual(0);
          expect(h.returned).toBeLessThanOrEqual(h.bet * 2.5);
        }
      }
    }
  });
});
