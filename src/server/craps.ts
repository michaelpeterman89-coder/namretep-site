import "server-only";
import {
  cantRemove,
  crapsRollStats,
  crapsSummary,
  IllegalCrapsBet,
  newCrapsState,
  nextRollAt,
  nextShooter,
  parseCrapsRules,
  placeBet,
  removeBet,
  roll,
  setOnComeOut,
  SHOOTER_TIMEOUT_MS,
  type BetRequest,
  type BetResult,
  type CrapsConfig,
  type CrapsState,
  type CrapsStatLine,
  type Dice,
  type RollEvent,
} from "@/lib/games/craps";
import { secureRandomInt } from "@/lib/random";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  canViewTable,
  friendlyDbError,
  GameError,
  getPlayerChips,
  getSeats,
  MAX_BET_LIMIT,
  sitDown,
  type CrapsTable,
  type SeatInfo,
} from "./tables";

// Craps tables: the game lives in craps_games (one row per table). Every
// change reads the row, runs the engine, and saves the new state together
// with the chip changes; if someone else changed the table at the same
// moment, it reads again and retries.

export type LastRoll = {
  /** Roll number at this table (so browsers can tell a new roll from an old one). */
  n: number;
  dice: Dice;
  total: number;
  event: RollEvent;
  results: BetResult[];
  shooterId: string | null;
  point: number | null;
};

type Game = {
  state: CrapsState;
  version: number;
  shooterId: string | null;
  rollAt: Date | null;
  lastRoll: LastRoll | null;
};

type ChipChange = { player_id: string; amount: number; reason: "craps_bet" | "craps_win" | "craps_refund" };

type Change = {
  state: CrapsState;
  shooterId?: string | null;
  rollAt?: Date | null;
  lastRoll?: LastRoll;
  chips?: ChipChange[];
  roll?: { shooter_id: string | null; die1: number; die2: number; event: RollEvent; shooter_roll: number };
  stats?: CrapsStatLine[];
};

const config = (table: CrapsTable): CrapsConfig => ({ rules: table.rules, minBet: table.minBet, maxBet: table.maxBet });

async function loadGame(tableId: string): Promise<Game> {
  const { data, error } = await createAdminClient()
    .from("craps_games")
    .select("state, version, shooter_id, roll_at, last_roll")
    .eq("table_id", tableId)
    .single();
  if (error) throw friendlyDbError(error);
  return {
    state: data.state as unknown as CrapsState,
    version: data.version,
    shooterId: data.shooter_id,
    rollAt: data.roll_at ? new Date(data.roll_at) : null,
    lastRoll: data.last_roll as unknown as LastRoll | null,
  };
}

/**
 * Applies a change to the table, retrying if someone else changed it first.
 * `run` returns the change to save, or null for "nothing to do".
 */
async function mutate(
  table: CrapsTable,
  run: (game: Game, seats: SeatInfo[]) => Change | null,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [game, seats] = await Promise.all([loadGame(table.id), getSeats(table.id)]);
    let change: Change | null;
    try {
      change = run(game, seats);
    } catch (e) {
      if (e instanceof IllegalCrapsBet) throw new GameError(e.message);
      throw e;
    }
    if (!change) return;
    const { error } = await createAdminClient().rpc("craps_save", {
      p_table_id: table.id,
      p_version: game.version,
      p_state: change.state as unknown as Json,
      p_shooter: (change.shooterId === undefined ? game.shooterId : change.shooterId) as string,
      p_roll_at: (change.rollAt === undefined ? game.rollAt : change.rollAt)?.toISOString() as string,
      p_last_roll: (change.lastRoll ?? null) as unknown as Json,
      p_chips: (change.chips ?? []).filter((c) => c.amount !== 0) as unknown as Json,
      p_roll: (change.roll ?? null) as unknown as Json,
      p_stats: (change.stats ?? []) as unknown as Json,
    });
    if (!error) return;
    if (!error.message.includes("STALE_ROUND")) throw friendlyDbError(error);
  }
  throw new GameError("The table is busy. Please try again.");
}

const seatOf = (seats: SeatInfo[], playerId: string | null) => seats.find((s) => s.playerId === playerId) ?? null;

// ---------- Creating, sitting, and leaving ----------

export type NewCrapsTableInput = {
  name: string;
  visibility: "public" | "private";
  seats: number;
  minBet: number;
  maxBet: number;
  rules: unknown;
};

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newInviteCode = () => Array.from({ length: 8 }, () => INVITE_ALPHABET[secureRandomInt(INVITE_ALPHABET.length)]).join("");

/** Creates a craps table with its owner in seat 1 holding the dice. Returns the table id. */
export async function createCrapsTable(ownerId: string, input: NewCrapsTableInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40) throw new GameError("Table name must be 1–40 characters.");
  if (input.visibility !== "public" && input.visibility !== "private") throw new GameError("Choose public or private.");
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 8) throw new GameError("Seats must be 1–8.");
  if (!Number.isInteger(input.minBet) || input.minBet < 1) throw new GameError("Minimum bet must be at least 1.");
  if (!Number.isInteger(input.maxBet) || input.maxBet < input.minBet || input.maxBet > MAX_BET_LIMIT) {
    throw new GameError(`Maximum bet must be between the minimum and ${MAX_BET_LIMIT.toLocaleString("en-US")}.`);
  }
  const parsed = parseCrapsRules(input.rules);
  if (!parsed.ok) throw new GameError(parsed.error);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_tables")
    .insert({
      game: "craps",
      name,
      owner_id: ownerId,
      visibility: input.visibility,
      invite_code: input.visibility === "private" ? newInviteCode() : null,
      seats: input.seats,
      min_bet: input.minBet,
      max_bet: input.maxBet,
      rules: parsed.rules,
    })
    .select("id")
    .single();
  if (error || !data) throw friendlyDbError(error ?? { message: "No table returned" });

  const game = await admin.from("craps_games").insert({
    table_id: data.id,
    state: newCrapsState() as unknown as Json,
    shooter_id: ownerId,
    roll_at: new Date().toISOString(),
  });
  if (game.error) throw friendlyDbError(game.error);
  const seat = await admin.from("table_seats").insert({ table_id: data.id, seat_number: 0, player_id: ownerId });
  if (seat.error) throw friendlyDbError(seat.error);
  return data.id;
}

/** Takes a seat. If nobody has the dice, the new player gets them. */
export async function sitAtCraps(table: CrapsTable, playerId: string, seatNumber: number) {
  await sitDown(table, playerId, seatNumber);
  await mutate(table, (game, seats) => {
    if (seatOf(seats, game.shooterId)) return null;
    return { state: game.state, shooterId: playerId, rollAt: new Date() };
  });
}

/**
 * Leaves the table. Bets that can come down are returned; Pass and Come bets
 * with a point (and bonus bets in progress) stay up and still pay out. If
 * nobody else is left to roll, everything comes back.
 */
export async function leaveCraps(table: CrapsTable, playerId: string) {
  await mutate(table, (game, seats) => {
    const others = seats.filter((s) => s.playerId !== playerId);
    let state = game.state;
    let refund = 0;
    for (const bet of game.state.bets.filter((b) => b.playerId === playerId && !b.parentId)) {
      if (others.length > 0 && cantRemove(state, bet)) continue;
      const res = others.length > 0 ? removeBet(state, playerId, bet.id) : forceRemove(state, bet.id);
      state = res.state;
      refund += res.refund;
    }
    // Odds left behind a bet that stays up come down too (they're always removable).
    for (const bet of state.bets.filter((b) => b.playerId === playerId && b.parentId && others.length === 0)) {
      const res = forceRemove(state, bet.id);
      state = res.state;
      refund += res.refund;
    }
    const mySeat = seatOf(seats, playerId);
    const shooterId = game.shooterId === playerId ? nextShooter(others, mySeat?.seatNumber ?? null) : game.shooterId;
    return {
      state,
      shooterId,
      rollAt: shooterId !== game.shooterId ? new Date() : game.rollAt,
      chips: refund > 0 ? [{ player_id: playerId, amount: refund, reason: "craps_refund" }] : [],
    };
  });
  const { error } = await createAdminClient().from("table_seats").delete().eq("table_id", table.id).eq("player_id", playerId);
  if (error) throw friendlyDbError(error);
}

/** Takes a bet (and its odds) off the table regardless of the usual rules. */
function forceRemove(state: CrapsState, betId: string) {
  const gone = state.bets.filter((b) => b.id === betId || b.parentId === betId);
  return {
    state: { ...state, bets: state.bets.filter((b) => !gone.includes(b)) },
    refund: gone.reduce((s, b) => s + b.amount + b.vigPaid, 0),
  };
}

/** Gives every bet back (used when a table closes). */
export async function returnAllCrapsBets(tableId: string) {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 4; attempt++) {
    const game = await loadGame(tableId);
    const refunds = new Map<string, number>();
    for (const b of game.state.bets) refunds.set(b.playerId, (refunds.get(b.playerId) ?? 0) + b.amount + b.vigPaid);
    const { error } = await admin.rpc("craps_save", {
      p_table_id: tableId,
      p_version: game.version,
      p_state: { ...game.state, bets: [] } as unknown as Json,
      p_shooter: null as unknown as string,
      p_roll_at: null as unknown as string,
      p_last_roll: null as unknown as Json,
      p_chips: [...refunds].map(([player_id, amount]) => ({ player_id, amount, reason: "craps_refund" })) as unknown as Json,
      p_roll: null as unknown as Json,
      p_stats: [] as unknown as Json,
    });
    if (!error) return;
    if (!error.message.includes("STALE_ROUND")) throw friendlyDbError(error);
  }
  throw new GameError("The table is busy. Please try again.");
}

// ---------- Betting ----------

function requireSeat(seats: SeatInfo[], playerId: string) {
  if (!seatOf(seats, playerId)) throw new GameError("Take a seat to bet.");
}

export async function crapsBet(table: CrapsTable, playerId: string, request: BetRequest) {
  if (table.status !== "open") throw new GameError("This table is closed.");
  await mutate(table, (game, seats) => {
    requireSeat(seats, playerId);
    const { state, cost } = placeBet(game.state, config(table), playerId, request);
    return { state, chips: [{ player_id: playerId, amount: -cost, reason: "craps_bet" }] };
  });
}

export async function crapsRemoveBet(table: CrapsTable, playerId: string, betId: string) {
  await mutate(table, (game) => {
    const { state, refund } = removeBet(game.state, playerId, betId);
    return { state, chips: [{ player_id: playerId, amount: refund, reason: "craps_refund" }] };
  });
}

/** Takes down all of the player's bets that are allowed to come down. */
export async function crapsClearBets(table: CrapsTable, playerId: string) {
  await mutate(table, (game) => {
    let state = game.state;
    let refund = 0;
    for (const bet of game.state.bets.filter((b) => b.playerId === playerId)) {
      if (!state.bets.some((b) => b.id === bet.id) || cantRemove(state, bet)) continue;
      const res = removeBet(state, playerId, bet.id);
      state = res.state;
      refund += res.refund;
    }
    if (refund === 0) return null;
    return { state, chips: [{ player_id: playerId, amount: refund, reason: "craps_refund" }] };
  });
}

export async function crapsSetComeOut(table: CrapsTable, playerId: string, betId: string, on: boolean) {
  await mutate(table, (game) => ({ state: setOnComeOut(game.state, playerId, betId, on) }));
}

// ---------- Rolling ----------

export async function crapsRoll(table: CrapsTable, playerId: string) {
  if (table.status !== "open") throw new GameError("This table is closed.");
  await mutate(table, (game, seats) => {
    if (game.shooterId !== playerId) throw new GameError("It's not your turn to shoot.");
    if (game.rollAt && Date.now() < game.rollAt.getTime()) throw new GameError("Wait for the bets to settle.");

    const dice: Dice = [secureRandomInt(6) + 1, secureRandomInt(6) + 1];
    const before = game.state;
    const result = roll(before, config(table), dice);

    const credits = new Map<string, number>();
    for (const r of result.results) if (r.credit > 0) credits.set(r.playerId, (credits.get(r.playerId) ?? 0) + r.credit);

    const shooterSeat = seatOf(seats, playerId);
    const shooterId =
      result.event === "sevenOut" ? nextShooter(seats, shooterSeat?.seatNumber ?? null) : game.shooterId;

    return {
      state: result.state,
      shooterId,
      rollAt: nextRollAt(Date.now(), seats.length),
      lastRoll: {
        n: result.state.totalRolls,
        dice,
        total: result.total,
        event: result.event,
        results: result.results,
        shooterId: playerId,
        point: result.state.point,
      },
      chips: [...credits].map(([player_id, amount]) => ({ player_id, amount, reason: "craps_win" as const })),
      roll: { shooter_id: playerId, die1: dice[0], die2: dice[1], event: result.event, shooter_roll: before.shooterRolls + 1 },
      stats: crapsRollStats(result.results, playerId, result.event, crapsSummary(table.rules)),
    };
  });
}

/**
 * Keeps the dice moving: hands them on if the shooter left, and passes them
 * if the shooter has kept others waiting too long.
 */
export async function runCrapsTimeouts(table: CrapsTable) {
  if (table.status !== "open") return;
  await mutate(table, (game, seats) => {
    const shooter = seatOf(seats, game.shooterId);
    if (!shooter) {
      const next = nextShooter(seats, null);
      return next === game.shooterId ? null : { state: game.state, shooterId: next, rollAt: new Date() };
    }
    const waited = game.rollAt ? Date.now() - game.rollAt.getTime() : 0;
    if (seats.length < 2 || waited < SHOOTER_TIMEOUT_MS) return null;
    // A new shooter starts fresh: the point stays (it belongs to the table), but
    // the Fire Bet and shooter roll count reset as if the shooter sevened out.
    return {
      state: { ...game.state, shooterRolls: 0, firePoints: [] },
      shooterId: nextShooter(seats, shooter.seatNumber),
      rollAt: new Date(),
    };
  });
}

// ---------- What a player sees ----------

export type CrapsView = {
  table: CrapsTable;
  seats: SeatInfo[];
  game: {
    state: CrapsState;
    version: number;
    shooterId: string | null;
    rollAt: string | null;
    lastRoll: LastRoll | null;
  };
  me: { playerId: string; chips: number; seatNumber: number | null; isOwner: boolean };
  serverNow: string;
};

export async function getCrapsView(table: CrapsTable, playerId: string): Promise<CrapsView> {
  if (!(await canViewTable(table, playerId))) throw new GameError("Table not found.");
  const [game, seats, chips] = await Promise.all([loadGame(table.id), getSeats(table.id), getPlayerChips(playerId)]);
  return {
    table,
    seats,
    game: {
      state: game.state,
      version: game.version,
      shooterId: game.shooterId,
      rollAt: game.rollAt?.toISOString() ?? null,
      lastRoll: game.lastRoll,
    },
    me: { playerId, chips, seatNumber: seatOf(seats, playerId)?.seatNumber ?? null, isOwner: table.ownerId === playerId },
    serverNow: new Date().toISOString(),
  };
}
