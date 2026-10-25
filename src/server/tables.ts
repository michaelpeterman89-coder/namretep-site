import "server-only";
import { parseRules, type BlackjackRules, type SeatState } from "@/lib/games/blackjack";
import { parsePokerRules, type PokerTableRules } from "@/lib/games/poker/table-rules";
import type { AvatarId } from "@/lib/avatars";
import { secureRandomInt } from "@/lib/random";
import { createAdminClient } from "@/lib/supabase/admin";

// Tables, seats, and who may see them. All writes use the secret-key client,
// after checking what the player is allowed to do.

/** An error whose message is safe and helpful to show the player. */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

type TableBase = {
  id: string;
  name: string;
  ownerId: string;
  visibility: "public" | "private";
  inviteCode: string | null;
  seats: number;
  /** Blackjack: bet limits. Poker: big blind and maximum buy-in. */
  minBet: number;
  maxBet: number;
  status: "open" | "closed";
  bettingDeadline: Date | null;
};

export type BlackjackTable = TableBase & { game: "blackjack"; rules: BlackjackRules };
export type PokerTable = TableBase & { game: "holdem"; rules: PokerTableRules };
/** Each game keeps its own rules; check `game` before using them. */
export type GameTable = BlackjackTable | PokerTable;
export type GameId = GameTable["game"];

/** Bots don't have accounts; they're identified as "bot:<name>". */
export const botId = (name: string) => `bot:${name}`;
export const isBotId = (id: string) => id.startsWith("bot:");

export type SeatInfo = SeatState & {
  username: string;
  avatar: AvatarId;
  isBot: boolean;
  /** Poker: chips in front of the seat (between hands). Null for blackjack. */
  stack: number | null;
  /** Poker: will cash out when the current hand ends. */
  leaving: boolean;
};

type TableRow = {
  id: string;
  game: GameId;
  name: string;
  owner_id: string;
  visibility: "public" | "private";
  invite_code: string | null;
  seats: number;
  min_bet: number;
  max_bet: number;
  rules: unknown;
  status: "open" | "closed";
  betting_deadline_at: string | null;
};

const TABLE_COLUMNS =
  "id, game, name, owner_id, visibility, invite_code, seats, min_bet, max_bet, rules, status, betting_deadline_at";
export const MAX_BET_LIMIT = 1_000_000;

function toTable(row: TableRow): GameTable {
  const base: TableBase = {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    visibility: row.visibility,
    inviteCode: row.invite_code,
    seats: row.seats,
    minBet: Number(row.min_bet),
    maxBet: Number(row.max_bet),
    status: row.status,
    bettingDeadline: row.betting_deadline_at ? new Date(row.betting_deadline_at) : null,
  };
  if (row.game === "holdem") {
    const poker = parsePokerRules(row.rules, row.seats);
    if (!poker.ok) throw new Error(`Table ${row.id} has invalid poker rules: ${poker.error}`);
    return { ...base, game: "holdem", rules: poker.rules };
  }
  const parsed = parseRules(row.rules);
  if (!parsed.ok) throw new Error(`Table ${row.id} has invalid rules: ${parsed.error}`);
  return {
    game: "blackjack",
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    visibility: row.visibility,
    inviteCode: row.invite_code,
    seats: row.seats,
    minBet: Number(row.min_bet),
    maxBet: Number(row.max_bet),
    rules: parsed.rules,
    status: row.status,
    bettingDeadline: row.betting_deadline_at ? new Date(row.betting_deadline_at) : null,
  };
}

/** Turns database errors raised by our SQL functions into player-facing messages. */
export function friendlyDbError(error: { code?: string; message: string }, duplicateMessage?: string): GameError {
  if (error.message.includes("INSUFFICIENT_CHIPS")) return new GameError("You don't have enough chips for that.");
  if (error.message.includes("STALE_ROUND") || error.message.includes("STALE_HAND")) {
    return new GameError("That hand already moved on. Refreshing…");
  }
  if (error.code === "23505") return new GameError(duplicateMessage ?? "That was already done.");
  console.error("Database error", error);
  return new GameError("Something went wrong. Please try again.");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for strings shaped like a table/round id, so junk never reaches the database. */
export function isId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Bumps last_activity_at, which is also what tells everyone watching to refresh. */
export async function touchTable(tableId: string) {
  await createAdminClient().from("game_tables").update({ last_activity_at: new Date().toISOString() }).eq("id", tableId);
}

// ---------- Creating and reading tables ----------

export type NewTableInput = {
  name: string;
  visibility: "public" | "private";
  seats: number;
  minBet: number;
  maxBet: number;
  rules: unknown;
};

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I mix-ups

function newInviteCode(): string {
  return Array.from({ length: 8 }, () => INVITE_ALPHABET[secureRandomInt(INVITE_ALPHABET.length)]).join("");
}

/** Creates a table and seats its owner in seat 1. Returns the table id. */
export async function createBlackjackTable(ownerId: string, input: NewTableInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40) throw new GameError("Table name must be 1–40 characters.");
  if (input.visibility !== "public" && input.visibility !== "private") throw new GameError("Choose public or private.");
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 7) throw new GameError("Seats must be 1–7.");
  if (!Number.isInteger(input.minBet) || input.minBet < 1) throw new GameError("Minimum bet must be at least 1.");
  if (!Number.isInteger(input.maxBet) || input.maxBet < input.minBet || input.maxBet > MAX_BET_LIMIT) {
    throw new GameError(`Maximum bet must be between the minimum and ${MAX_BET_LIMIT.toLocaleString("en-US")}.`);
  }
  const rules = parseRules(input.rules);
  if (!rules.ok) throw new GameError(rules.error);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_tables")
    .insert({
      game: "blackjack",
      name,
      owner_id: ownerId,
      visibility: input.visibility,
      invite_code: input.visibility === "private" ? newInviteCode() : null,
      seats: input.seats,
      min_bet: input.minBet,
      max_bet: input.maxBet,
      rules: rules.rules,
    })
    .select("id")
    .single();
  if (error || !data) throw friendlyDbError(error ?? { message: "No table returned" });

  const seat = await admin.from("table_seats").insert({ table_id: data.id, seat_number: 0, player_id: ownerId });
  if (seat.error) throw friendlyDbError(seat.error);
  return data.id;
}

export async function getTable(tableId: string): Promise<GameTable | null> {
  const { data, error } = await createAdminClient()
    .from("game_tables")
    .select(TABLE_COLUMNS)
    .eq("id", tableId)
    .maybeSingle<TableRow>();
  if (error) throw friendlyDbError(error);
  return data ? toTable(data) : null;
}

/** The table if it's a blackjack table, else null. */
export async function getBlackjackTable(tableId: string): Promise<BlackjackTable | null> {
  const table = await getTable(tableId);
  return table?.game === "blackjack" ? table : null;
}

/** The table if it's a poker table, else null. */
export async function getPokerTable(tableId: string): Promise<PokerTable | null> {
  const table = await getTable(tableId);
  return table?.game === "holdem" ? table : null;
}

/** Public tables, your own, ones you were invited to, and ones you sit at. */
export async function canViewTable(table: GameTable, playerId: string): Promise<boolean> {
  if (table.visibility === "public" || table.ownerId === playerId) return true;
  const admin = createAdminClient();
  const [member, seat] = await Promise.all([
    admin.from("table_members").select("player_id").eq("table_id", table.id).eq("player_id", playerId).maybeSingle(),
    admin.from("table_seats").select("player_id").eq("table_id", table.id).eq("player_id", playerId).maybeSingle(),
  ]);
  return Boolean(member.data || seat.data);
}

export async function getSeats(tableId: string): Promise<SeatInfo[]> {
  const { data, error } = await createAdminClient()
    .from("table_seats")
    .select("seat_number, player_id, bot_name, status, pending_bet, stack, leaving, profiles(username, avatar)")
    .eq("table_id", tableId)
    .order("seat_number");
  if (error) throw friendlyDbError(error);
  return data.map((row) => {
    const profile = row.profiles as unknown as { username: string; avatar: AvatarId } | null;
    const bot = row.player_id === null;
    return {
      seatNumber: row.seat_number,
      playerId: bot ? botId(row.bot_name!) : row.player_id!,
      status: row.status as SeatState["status"],
      pendingBet: row.pending_bet === null ? null : Number(row.pending_bet),
      username: bot ? row.bot_name! : profile!.username,
      avatar: bot ? "verdant" : profile!.avatar,
      isBot: bot,
      stack: row.stack === null ? null : Number(row.stack),
      leaving: row.leaving,
    };
  });
}

export async function getPlayerChips(playerId: string): Promise<number> {
  const { data, error } = await createAdminClient().from("profiles").select("chips").eq("id", playerId).single();
  if (error) throw friendlyDbError(error);
  return Number(data.chips);
}

// ---------- Lists ----------

export type TableListing = GameTable & { seated: number };

type ListingRow = TableRow & { table_seats: { count: number }[] };

function toListing(row: ListingRow): TableListing {
  return { ...toTable(row), seated: row.table_seats[0]?.count ?? 0 };
}

/** Open tables you own or sit at, most recently active first. */
export async function listMyTables(playerId: string): Promise<TableListing[]> {
  const admin = createAdminClient();
  const { data: seatRows } = await admin.from("table_seats").select("table_id").eq("player_id", playerId);
  const seatedIds = (seatRows ?? []).map((r) => r.table_id);
  const filter = seatedIds.length > 0 ? `owner_id.eq.${playerId},id.in.(${seatedIds.join(",")})` : `owner_id.eq.${playerId}`;
  const { data, error } = await admin
    .from("game_tables")
    .select(`${TABLE_COLUMNS}, table_seats(count)`)
    .eq("status", "open")
    .or(filter)
    .order("last_activity_at", { ascending: false });
  if (error) throw friendlyDbError(error);
  return (data as unknown as ListingRow[]).map(toListing);
}

/** Open public tables for the lobby. Closes idle tables first. */
export async function listLobbyTables(): Promise<TableListing[]> {
  const admin = createAdminClient();
  await admin.rpc("close_idle_tables");
  const { data, error } = await admin
    .from("game_tables")
    .select(`${TABLE_COLUMNS}, table_seats(count)`)
    .eq("status", "open")
    .eq("visibility", "public")
    .order("last_activity_at", { ascending: false })
    .limit(50);
  if (error) throw friendlyDbError(error);
  return (data as unknown as ListingRow[]).map(toListing);
}

// ---------- Joining, seats, and closing ----------

/** Gives the player access to a private table from its invite code. Returns the table id. */
export async function joinByInvite(code: string, playerId: string): Promise<string | null> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(clean)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("game_tables")
    .select("id")
    .eq("invite_code", clean)
    .eq("status", "open")
    .maybeSingle();
  if (!data) return null;
  await admin.from("table_members").upsert({ table_id: data.id, player_id: playerId }, { ignoreDuplicates: true });
  return data.id;
}

export async function sitDown(table: GameTable, playerId: string, seatNumber: number) {
  if (table.game !== "blackjack") throw new GameError("Buy in to sit at a poker table.");
  if (table.status !== "open") throw new GameError("This table is closed.");
  if (!Number.isInteger(seatNumber) || seatNumber < 0 || seatNumber >= table.seats) throw new GameError("No such seat.");
  if (!(await canViewTable(table, playerId))) throw new GameError("Table not found.");

  const { error } = await createAdminClient()
    .from("table_seats")
    .insert({ table_id: table.id, seat_number: seatNumber, player_id: playerId });
  if (error) {
    throw friendlyDbError(error, "That seat was just taken, or you're already sitting at this table.");
  }
  await touchTable(table.id);
}

/**
 * Leaves the table. A hand still in play is finished automatically (stand),
 * and any winnings are still paid.
 */
export async function standUp(table: GameTable, playerId: string) {
  if (table.game !== "blackjack") throw new GameError("Use Leave table to cash out of a poker table.");
  const { error } = await createAdminClient()
    .from("table_seats")
    .delete()
    .eq("table_id", table.id)
    .eq("player_id", playerId);
  if (error) throw friendlyDbError(error);
  await touchTable(table.id);
}

/** Owner only, and only between hands. Everyone is unseated. */
export async function closeTable(table: GameTable, playerId: string, roundInProgress: boolean) {
  if (table.ownerId !== playerId) throw new GameError("Only the table's creator can close it.");
  await shutTable(table, roundInProgress);
}

/** Closes a table between hands, cashing out poker players. Callers check who may do it. */
export async function shutTable(table: GameTable, roundInProgress: boolean) {
  if (roundInProgress) throw new GameError("Wait for the current hand to finish first.");
  const admin = createAdminClient();
  if (table.game === "holdem") {
    // Give every player their chips back before the seats go.
    for (const seat of await getSeats(table.id)) {
      if (seat.isBot) continue;
      const { error } = await admin.rpc("poker_cash_out", { p_table_id: table.id, p_player_id: seat.playerId });
      if (error) throw friendlyDbError(error);
    }
  }
  const { error } = await admin
    .from("game_tables")
    .update({ status: "closed", closed_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
    .eq("id", table.id);
  if (error) throw friendlyDbError(error);
  await admin.from("table_seats").delete().eq("table_id", table.id);
}
