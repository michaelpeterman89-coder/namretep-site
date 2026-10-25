import "server-only";
import {
  actionChanges,
  applyAction,
  betChanges,
  IllegalActionError,
  legalActions,
  parseRules,
  payoutChanges,
  publicView,
  startRound,
  type ActionType,
  type BlackjackRound,
  type BlackjackRules,
  type ChipChange,
  type PublicRound,
} from "@/lib/games/blackjack";
import { secureRandomInt } from "@/lib/random";
import { createAdminClient } from "@/lib/supabase/admin";

// All game writes go through here, using the secret-key client. Every
// function checks the player is allowed to act before touching the database.

/** An error whose message is safe and helpful to show the player. */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

export type GameTable = {
  id: string;
  name: string;
  ownerId: string;
  visibility: "public" | "private";
  inviteCode: string | null;
  seats: number;
  minBet: number;
  maxBet: number;
  rules: BlackjackRules;
  status: "open" | "closed";
};

/** What the browser gets: the public view plus what this player may do now. */
export type RoundForPlayer = {
  roundId: string;
  version: number;
  view: PublicRound;
  seat: number;
  actions: ActionType[];
};

type TableRow = {
  id: string;
  name: string;
  owner_id: string;
  visibility: "public" | "private";
  invite_code: string | null;
  seats: number;
  min_bet: number;
  max_bet: number;
  rules: unknown;
  status: "open" | "closed";
};

const TABLE_COLUMNS = "id, name, owner_id, visibility, invite_code, seats, min_bet, max_bet, rules, status";
export const MAX_BET_LIMIT = 1_000_000;

function toTable(row: TableRow): GameTable {
  const parsed = parseRules(row.rules);
  if (!parsed.ok) throw new Error(`Table ${row.id} has invalid rules: ${parsed.error}`);
  return {
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
  };
}

/** Turns database errors raised by our SQL functions into player-facing messages. */
function friendlyDbError(error: { code?: string; message: string }): GameError {
  if (error.message.includes("INSUFFICIENT_CHIPS")) return new GameError("You don't have enough chips for that.");
  if (error.message.includes("STALE_ROUND")) return new GameError("That hand already moved on. Refreshing…");
  if (error.code === "23505") return new GameError("A round is already in progress at this table.");
  console.error("Blackjack database error", error);
  return new GameError("Something went wrong. Please try again.");
}

// ---------- Tables ----------

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

  const { data, error } = await createAdminClient()
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
  return data.id as string;
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

export async function listTablesForOwner(ownerId: string): Promise<GameTable[]> {
  const { data, error } = await createAdminClient()
    .from("game_tables")
    .select(TABLE_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("last_activity_at", { ascending: false });
  if (error) throw friendlyDbError(error);
  return (data as TableRow[]).map(toTable);
}

/** A player's current balance, read fresh from the database. */
export async function getPlayerChips(playerId: string): Promise<number> {
  const { data, error } = await createAdminClient().from("profiles").select("chips").eq("id", playerId).single();
  if (error) throw friendlyDbError(error);
  return Number(data.chips);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for strings shaped like a table/round id, so junk never reaches the database. */
export function isId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Phase 3 is solo play: only the table's owner can play at it. */
function assertCanPlay(table: GameTable, playerId: string) {
  if (table.ownerId !== playerId) throw new GameError("Only this table's owner can play here (for now).");
  if (table.status !== "open") throw new GameError("This table is closed.");
}

// ---------- Rounds ----------

type StoredRound = { id: string; version: number; round: BlackjackRound };

/** The table's most recent round, active or finished, including its secret state. */
async function getLatestRound(tableId: string): Promise<StoredRound | null> {
  const { data, error } = await createAdminClient()
    .from("blackjack_rounds")
    .select("id, version, blackjack_round_secrets(state)")
    .eq("table_id", tableId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw friendlyDbError(error);
  if (!data) return null;
  const secrets = data.blackjack_round_secrets as unknown as { state: BlackjackRound } | null;
  if (!secrets) throw new Error(`Round ${data.id} is missing its state`);
  return { id: data.id as string, version: data.version as number, round: secrets.state };
}

function forPlayer(table: GameTable, stored: StoredRound, playerId: string): RoundForPlayer {
  const seat = stored.round.seats.findIndex((s) => s.playerId === playerId);
  return {
    roundId: stored.id,
    version: stored.version,
    view: publicView(stored.round),
    seat,
    actions: seat >= 0 ? legalActions(table.rules, stored.round, seat) : [],
  };
}

/** The latest round at a table, as this player may see it. */
export async function getRoundForPlayer(table: GameTable, playerId: string): Promise<RoundForPlayer | null> {
  const stored = await getLatestRound(table.id);
  return stored ? forPlayer(table, stored, playerId) : null;
}

/** Takes the bet, deals a new round, and saves both together. */
export async function dealRound(table: GameTable, playerId: string, bet: number): Promise<RoundForPlayer> {
  assertCanPlay(table, playerId);
  if (!Number.isInteger(bet) || bet < table.minBet || bet > table.maxBet) {
    throw new GameError(
      `Bet must be between ${table.minBet.toLocaleString("en-US")} and ${table.maxBet.toLocaleString("en-US")}.`,
    );
  }

  const latest = await getLatestRound(table.id);
  if (latest && latest.round.phase !== "settled") throw new GameError("Finish the current hand first.");

  const round = startRound(table.rules, latest?.round.shoe ?? null, [{ playerId, bet }]);
  const chips: ChipChange[] = [...betChanges(round), ...payoutChanges(round)];

  const { data, error } = await createAdminClient()
    .rpc("bj_start_round", {
      p_table_id: table.id,
      p_phase: round.phase,
      p_public: publicView(round),
      p_secret: round,
      p_chips: chips,
    })
    .single<{ round_id: string; round_number: number }>();
  if (error || !data) throw friendlyDbError(error ?? { message: "No round returned" });

  return forPlayer(table, { id: data.round_id, version: 1, round }, playerId);
}

/**
 * Applies one player action. `version` is the round version the player was
 * looking at; if the round has moved on (e.g. a double-click), nothing happens.
 */
export async function takeAction(
  table: GameTable,
  playerId: string,
  roundId: string,
  version: number,
  type: ActionType,
): Promise<RoundForPlayer> {
  assertCanPlay(table, playerId);

  const stored = await getLatestRound(table.id);
  if (!stored || stored.id !== roundId || stored.version !== version) {
    throw new GameError("That hand already moved on. Refreshing…");
  }

  const seat = stored.round.seats.findIndex((s) => s.playerId === playerId);
  if (seat < 0) throw new GameError("You're not playing this hand.");

  const action = { type, seat };
  let next: BlackjackRound;
  try {
    next = applyAction(table.rules, stored.round, action);
  } catch (e) {
    if (e instanceof IllegalActionError) throw new GameError("That move isn't allowed right now.");
    throw e;
  }

  const chips = [...actionChanges(stored.round, action), ...payoutChanges(next)];
  const { data: newVersion, error } = await createAdminClient().rpc("bj_update_round", {
    p_round_id: stored.id,
    p_version: stored.version,
    p_phase: next.phase,
    p_public: publicView(next),
    p_secret: next,
    p_chips: chips,
  });
  if (error) throw friendlyDbError(error);

  return forPlayer(table, { id: stored.id, version: newVersion as number, round: next }, playerId);
}
