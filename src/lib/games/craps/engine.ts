import {
  ALL_SMALL_TALL_PAYS,
  commission,
  FIRE_PAYS,
  HARDWAY_PAYS,
  maxLayOddsWin,
  maxOddsMultiple,
  pay,
  PLACE_PAYS,
  pointNumbers,
  PROP_PAYS,
  TRUE_ODDS,
  type CrapsRules,
  type Ratio,
} from "./rules";

// The craps engine: pure functions that take the table state and return a new
// one. Chips are whole numbers; anything that would pay a fraction rounds down.

export type Dice = readonly [number, number];

export type BetKind =
  // Line bets and their odds
  | "pass"
  | "dontPass"
  | "come"
  | "dontCome"
  | "odds" // behind Pass or a Come bet
  | "layOdds" // behind Don't Pass or a Don't Come bet
  // Numbers
  | "place"
  | "buy"
  | "lay"
  | "big6"
  | "big8"
  | "field"
  | "hard"
  // One-roll propositions
  | "any7"
  | "anyCraps"
  | "two"
  | "three"
  | "yo"
  | "twelve"
  | "horn"
  | "ce"
  | "world"
  | "hop"
  // Bonus bets
  | "fire"
  | "allSmall"
  | "allTall"
  | "makeEmAll";

export type Bet = {
  id: string;
  playerId: string;
  kind: BetKind;
  amount: number;
  /**
   * The number the bet is on: the point for Pass/Don't Pass (once set), where a
   * Come/Don't Come bet travelled to, or the number for place/buy/lay/hard/odds.
   */
  number: number | null;
  /** Hop bets: the two dice, smallest first. */
  dice?: Dice;
  /** Odds bets: the line bet they sit behind. */
  parentId?: string;
  /** Place, buy, hardway and come-odds bets are off on the come-out roll unless this is on. */
  onComeOut: boolean;
  /** Buy/lay commission already paid up front (returned if the bet is taken down). */
  vigPaid: number;
  /** The roll count when the bet was made; bets nobody has rolled on yet can always come down. */
  placedAt: number;
};

export type CrapsState = {
  point: number | null;
  bets: Bet[];
  /** Rolls by the current shooter (0 = the shooter hasn't rolled yet). */
  shooterRolls: number;
  /** Rolls at this table, ever; used to tell which bets have been rolled on. */
  totalRolls: number;
  /** Different points (4–10) the current shooter has made, for the Fire Bet. */
  firePoints: number[];
  /** Totals rolled since the last 7, for All Small / All Tall / Make 'Em All. */
  smallTallHits: number[];
  nextBetId: number;
};

export type CrapsConfig = { rules: CrapsRules; minBet: number; maxBet: number };

export class IllegalCrapsBet extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalCrapsBet";
  }
}

export function newCrapsState(): CrapsState {
  return { point: null, bets: [], shooterRolls: 0, totalRolls: 0, firePoints: [], smallTallHits: [], nextBetId: 1 };
}

// ---------- What each bet is ----------

const LINE: BetKind[] = ["pass", "dontPass", "come", "dontCome"];
const ONE_ROLL: BetKind[] = ["field", "any7", "anyCraps", "two", "three", "yo", "twelve", "horn", "ce", "world", "hop"];
const PROPS: BetKind[] = ["hard", "any7", "anyCraps", "two", "three", "yo", "twelve", "horn", "ce", "world"];
const SMALL_TALL: BetKind[] = ["allSmall", "allTall", "makeEmAll"];
/** Bets that must meet the table minimum (the rest only need 1 chip). */
const TABLE_MIN: BetKind[] = [...LINE, "place", "buy", "lay", "big6", "big8", "field"];
/** Bets that can be switched on for the come-out roll. */
export const COME_OUT_TOGGLE: BetKind[] = ["place", "buy", "hard", "odds"];

const SMALL = [2, 3, 4, 5, 6];
const TALL = [8, 9, 10, 11, 12];
/** Points that count for the Fire Bet. */
const FIRE_NUMBERS = [4, 5, 6, 8, 9, 10];
/** How many equal parts a split prop bet is made of. */
const SPLITS: Partial<Record<BetKind, number>> = { horn: 4, ce: 2, world: 5 };

export type BetRequest = {
  kind: BetKind;
  amount: number;
  number?: number | null;
  dice?: Dice;
  /** Odds bets: the line bet to put them behind. */
  parentId?: string;
};

const sameBet = (a: Bet, playerId: string, r: BetRequest) =>
  a.playerId === playerId &&
  a.kind === r.kind &&
  a.parentId === r.parentId &&
  (a.kind === "odds" || a.kind === "layOdds" || a.number === (r.number ?? null)) &&
  (a.kind !== "hop" || (a.dice?.[0] === r.dice?.[0] && a.dice?.[1] === r.dice?.[1])) &&
  // A Come bet that has moved to a number is its own bet.
  !((a.kind === "come" || a.kind === "dontCome") && a.number !== null);

/** Why a bet can't be made right now, or null if it can. */
function checkBet(state: CrapsState, config: CrapsConfig, playerId: string, r: BetRequest, total: number): string | null {
  const { rules } = config;
  const crapless = rules.variant === "crapless";
  const points = pointNumbers(rules.variant);
  if (!Number.isInteger(r.amount) || r.amount < 1) return "Bets must be at least 1 chip.";
  if (TABLE_MIN.includes(r.kind) && total < config.minBet) return `The table minimum is ${config.minBet}.`;
  if (r.kind !== "odds" && r.kind !== "layOdds" && total > config.maxBet) return `The table maximum is ${config.maxBet}.`;
  if ((r.kind === "dontPass" || r.kind === "dontCome") && crapless) return "Crapless craps has no Don't bets.";
  if (PROPS.includes(r.kind) && !rules.props) return "This table doesn't offer proposition bets.";
  const split = SPLITS[r.kind];
  if (split && total % split !== 0) return `This bet is split ${split} ways, so it must be a multiple of ${split}.`;

  switch (r.kind) {
    case "pass":
    case "dontPass":
      return state.point === null ? null : "Line bets are made on the come-out roll. Use Come or Don't Come now.";
    case "come":
    case "dontCome":
      return state.point === null ? "Come bets are made after a point is set. Use the Pass Line now." : null;
    case "place":
    case "buy":
    case "lay":
      return points.includes(r.number ?? -1) ? null : "Pick a number to bet on.";
    case "hard":
      return [4, 6, 8, 10].includes(r.number ?? -1) ? null : "Hardways are 4, 6, 8, or 10.";
    case "hop": {
      if (!rules.hops) return "This table doesn't offer hop bets.";
      const d = r.dice;
      return d && d.every((x) => Number.isInteger(x) && x >= 1 && x <= 6) && d[0] <= d[1] ? null : "Pick the two dice to hop.";
    }
    case "fire":
      if (!rules.fireBet) return "This table doesn't offer the Fire Bet.";
      return state.shooterRolls === 0 ? null : "The Fire Bet can only be made before a new shooter's first roll.";
    case "allSmall":
    case "allTall":
    case "makeEmAll":
      if (!rules.allSmallTall) return "This table doesn't offer All Small / All Tall.";
      return state.smallTallHits.length === 0 ? null : "These bets open again after the next 7.";
    case "odds":
    case "layOdds": {
      const parent = state.bets.find((b) => b.id === r.parentId);
      const wanted = r.kind === "odds" ? ["pass", "come"] : ["dontPass", "dontCome"];
      if (!parent || parent.playerId !== playerId || !wanted.includes(parent.kind) || parent.number === null) {
        return r.kind === "odds"
          ? "Odds go behind a Pass or Come bet that has a point."
          : "Lay odds go behind a Don't Pass or Don't Come bet that has a point.";
      }
      if (r.kind === "odds") {
        const limit = maxOddsMultiple(rules, parent.number) * parent.amount;
        return total <= limit ? null : `You can take up to ${limit} in odds here.`;
      }
      const limit = maxLayOddsWin(rules, parent.number, parent.amount);
      const [win, per] = TRUE_ODDS[parent.number];
      return pay(total, [per, win]) <= limit ? null : `Lay odds can win at most ${limit} here.`;
    }
    default:
      return null;
  }
}

/** Upfront commission for a buy or lay bet of `amount` (0 when charged on wins). */
function upfrontVig(rules: CrapsRules, kind: BetKind, number: number | null, amount: number): number {
  if (rules.vig !== "upfront" || number === null) return 0;
  if (kind === "buy") return commission(amount);
  if (kind === "lay") {
    const [win, per] = TRUE_ODDS[number];
    return commission(pay(amount, [per, win]));
  }
  return 0;
}

export type PlaceResult = { state: CrapsState; bet: Bet; cost: number };

/**
 * Puts chips on a bet (adding to it if the player already has the same bet).
 * `cost` is what comes off the player's balance, including any upfront
 * commission. Throws IllegalCrapsBet if the bet isn't allowed right now.
 */
export function placeBet(state: CrapsState, config: CrapsConfig, playerId: string, r: BetRequest): PlaceResult {
  const existing = state.bets.find((b) => sameBet(b, playerId, r));
  const total = (existing?.amount ?? 0) + r.amount;
  const problem = checkBet(state, config, playerId, r, total);
  if (problem) throw new IllegalCrapsBet(problem);

  const parent = r.parentId ? state.bets.find((b) => b.id === r.parentId) : undefined;
  const number =
    r.kind === "odds" || r.kind === "layOdds"
      ? parent!.number
      : ["place", "buy", "lay", "hard"].includes(r.kind)
        ? (r.number ?? null)
        : null;
  const vig = upfrontVig(config.rules, r.kind, number, total) - (existing?.vigPaid ?? 0);

  if (existing) {
    const bet = { ...existing, amount: total, vigPaid: existing.vigPaid + vig };
    return { state: { ...state, bets: state.bets.map((b) => (b.id === bet.id ? bet : b)) }, bet, cost: r.amount + vig };
  }
  const bet: Bet = {
    id: `b${state.nextBetId}`,
    playerId,
    kind: r.kind,
    amount: r.amount,
    number,
    ...(r.kind === "hop" ? { dice: r.dice } : {}),
    ...(r.parentId ? { parentId: r.parentId } : {}),
    // Odds on the Pass Line are always on (they only exist once there's a point).
    onComeOut: r.kind === "odds" && parent?.kind === "pass",
    vigPaid: vig,
    placedAt: state.totalRolls,
  };
  return { state: { ...state, bets: [...state.bets, bet], nextBetId: state.nextBetId + 1 }, bet, cost: r.amount + vig };
}

/** Why a bet can't be taken down, or null if it can. */
export function cantRemove(state: CrapsState, bet: Bet): string | null {
  if (bet.placedAt === state.totalRolls) return null; // nobody has rolled on it yet
  if ((bet.kind === "pass" || bet.kind === "come") && bet.number !== null) {
    return "Pass and Come bets stay up once they have a point.";
  }
  if (bet.kind === "come" || bet.kind === "dontCome") return null;
  if (bet.kind === "fire" || SMALL_TALL.includes(bet.kind)) return "Bonus bets stay up once the dice are rolling.";
  return null;
}

/**
 * Takes a bet down (with any odds behind it). Returns the chips going back to
 * the player, including upfront commission.
 */
export function removeBet(state: CrapsState, playerId: string, betId: string): { state: CrapsState; refund: number } {
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet || bet.playerId !== playerId) throw new IllegalCrapsBet("That bet isn't yours.");
  const problem = cantRemove(state, bet);
  if (problem) throw new IllegalCrapsBet(problem);
  const gone = state.bets.filter((b) => b.id === betId || b.parentId === betId);
  const refund = gone.reduce((s, b) => s + b.amount + b.vigPaid, 0);
  return { state: { ...state, bets: state.bets.filter((b) => !gone.includes(b)) }, refund };
}

/** Turns a place/buy/hardway/come-odds bet on or off for the come-out roll. */
export function setOnComeOut(state: CrapsState, playerId: string, betId: string, on: boolean): CrapsState {
  const bet = state.bets.find((b) => b.id === betId);
  if (!bet || bet.playerId !== playerId) throw new IllegalCrapsBet("That bet isn't yours.");
  const comeOdds = bet.kind === "odds" && state.bets.find((b) => b.id === bet.parentId)?.kind === "come";
  if (!(COME_OUT_TOGGLE.includes(bet.kind) && (bet.kind !== "odds" || comeOdds))) {
    throw new IllegalCrapsBet("Only place, buy, hardway, and come odds bets can be turned off.");
  }
  return { ...state, bets: state.bets.map((b) => (b.id === betId ? { ...b, onComeOut: on } : b)) };
}

// ---------- Rolling ----------

export type BetOutcome = "win" | "lose" | "push" | "moved";

export type BetResult = {
  betId: string;
  playerId: string;
  kind: BetKind;
  number: number | null;
  amount: number;
  outcome: BetOutcome;
  /** Chips won (after commission). */
  winnings: number;
  /** Chips going back to the player: winnings plus the stake if the bet comes down. */
  credit: number;
  /** A winning bet that stays up for the next roll (only its winnings are paid). */
  stays: boolean;
  /** The number a Come/Don't Come bet moved to. */
  movedTo?: number;
};

export type RollEvent =
  | "natural" // come-out 7 (or 11 in standard craps): Pass wins
  | "craps" // come-out 2, 3, or 12 in standard craps: Pass loses
  | "pointSet"
  | "pointMade"
  | "sevenOut"
  | "roll"; // anything else

export type RollResult = { state: CrapsState; results: BetResult[]; event: RollEvent; total: number };

const lose = (b: Bet): BetResult => ({
  betId: b.id,
  playerId: b.playerId,
  kind: b.kind,
  number: b.number,
  amount: b.amount,
  outcome: "lose",
  winnings: 0,
  credit: 0,
  stays: false,
});
const win = (b: Bet, winnings: number, stays: boolean): BetResult => ({
  betId: b.id,
  playerId: b.playerId,
  kind: b.kind,
  number: b.number,
  amount: b.amount,
  outcome: "win",
  winnings,
  credit: winnings + (stays ? 0 : b.amount),
  stays,
});
const push = (b: Bet): BetResult => ({
  betId: b.id,
  playerId: b.playerId,
  kind: b.kind,
  number: b.number,
  amount: b.amount,
  outcome: "push",
  winnings: 0,
  credit: b.amount + b.vigPaid,
  stays: false,
});

/** Pays `amount` at `ratio` on a split bet: the winning part pays, the other parts lose. */
const splitWin = (amount: number, parts: number, ratio: Ratio) => {
  const part = amount / parts;
  return pay(part, ratio) - part * (parts - 1);
};

/** Resolves one roll of the dice for every bet on the table. */
export function roll(state: CrapsState, config: CrapsConfig, dice: Dice): RollResult {
  const { rules } = config;
  const crapless = rules.variant === "crapless";
  const [d1, d2] = dice;
  if (![d1, d2].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) throw new RangeError("Dice must be 1–6.");
  const total = d1 + d2;
  const hard = d1 === d2;
  const point = state.point;
  const comeOut = point === null;

  // What happens to the point.
  let event: RollEvent = "roll";
  let nextPoint = point;
  if (comeOut) {
    if (total === 7 || (!crapless && total === 11)) event = "natural";
    else if (!crapless && [2, 3, 12].includes(total)) event = "craps";
    else {
      event = "pointSet";
      nextPoint = total;
    }
  } else if (total === point) {
    event = "pointMade";
    nextPoint = null;
  } else if (total === 7) {
    event = "sevenOut";
    nextPoint = null;
  }

  // Fire Bet and All Small/Tall progress, before bets are settled.
  let firePoints = state.firePoints;
  if (event === "pointMade" && FIRE_NUMBERS.includes(total) && !firePoints.includes(total)) firePoints = [...firePoints, total];
  const smallTallHits =
    total === 7 ? [] : state.smallTallHits.includes(total) ? state.smallTallHits : [...state.smallTallHits, total];

  const results: BetResult[] = [];
  const kept: Bet[] = [];
  // Line bets and odds settle first, so odds know what happened to their line bet.
  const settledParents = new Map<string, BetOutcome>();

  const settle = (b: Bet): BetResult | null => {
    const working = !comeOut || b.onComeOut;
    switch (b.kind) {
      case "pass":
        if (comeOut) {
          if (event === "natural") return win(b, b.amount, true);
          if (event === "craps") return lose(b);
          return null;
        }
        if (event === "pointMade") return win(b, b.amount, true);
        if (event === "sevenOut") return lose(b);
        return null;

      case "dontPass":
        if (comeOut) {
          if (total === 2 || total === 3) return win(b, b.amount, true);
          if (total === 12) return { ...push(b), credit: 0, stays: true }; // bar 12: nothing happens
          if (total === 7 || total === 11) return lose(b);
          return null;
        }
        if (event === "sevenOut") return win(b, b.amount, true);
        if (event === "pointMade") return lose(b);
        return null;

      case "come":
        if (b.number === null) {
          if (total === 7 || (!crapless && total === 11)) return win(b, b.amount, false);
          if (!crapless && [2, 3, 12].includes(total)) return lose(b);
          return { ...push(b), outcome: "moved", credit: 0, stays: true, movedTo: total };
        }
        if (total === b.number) return win(b, b.amount, false);
        if (total === 7) return lose(b);
        return null;

      case "dontCome":
        if (b.number === null) {
          if (total === 2 || total === 3) return win(b, b.amount, false);
          if (total === 12) return null;
          if (total === 7 || total === 11) return lose(b);
          return { ...push(b), outcome: "moved", credit: 0, stays: true, movedTo: total };
        }
        if (total === 7) return win(b, b.amount, false);
        if (total === b.number) return lose(b);
        return null;

      case "odds": {
        const n = b.number!;
        if (total !== n && total !== 7) return null;
        if (!working) return push(b);
        return total === n ? win(b, pay(b.amount, TRUE_ODDS[n]), false) : lose(b);
      }

      case "layOdds": {
        const n = b.number!;
        const [w, per] = TRUE_ODDS[n];
        if (total === 7) return win(b, pay(b.amount, [per, w]), false);
        if (total === n) return lose(b);
        return null;
      }

      case "place":
        if (!working) return null;
        if (total === b.number) return win(b, pay(b.amount, PLACE_PAYS[b.number]), true);
        if (total === 7) return lose(b);
        return null;

      case "buy": {
        if (!working) return null;
        if (total === b.number) {
          const winnings = pay(b.amount, TRUE_ODDS[b.number]);
          const vig = rules.vig === "win" ? commission(b.amount) : 0;
          return win(b, winnings - vig, true);
        }
        if (total === 7) return lose(b);
        return null;
      }

      case "lay": {
        const n = b.number!;
        if (total === 7) {
          const [w, per] = TRUE_ODDS[n];
          const winnings = pay(b.amount, [per, w]);
          const vig = rules.vig === "win" ? commission(winnings) : 0;
          return win(b, winnings - vig, true);
        }
        if (total === n) return lose(b);
        return null;
      }

      case "big6":
      case "big8": {
        const n = b.kind === "big6" ? 6 : 8;
        if (total === n) return win(b, b.amount, true);
        if (total === 7) return lose(b);
        return null;
      }

      case "field":
        if ([3, 4, 9, 10, 11].includes(total)) return win(b, b.amount, true);
        if (total === 2) return win(b, b.amount * 2, true);
        if (total === 12) return win(b, b.amount * rules.field12, true);
        return lose(b);

      case "hard":
        if (!working) return null;
        if (total === b.number && hard) return win(b, pay(b.amount, HARDWAY_PAYS[b.number]), true);
        if (total === b.number || total === 7) return lose(b);
        return null;

      case "any7":
        return total === 7 ? win(b, pay(b.amount, PROP_PAYS.any7), true) : lose(b);
      case "anyCraps":
        return [2, 3, 12].includes(total) ? win(b, pay(b.amount, PROP_PAYS.anyCraps), true) : lose(b);
      case "two":
        return total === 2 ? win(b, pay(b.amount, PROP_PAYS.two), true) : lose(b);
      case "three":
        return total === 3 ? win(b, pay(b.amount, PROP_PAYS.three), true) : lose(b);
      case "yo":
        return total === 11 ? win(b, pay(b.amount, PROP_PAYS.yo), true) : lose(b);
      case "twelve":
        return total === 12 ? win(b, pay(b.amount, PROP_PAYS.twelve), true) : lose(b);
      case "horn":
        if (total === 2 || total === 12) return win(b, splitWin(b.amount, 4, PROP_PAYS.two), true);
        if (total === 3 || total === 11) return win(b, splitWin(b.amount, 4, PROP_PAYS.three), true);
        return lose(b);
      case "ce":
        if ([2, 3, 12].includes(total)) return win(b, splitWin(b.amount, 2, PROP_PAYS.anyCraps), true);
        if (total === 11) return win(b, splitWin(b.amount, 2, PROP_PAYS.yo), true);
        return lose(b);
      case "world":
        if (total === 7) return { ...push(b), credit: 0, stays: true }; // the any-7 part pays for the rest
        if (total === 2 || total === 12) return win(b, splitWin(b.amount, 5, PROP_PAYS.two), true);
        if (total === 3 || total === 11) return win(b, splitWin(b.amount, 5, PROP_PAYS.three), true);
        return lose(b);
      case "hop": {
        const [lo, hi] = d1 <= d2 ? [d1, d2] : [d2, d1];
        if (b.dice![0] !== lo || b.dice![1] !== hi) return lose(b);
        return win(b, pay(b.amount, lo === hi ? PROP_PAYS.hopHard : PROP_PAYS.hopEasy), true);
      }

      case "fire":
        if (firePoints.length === 6) return win(b, pay(b.amount, FIRE_PAYS[6]), false);
        if (event !== "sevenOut") return null;
        return firePoints.length >= 4 ? win(b, pay(b.amount, FIRE_PAYS[firePoints.length]), false) : lose(b);

      case "allSmall":
      case "allTall":
      case "makeEmAll": {
        if (total === 7) return lose(b);
        const need = b.kind === "allSmall" ? SMALL : b.kind === "allTall" ? TALL : [...SMALL, ...TALL];
        if (!need.every((n) => smallTallHits.includes(n))) return null;
        return win(b, pay(b.amount, ALL_SMALL_TALL_PAYS[b.kind]), false);
      }
    }
  };

  const ordered = [...state.bets.filter((b) => !b.parentId), ...state.bets.filter((b) => b.parentId)];
  for (const bet of ordered) {
    // Odds come down with their line bet if it was settled this roll.
    const parentOutcome = bet.parentId ? settledParents.get(bet.parentId) : undefined;
    let result = settle(bet);
    if (!result && parentOutcome && parentOutcome !== "moved") result = push(bet);
    if (result) {
      results.push(result);
      if (!bet.parentId && (!result.stays || result.outcome === "lose")) settledParents.set(bet.id, result.outcome);
    }
    if (result && !result.stays) continue;
    if (result?.outcome === "moved") {
      kept.push({ ...bet, number: result.movedTo! });
      continue;
    }
    kept.push(bet);
  }

  // Pass and Don't Pass carry the point while it's on.
  const bets = kept.map((b) =>
    b.kind === "pass" || b.kind === "dontPass" ? { ...b, number: nextPoint } : b,
  );

  const sevenOut = event === "sevenOut";
  return {
    state: {
      ...state,
      point: nextPoint,
      bets,
      shooterRolls: sevenOut ? 0 : state.shooterRolls + 1,
      totalRolls: state.totalRolls + 1,
      firePoints: sevenOut ? [] : firePoints,
      smallTallHits,
    },
    results,
    event,
    total,
  };
}

/** Everything the player has on the table. */
export const chipsOnTable = (state: CrapsState, playerId: string) =>
  state.bets.filter((b) => b.playerId === playerId).reduce((s, b) => s + b.amount, 0);

/** One-roll bets come down after every roll unless they win (and stay up). */
export const isOneRoll = (kind: BetKind) => ONE_ROLL.includes(kind);
export const isLineBet = (kind: BetKind) => LINE.includes(kind);
