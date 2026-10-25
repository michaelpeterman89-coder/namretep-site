import { cardValue, handValue, type Card } from "./cards";
import type { ActionType } from "./engine";
import type { BlackjackRules } from "./rules";

// Basic strategy, worked out from the math for a table's exact rules instead
// of typed-in charts.
//
// For every two-card starting hand and dealer upcard, we compute the expected
// value (EV) of each play: the dealer's chances are exact for the shoe after
// removing the player's two cards and the upcard, and the player's later
// draws come from that same shoe. A chart row (e.g. "hard 16") averages the
// EVs of every two-card hand that makes it, weighted by how often each is
// dealt, so it's a chart a person could memorize (total-dependent strategy).

type Counts = number[]; // index 1..10 = card value (1 = ace, 10 = any ten-value card)
type Play = "stand" | "hit" | "double" | "split" | "surrender";
type PlayEVs = Record<Play, number>;

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const PLAYS: Play[] = ["stand", "hit", "double", "split", "surrender"];

function fullShoe(decks: number): Counts {
  const counts = new Array<number>(11).fill(4 * decks);
  counts[0] = 0;
  counts[10] = 16 * decks;
  return counts;
}

function total(counts: Counts): number {
  let n = 0;
  for (const v of VALUES) n += counts[v];
  return n;
}

function softValue(hard: number, hasAce: boolean): number {
  return hasAce && hard + 10 <= 21 ? hard + 10 : hard;
}

// ---------- Dealer ----------

/** Final dealer outcome probabilities: index 0..4 = 17..21, 5 = bust. */
type DealerDist = number[];

function dealerDraw(
  counts: Counts,
  n: number,
  hard: number,
  hasAce: boolean,
  hitsSoft17: boolean,
  memo: Map<string, DealerDist>,
): DealerDist {
  const value = softValue(hard, hasAce);
  if (value > 21) return [0, 0, 0, 0, 0, 1];
  const soft17 = value === 17 && hasAce && hard + 10 === 17;
  if (value >= 17 && !(soft17 && hitsSoft17)) {
    const result = [0, 0, 0, 0, 0, 0];
    result[value - 17] = 1;
    return result;
  }

  const key = `${counts.join(",")}|${hard}|${hasAce ? 1 : 0}`;
  const cached = memo.get(key);
  if (cached) return cached;

  const result = [0, 0, 0, 0, 0, 0];
  for (const v of VALUES) {
    if (counts[v] === 0) continue;
    const p = counts[v] / n;
    counts[v]--;
    const next = dealerDraw(counts, n - 1, hard + v, hasAce || v === 1, hitsSoft17, memo);
    counts[v]++;
    for (let i = 0; i < 6; i++) result[i] += p * next[i];
  }
  memo.set(key, result);
  return result;
}

/** Dealer outcomes given no blackjack, plus the chance of a blackjack. */
function dealerOutcome(counts: Counts, up: number, hitsSoft17: boolean) {
  const n = total(counts);
  const blackjackHole = up === 1 ? 10 : up === 10 ? 1 : 0;
  const pBlackjack = blackjackHole ? counts[blackjackHole] / n : 0;
  const memo = new Map<string, DealerDist>();
  const dist = [0, 0, 0, 0, 0, 0];
  for (const hole of VALUES) {
    if (counts[hole] === 0 || hole === blackjackHole) continue;
    const w = counts[hole] / n / (1 - pBlackjack);
    counts[hole]--;
    const next = dealerDraw(counts, n - 1, up + hole, up === 1 || hole === 1, hitsSoft17, memo);
    counts[hole]++;
    for (let i = 0; i < 6; i++) dist[i] += w * next[i];
  }
  return { dist, pBlackjack };
}

// ---------- Player ----------

function canDoubleTotal(rules: BlackjackRules, hard: number, hasAce: boolean): boolean {
  if (rules.doubleOn === "any") return true;
  if (softValue(hard, hasAce) !== hard) return false; // soft hand
  return rules.doubleOn === "9-11" ? hard >= 9 && hard <= 11 : hard >= 10 && hard <= 11;
}

/**
 * EVs (per original bet, assuming the dealer doesn't have blackjack) for a
 * two-card hand `a`,`b` against `up`, drawing from `counts`.
 */
function handEVs(rules: BlackjackRules, counts: Counts, up: number, a: number, b: number) {
  const { dist, pBlackjack } = dealerOutcome(counts, up, rules.dealerHitsSoft17);
  const n = total(counts);
  const p = VALUES.map((v) => counts[v] / n);

  const standByTotal: number[] = [];
  for (let t = 0; t <= 21; t++) {
    let ev = dist[5];
    for (let i = 0; i < 5; i++) ev += 17 + i < t ? dist[i] : 17 + i > t ? -dist[i] : 0;
    standByTotal[t] = ev;
  }
  const stand = (value: number) => (value > 21 ? -1 : standByTotal[value]);

  const bestMemo = new Map<number, number>();
  const best = (hard: number, hasAce: boolean): number => {
    const value = softValue(hard, hasAce);
    if (value > 21) return -1;
    if (value === 21) return stand(21);
    const key = hard * 2 + (hasAce ? 1 : 0);
    let ev = bestMemo.get(key);
    if (ev === undefined) {
      ev = Math.max(stand(value), hit(hard, hasAce));
      bestMemo.set(key, ev);
    }
    return ev;
  };
  const hit = (hard: number, hasAce: boolean): number =>
    VALUES.reduce((sum, v, i) => sum + p[i] * best(hard + v, hasAce || v === 1), 0);
  const double = (hard: number, hasAce: boolean): number =>
    2 * VALUES.reduce((sum, v, i) => sum + p[i] * stand(softValue(hard + v, hasAce || v === 1)), 0);

  const hard = a + b;
  const hasAce = a === 1 || b === 1;
  const evs: PlayEVs = {
    stand: stand(softValue(hard, hasAce)),
    hit: hit(hard, hasAce),
    double: double(hard, hasAce),
    split: Number.NEGATIVE_INFINITY,
    surrender: -0.5,
  };

  if (a === b) {
    // Each split hand gets one more card and is then played out. Re-splitting
    // is ignored; it only nudges split values up slightly.
    const oneHand = VALUES.reduce((sum, y, i) => {
      const h = a + y;
      const ace = a === 1 || y === 1;
      const value = softValue(h, ace);
      let ev: number;
      if (a === 1 && !rules.hitSplitAces) ev = stand(value);
      else if (value === 21) ev = stand(21);
      else {
        ev = Math.max(stand(value), hit(h, ace));
        if (rules.doubleAfterSplit && canDoubleTotal(rules, h, ace)) ev = Math.max(ev, double(h, ace));
      }
      return sum + p[i] * ev;
    }, 0);
    evs.split = 2 * oneHand;
  }

  return { evs, pBlackjack };
}

// ---------- Charts ----------

/** Chart row ids: "H4".."H20" hard totals, "S12".."S20" soft totals, "P1".."P10" pairs (1 = aces). */
export type RowKey = `H${number}` | `S${number}` | `P${number}`;

export type ChartCell = {
  /** EV of each play once the dealer is known not to have blackjack (or, in no-peek games, including that risk). */
  evs: PlayEVs;
  /** Surrender before the dealer checks for blackjack (early-surrender tables only). */
  earlySurrender: boolean;
};

/** cells[row][upcard] with upcard 1..10. */
export type StrategyChart = Record<RowKey, ChartCell[]>;

function rowsFor(a: number, b: number): RowKey[] {
  const rows: RowKey[] = [];
  if (a === b) rows.push(`P${a}`);
  if (a === 1 && b === 1) rows.push("S12");
  else if (a === 1 || b === 1) rows.push(`S${a + b + 10}`);
  else rows.push(`H${a + b}`);
  return rows;
}

function buildChart(rules: BlackjackRules): StrategyChart {
  const shoe = fullShoe(rules.decks);
  const chart = {} as StrategyChart;

  for (const up of VALUES) {
    type Acc = { weight: number; evs: PlayEVs; pBlackjack: number };
    const acc = new Map<RowKey, Acc>();

    for (let a = 1; a <= 10; a++) {
      for (let b = a; b <= 10; b++) {
        const counts = [...shoe];
        counts[a]--;
        counts[b]--;
        counts[up]--;
        const weight = a === b ? shoe[a] * (shoe[a] - 1) : 2 * shoe[a] * shoe[b];
        const { evs, pBlackjack } = handEVs(rules, counts, up, a, b);

        // In no-peek games a dealer blackjack (found later) takes every bet on
        // the table, so fold that risk into each play's EV.
        const adjusted = { ...evs };
        if (!rules.dealerPeeks && pBlackjack > 0) {
          // Chips lost to a dealer blackjack for each play. Early surrender
          // still gets half back, so it keeps its -0.5.
          const stake: PlayEVs = { stand: 1, hit: 1, double: 2, split: 2, surrender: 1 };
          for (const play of PLAYS) {
            if (play === "surrender" && rules.surrender === "early") continue;
            adjusted[play] = (1 - pBlackjack) * evs[play] - pBlackjack * stake[play];
          }
        }

        for (const row of rowsFor(a, b)) {
          // A pair row is only that pair; it's the only row with a split option.
          const entry = acc.get(row) ?? { weight: 0, evs: { stand: 0, hit: 0, double: 0, split: 0, surrender: 0 }, pBlackjack: 0 };
          entry.weight += weight;
          for (const play of PLAYS) entry.evs[play] += weight * adjusted[play];
          entry.pBlackjack += weight * pBlackjack;
          acc.set(row, entry);
        }
      }
    }

    for (const [row, entry] of acc) {
      const evs = {} as PlayEVs;
      for (const play of PLAYS) evs[play] = entry.evs[play] / entry.weight;
      if (!row.startsWith("P")) evs.split = Number.NEGATIVE_INFINITY;
      const pBlackjack = entry.pBlackjack / entry.weight;

      // Early surrender: give up half now, or play on and lose everything if
      // the dealer turns out to have blackjack.
      let earlySurrender = false;
      if (rules.surrender === "early" && rules.dealerPeeks && pBlackjack > 0) {
        const playOn = Math.max(evs.stand, evs.hit, evs.double, evs.split, evs.surrender);
        earlySurrender = -0.5 > (1 - pBlackjack) * playOn - pBlackjack;
      }

      (chart[row] ??= [])[up] = { evs, earlySurrender };
    }
  }
  return chart;
}

const chartCache = new Map<string, StrategyChart>();

/** The basic-strategy chart for these rules (computed once, then cached). */
export function strategyChart(rules: BlackjackRules): StrategyChart {
  // Only rules that change the best play are part of the key.
  const key = [
    rules.decks,
    rules.dealerHitsSoft17,
    rules.dealerPeeks,
    rules.doubleAfterSplit,
    rules.doubleOn,
    rules.hitSplitAces,
    rules.surrender,
  ].join("|");
  let chart = chartCache.get(key);
  if (!chart) {
    chart = buildChart(rules);
    chartCache.set(key, chart);
  }
  return chart;
}

// ---------- Looking up the book play ----------

export type BookInput = {
  phase: "early" | "playing";
  /** The hand being decided. */
  cards: Card[];
  dealerUpcard: Card;
  /** What the engine allows right now (from legalActions). */
  legal: ActionType[];
};

export type BookDecision = {
  action: ActionType;
  /** Stable id for grouping in stats, e.g. "H16v10", "S18v9", "P8v1", "insurance". */
  key: string;
  /** Plain-English situation, e.g. "Hard 16 vs 10". */
  situation: string;
};

const UPCARD_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const PAIR_NAMES = ["", "Aces", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "10s"];

function rowLabel(row: RowKey): string {
  const n = Number(row.slice(1));
  if (row[0] === "P") return `Pair of ${PAIR_NAMES[n]}`;
  return `${row[0] === "S" ? "Soft" : "Hard"} ${n}`;
}

function rowForHand(cards: Card[], splitAllowed: boolean): RowKey | null {
  if (cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]) && splitAllowed) {
    return `P${cardValue(cards[0])}`;
  }
  const { total: value, soft } = handValue(cards);
  if (value >= 21) return null;
  return soft ? `S${value}` : `H${value}`;
}

/**
 * The basic-strategy play for this decision, chosen from the legal actions.
 * Returns null when there's no real choice (only one legal action).
 */
export function bookDecision(rules: BlackjackRules, input: BookInput): BookDecision | null {
  const { legal, cards } = input;
  if (legal.length < 2) return null;
  const up = cardValue(input.dealerUpcard);
  const upLabel = UPCARD_LABELS[up];

  if (input.phase === "early") {
    const row = rowForHand(cards, true);
    if (legal.includes("surrender") && row) {
      const cell = strategyChart(rules)[row][up];
      return {
        action: cell.earlySurrender ? "surrender" : "decline",
        key: `${row}v${up}:early`,
        situation: `${rowLabel(row)} vs ${upLabel} (early surrender)`,
      };
    }
    // Basic strategy never takes insurance, even money included.
    const evenMoney = cards.length === 2 && handValue(cards).total === 21;
    return {
      action: "decline",
      key: evenMoney ? "even-money" : "insurance",
      situation: evenMoney ? "Even money" : "Insurance",
    };
  }

  const row = rowForHand(cards, legal.includes("split"));
  if (!row) {
    return legal.includes("stand") ? { action: "stand", key: `H21v${up}`, situation: `21 vs ${upLabel}` } : null;
  }
  const { evs } = strategyChart(rules)[row][up];
  let bestAction: ActionType = legal[0];
  let bestEv = Number.NEGATIVE_INFINITY;
  for (const play of PLAYS) {
    if (legal.includes(play) && evs[play] > bestEv) {
      bestEv = evs[play];
      bestAction = play;
    }
  }
  return { action: bestAction, key: `${row}v${up}`, situation: `${rowLabel(row)} vs ${upLabel}` };
}

/** Short label for an action, for hints and stats. */
export function actionLabel(action: ActionType): string {
  return { hit: "Hit", stand: "Stand", double: "Double", split: "Split", surrender: "Surrender", insurance: "Take insurance", decline: "Decline" }[action];
}
