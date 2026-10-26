import "server-only";
import {
  addBet,
  allReady,
  baccaratHandStats,
  baccaratSummary,
  BETTING_MS,
  dealAndSettle,
  HAND_PAUSE_MS,
  IllegalBaccaratBet,
  lastBetsOf,
  newBaccaratState,
  newShoe,
  parseBaccaratRules,
  removeBets,
  type BaccaratBetKind,
  type BaccaratState,
  type BaccaratStatLine,
} from "@/lib/games/baccarat";
import type { Card } from "@/lib/games/deck";
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
  type BaccaratTable,
  type SeatInfo,
} from "./tables";

// Baccarat tables: the game lives in baccarat_games (one row per table) and
// the shoe in baccarat_shoes (server only). Every change reads the row, runs
// the engine, and saves the new state together with the chip changes; if
// someone else changed the table at the same moment, it reads again.

type Game = { state: BaccaratState; version: number; dealAt: Date | null };
type ChipChange = { player_id: string; amount: number; reason: "baccarat_bet" | "baccarat_win" | "baccarat_refund" };
type Change = {
  state: BaccaratState;
  dealAt?: Date | null;
  shoe?: Card[];
  chips?: ChipChange[];
  hand?: { player_cards: Card[]; banker_cards: Card[]; winner: string };
  stats?: BaccaratStatLine[];
};

async function loadGame(tableId: string): Promise<Game> {
  const { data, error } = await createAdminClient()
    .from("baccarat_games")
    .select("state, version, deal_at")
    .eq("table_id", tableId)
    .single();
  if (error) throw friendlyDbError(error);
  return {
    state: data.state as unknown as BaccaratState,
    version: data.version,
    dealAt: data.deal_at ? new Date(data.deal_at) : null,
  };
}

async function loadShoe(tableId: string): Promise<Card[]> {
  const { data, error } = await createAdminClient().from("baccarat_shoes").select("cards").eq("table_id", tableId).maybeSingle();
  if (error) throw friendlyDbError(error);
  return (data?.cards as unknown as Card[] | undefined) ?? [];
}

async function save(tableId: string, game: Game, change: Change) {
  return createAdminClient().rpc("baccarat_save", {
    p_table_id: tableId,
    p_version: game.version,
    p_state: change.state as unknown as Json,
    // Explicit null (not undefined) so "no countdown" still reaches the database.
    p_deal_at: ((change.dealAt === undefined ? game.dealAt : change.dealAt)?.toISOString() ?? null) as string,
    p_shoe: (change.shoe ?? null) as unknown as Json,
    p_chips: (change.chips ?? []).filter((c) => c.amount !== 0) as unknown as Json,
    p_hand: (change.hand ?? null) as unknown as Json,
    p_stats: (change.stats ?? []) as unknown as Json,
  });
}

/**
 * Applies a change to the table, retrying if someone else changed it first.
 * `run` returns the change to save, or null for "nothing to do".
 */
async function mutate(
  table: BaccaratTable,
  run: (game: Game, seats: SeatInfo[], shoe: () => Promise<Card[]>) => Promise<Change | null> | Change | null,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [game, seats] = await Promise.all([loadGame(table.id), getSeats(table.id)]);
    let change: Change | null;
    try {
      change = await run(game, seats, () => loadShoe(table.id));
    } catch (e) {
      if (e instanceof IllegalBaccaratBet) throw new GameError(e.message);
      throw e;
    }
    if (!change) return;
    const { error } = await save(table.id, game, change);
    if (!error) return;
    if (!error.message.includes("STALE_ROUND")) throw friendlyDbError(error);
  }
  throw new GameError("The table is busy. Please try again.");
}

const seatOf = (seats: SeatInfo[], playerId: string) => seats.find((s) => s.playerId === playerId) ?? null;
const limits = (table: BaccaratTable) => ({ minBet: table.minBet, maxBet: table.maxBet });
const freshShoe = (table: BaccaratTable) => () => newShoe(table.rules.decks, secureRandomInt);

// ---------- Creating, sitting, and leaving ----------

export type NewBaccaratTableInput = {
  name: string;
  visibility: "public" | "private";
  seats: number;
  minBet: number;
  maxBet: number;
  rules: unknown;
};

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newInviteCode = () => Array.from({ length: 8 }, () => INVITE_ALPHABET[secureRandomInt(INVITE_ALPHABET.length)]).join("");

/** Creates a baccarat table with a freshly shuffled shoe and its owner in seat 1. Returns the table id. */
export async function createBaccaratTable(ownerId: string, input: NewBaccaratTableInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40) throw new GameError("Table name must be 1–40 characters.");
  if (input.visibility !== "public" && input.visibility !== "private") throw new GameError("Choose public or private.");
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 7) throw new GameError("Seats must be 1–7.");
  if (!Number.isInteger(input.minBet) || input.minBet < 1) throw new GameError("Minimum bet must be at least 1.");
  if (!Number.isInteger(input.maxBet) || input.maxBet < input.minBet || input.maxBet > MAX_BET_LIMIT) {
    throw new GameError(`Maximum bet must be between the minimum and ${MAX_BET_LIMIT.toLocaleString("en-US")}.`);
  }
  const parsed = parseBaccaratRules(input.rules);
  if (!parsed.ok) throw new GameError(parsed.error);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_tables")
    .insert({
      game: "baccarat",
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

  const shoe = newShoe(parsed.rules.decks, secureRandomInt);
  const [game, cards, seat] = await Promise.all([
    admin.from("baccarat_games").insert({ table_id: data.id, state: newBaccaratState(shoe.length) as unknown as Json }),
    admin.from("baccarat_shoes").insert({ table_id: data.id, cards: shoe as unknown as Json }),
    admin.from("table_seats").insert({ table_id: data.id, seat_number: 0, player_id: ownerId }),
  ]);
  for (const r of [game, cards, seat]) if (r.error) throw friendlyDbError(r.error);
  return data.id;
}

export async function sitAtBaccarat(table: BaccaratTable, playerId: string, seatNumber: number) {
  await sitDown(table, playerId, seatNumber);
}

/** Leaves the table; bets not yet dealt come back. */
export async function leaveBaccarat(table: BaccaratTable, playerId: string) {
  await mutate(table, (game) => {
    const { state, refund } = removeBets(game.state, playerId);
    if (refund === 0 && state.ready.length === game.state.ready.length) return null;
    return {
      state,
      dealAt: state.bets.length === 0 ? null : game.dealAt,
      chips: [{ player_id: playerId, amount: refund, reason: "baccarat_refund" }],
    };
  });
  const { error } = await createAdminClient().from("table_seats").delete().eq("table_id", table.id).eq("player_id", playerId);
  if (error) throw friendlyDbError(error);
  await dealIfReady(table);
}

/** Gives every bet back (used when a table closes). */
export async function returnAllBaccaratBets(tableId: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const game = await loadGame(tableId);
    if (game.state.bets.length === 0) return;
    const refunds = new Map<string, number>();
    for (const b of game.state.bets) refunds.set(b.playerId, (refunds.get(b.playerId) ?? 0) + b.amount);
    const { error } = await save(tableId, game, {
      state: { ...game.state, bets: [], ready: [] },
      dealAt: null,
      chips: [...refunds].map(([player_id, amount]) => ({ player_id, amount, reason: "baccarat_refund" })),
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

/** With others at the table, the first bet starts the countdown to the deal. */
function countdown(game: Game, seats: SeatInfo[]): Date | null {
  if (seats.length < 2) return null;
  return game.dealAt ?? new Date(Date.now() + BETTING_MS);
}

export async function baccaratBet(table: BaccaratTable, playerId: string, kind: BaccaratBetKind, amount: number) {
  if (table.status !== "open") throw new GameError("This table is closed.");
  await mutate(table, (game, seats) => {
    requireSeat(seats, playerId);
    const state = addBet(game.state, table.rules, limits(table), playerId, kind, amount);
    return { state, dealAt: countdown(game, seats), chips: [{ player_id: playerId, amount: -amount, reason: "baccarat_bet" }] };
  });
}

/** Puts the player's bets from the last hand back on the felt. */
export async function baccaratRebet(table: BaccaratTable, playerId: string) {
  if (table.status !== "open") throw new GameError("This table is closed.");
  await mutate(table, (game, seats) => {
    requireSeat(seats, playerId);
    const again = lastBetsOf(game.state, playerId);
    if (again.length === 0) throw new GameError("You had no bets last hand.");
    let state = game.state;
    let cost = 0;
    for (const b of again) {
      state = addBet(state, table.rules, limits(table), playerId, b.kind, b.amount);
      cost += b.amount;
    }
    return { state, dealAt: countdown(game, seats), chips: [{ player_id: playerId, amount: -cost, reason: "baccarat_bet" }] };
  });
}

export async function baccaratClear(table: BaccaratTable, playerId: string) {
  await mutate(table, (game) => {
    const { state, refund } = removeBets(game.state, playerId);
    if (refund === 0) return null;
    return {
      state,
      dealAt: state.bets.length === 0 ? null : game.dealAt,
      chips: [{ player_id: playerId, amount: refund, reason: "baccarat_refund" }],
    };
  });
}

// ---------- Dealing ----------

/** Can't deal until the last hand's cards and payouts have shown. */
const pauseOver = (state: BaccaratState) => !state.dealtAt || Date.now() - new Date(state.dealtAt).getTime() >= HAND_PAUSE_MS;

async function deal(table: BaccaratTable, game: Game, shoe: () => Promise<Card[]>): Promise<Change> {
  const out = dealAndSettle(game.state, table.rules, await shoe(), freshShoe(table), new Date());
  return {
    state: out.state,
    dealAt: null,
    shoe: out.shoe,
    chips: [...out.credits].map(([player_id, amount]) => ({ player_id, amount, reason: "baccarat_win" as const })),
    hand: { player_cards: out.hand.player, banker_cards: out.hand.banker, winner: out.hand.winner },
    stats: baccaratHandStats(out.results, out.hand, baccaratSummary(table.rules)),
  };
}

/**
 * The player presses Deal. Alone, the cards come out now; with others, the
 * hand deals once everyone with a bet is ready (or the countdown ends).
 */
export async function baccaratDeal(table: BaccaratTable, playerId: string) {
  if (table.status !== "open") throw new GameError("This table is closed.");
  await mutate(table, async (game, seats, shoe) => {
    requireSeat(seats, playerId);
    if (!game.state.bets.some((b) => b.playerId === playerId)) throw new GameError("Place a bet first.");
    if (!pauseOver(game.state)) throw new GameError("Wait for the last hand to finish.");
    const state = { ...game.state, ready: [...new Set([...game.state.ready, playerId])] };
    if (seats.length > 1 && !allReady(state)) return { state };
    return deal(table, { ...game, state }, shoe);
  });
}

/** Deals when everyone is ready or the countdown has run out (called on a timer and after leaving). */
export async function dealIfReady(table: BaccaratTable) {
  if (table.status !== "open") return;
  await mutate(table, async (game, _seats, shoe) => {
    if (game.state.bets.length === 0 || !pauseOver(game.state)) return null;
    const timeUp = game.dealAt !== null && Date.now() >= game.dealAt.getTime();
    if (!timeUp && !allReady(game.state)) return null;
    return deal(table, game, shoe);
  });
}

// ---------- What a player sees ----------

export type BaccaratView = {
  table: BaccaratTable;
  seats: SeatInfo[];
  game: { state: BaccaratState; version: number; dealAt: string | null };
  me: { playerId: string; chips: number; seatNumber: number | null; isOwner: boolean };
  serverNow: string;
};

export async function getBaccaratView(table: BaccaratTable, playerId: string): Promise<BaccaratView> {
  if (!(await canViewTable(table, playerId))) throw new GameError("Table not found.");
  const [game, seats, chips] = await Promise.all([loadGame(table.id), getSeats(table.id), getPlayerChips(playerId)]);
  return {
    table,
    seats,
    game: { state: game.state, version: game.version, dealAt: game.dealAt?.toISOString() ?? null },
    me: { playerId, chips, seatNumber: seatOf(seats, playerId)?.seatNumber ?? null, isOwner: table.ownerId === playerId },
    serverNow: new Date().toISOString(),
  };
}
