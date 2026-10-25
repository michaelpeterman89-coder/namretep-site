import "server-only";
import type { User } from "@supabase/supabase-js";
import type { AvatarId } from "@/lib/avatars";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { isRoundInProgress } from "./blackjack";
import { isHandInProgress, leaveTable } from "./poker";
import {
  friendlyDbError,
  GameError,
  getTable,
  shutTable,
  standUp,
  touchTable,
  type GameId,
} from "./tables";

// Admin tools. Every function here takes the admin's id and is only called
// after requireAdmin(); the SQL functions check again that they're an admin.

/** Supabase's way of saying "banned until further notice" (100 years). */
const BAN_FOREVER = "876000h";

function adminError(error: { code?: string; message: string }): GameError {
  if (error.message.includes("NOT_ADMIN")) return new GameError("Only admins can do that.");
  if (error.message.includes("NOT_YOURSELF")) return new GameError("You can't do that to your own account.");
  if (error.message.includes("BAD_AMOUNT")) return new GameError("Enter an amount between 1 and 100,000,000.");
  if (error.message.includes("INSUFFICIENT_CHIPS")) return new GameError("They don't have that many chips to take.");
  if (error.message.includes("NO_PROFILE")) return new GameError("That player doesn't exist.");
  return friendlyDbError(error, "That username is taken.");
}

// ---------- Overview ----------

export type Overview = {
  players: number;
  new_this_week: number;
  suspended: number;
  admins: number;
  chips_in_wallets: number;
  chips_on_tables: number;
  open_tables: number;
  blackjack_rounds_today: number;
  poker_hands_today: number;
};

export async function getOverview(adminId: string): Promise<Overview> {
  const { data, error } = await createAdminClient().rpc("admin_overview", { p_admin: adminId });
  if (error) throw adminError(error);
  const raw = data as Record<string, number | string>;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)])) as Overview;
}

// ---------- Players ----------

export type AdminPlayer = {
  id: string;
  username: string;
  avatar: AvatarId;
  chips: number;
  isAdmin: boolean;
  suspendedAt: Date | null;
  createdAt: Date;
  email: string | null;
  lastSignInAt: Date | null;
};

/** Every login account (emails live in Supabase Auth, not in profiles). */
async function listAuthUsers(): Promise<Map<string, User>> {
  const admin = createAdminClient();
  const users = new Map<string, User>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new GameError("Couldn't load login accounts. Please try again.");
    for (const user of data.users) users.set(user.id, user);
    if (data.users.length < 1000) return users;
  }
}

type ProfileRow = {
  id: string;
  username: string;
  avatar: string;
  chips: number;
  is_admin: boolean;
  suspended_at: string | null;
  created_at: string;
};

const PROFILE_COLUMNS = "id, username, avatar, chips, is_admin, suspended_at, created_at";

function toAdminPlayer(row: ProfileRow, user: User | undefined): AdminPlayer {
  return {
    id: row.id,
    username: row.username,
    avatar: row.avatar as AvatarId,
    chips: Number(row.chips),
    isAdmin: row.is_admin,
    suspendedAt: row.suspended_at ? new Date(row.suspended_at) : null,
    createdAt: new Date(row.created_at),
    email: user?.email ?? null,
    lastSignInAt: user?.last_sign_in_at ? new Date(user.last_sign_in_at) : null,
  };
}

export type PlayerSort = "newest" | "chips" | "active" | "name";
export const PLAYER_SORTS: Record<PlayerSort, string> = {
  newest: "Newest",
  active: "Last signed in",
  chips: "Most chips",
  name: "Username",
};
export const PLAYERS_PER_PAGE = 50;

/** Players matching a username/email search, sorted, one page at a time. */
export async function listPlayers(search: string, sort: PlayerSort, page: number) {
  const [{ data, error }, users] = await Promise.all([
    createAdminClient().from("profiles").select(PROFILE_COLUMNS),
    listAuthUsers(),
  ]);
  if (error) throw adminError(error);
  const needle = search.trim().toLowerCase();
  const all = (data as ProfileRow[])
    .map((row) => toAdminPlayer(row, users.get(row.id)))
    .filter((p) => !needle || p.username.toLowerCase().includes(needle) || p.email?.toLowerCase().includes(needle));

  const time = (d: Date | null) => d?.getTime() ?? 0;
  all.sort((a, b) => {
    switch (sort) {
      case "chips":
        return b.chips - a.chips;
      case "active":
        return time(b.lastSignInAt) - time(a.lastSignInAt);
      case "name":
        return a.username.localeCompare(b.username, "en", { sensitivity: "base" });
      default:
        return time(b.createdAt) - time(a.createdAt);
    }
  });
  const start = (page - 1) * PLAYERS_PER_PAGE;
  return { players: all.slice(start, start + PLAYERS_PER_PAGE), total: all.length };
}

export type LedgerLine = { id: number; amount: number; balanceAfter: number; reason: string; tableId: string | null; at: Date };
export type GameStatsLine = { game: string; rounds: number; wins: number; net: number; biggestWin: number; biggestLoss: number };
export type SeatLine = { tableId: string; tableName: string; game: GameId; stack: number | null };

export type PlayerDetail = AdminPlayer & {
  ledger: LedgerLine[];
  stats: GameStatsLine[];
  seats: SeatLine[];
  history: AdminLogLine[];
};

export async function getPlayerDetail(playerId: string): Promise<PlayerDetail | null> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", playerId).maybeSingle();
  if (!row) return null;
  const [{ data: authData }, ledger, stats, seats, history] = await Promise.all([
    admin.auth.admin.getUserById(playerId),
    admin
      .from("chip_ledger")
      .select("id, amount, balance_after, reason, table_id, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(40),
    admin.from("player_game_stats").select("game, rounds, wins, net_chips, biggest_win, biggest_loss").eq("player_id", playerId),
    admin.from("table_seats").select("table_id, stack, game_tables(name, game)").eq("player_id", playerId),
    listAdminLog({ targetId: playerId, limit: 30 }),
  ]);

  // Stats are stored per rule set; add them up per game.
  const byGame = new Map<string, GameStatsLine>();
  for (const s of stats.data ?? []) {
    const line = byGame.get(s.game) ?? { game: s.game, rounds: 0, wins: 0, net: 0, biggestWin: 0, biggestLoss: 0 };
    line.rounds += Number(s.rounds);
    line.wins += Number(s.wins);
    line.net += Number(s.net_chips);
    line.biggestWin = Math.max(line.biggestWin, Number(s.biggest_win));
    line.biggestLoss = Math.max(line.biggestLoss, Number(s.biggest_loss));
    byGame.set(s.game, line);
  }

  return {
    ...toAdminPlayer(row as ProfileRow, authData?.user ?? undefined),
    ledger: (ledger.data ?? []).map((l) => ({
      id: l.id,
      amount: Number(l.amount),
      balanceAfter: Number(l.balance_after),
      reason: l.reason,
      tableId: l.table_id,
      at: new Date(l.created_at),
    })),
    stats: [...byGame.values()],
    seats: (seats.data ?? []).map((s) => {
      const table = s.game_tables as unknown as { name: string; game: GameId };
      return { tableId: s.table_id, tableName: table.name, game: table.game, stack: s.stack === null ? null : Number(s.stack) };
    }),
    history,
  };
}

export async function adjustChips(adminId: string, playerId: string, amount: number, note: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("admin_adjust_chips", {
    p_admin: adminId,
    p_target: playerId,
    p_amount: amount,
    p_note: note,
  });
  if (error) throw adminError(error);
  return Number(data);
}

export async function setAdmin(adminId: string, playerId: string, isAdmin: boolean) {
  const { error } = await createAdminClient().rpc("admin_set_admin", {
    p_admin: adminId,
    p_target: playerId,
    p_is_admin: isAdmin,
  });
  if (error) throw adminError(error);
}

export async function renamePlayer(adminId: string, playerId: string, username: string) {
  const { error } = await createAdminClient().rpc("admin_rename", {
    p_admin: adminId,
    p_target: playerId,
    p_username: username,
  });
  if (error) throw adminError(error);
}

/**
 * Suspending blocks logging in (a Supabase Auth ban) and locks the account
 * out of every page right away, then takes them off any tables they sit at.
 */
export async function setSuspended(adminId: string, playerId: string, suspended: boolean, note: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_suspended", {
    p_admin: adminId,
    p_target: playerId,
    p_suspended: suspended,
    p_note: note,
  });
  if (error) throw adminError(error);

  const { error: banError } = await admin.auth.admin.updateUserById(playerId, {
    ban_duration: suspended ? BAN_FOREVER : "none",
  });
  if (banError) {
    console.error("Couldn't update the login ban", banError);
    throw new GameError("Saved, but couldn't update their login. Please try again.");
  }

  if (!suspended) return;
  const { data: seats } = await admin.from("table_seats").select("table_id").eq("player_id", playerId);
  for (const { table_id } of seats ?? []) {
    const table = await getTable(table_id);
    if (!table) continue;
    // Poker chips go back to their balance (after the hand if one is running).
    if (table.game === "holdem") await leaveTable(table, playerId);
    else await standUp(table, playerId);
  }
}

// ---------- Tables ----------

export type AdminTable = {
  id: string;
  name: string;
  game: GameId;
  visibility: "public" | "private";
  ownerName: string;
  seats: number;
  seated: number;
  bots: number;
  lastActivityAt: Date;
  createdAt: Date;
};

export async function listOpenTables(): Promise<AdminTable[]> {
  const { data, error } = await createAdminClient()
    .from("game_tables")
    .select("id, name, game, visibility, seats, last_activity_at, created_at, owner:profiles!game_tables_owner_id_fkey(username), table_seats(player_id)")
    .eq("status", "open")
    .order("last_activity_at", { ascending: false })
    .limit(200);
  if (error) throw adminError(error);
  return data.map((t) => {
    const seated = t.table_seats as { player_id: string | null }[];
    return {
      id: t.id,
      name: t.name,
      game: t.game as GameId,
      visibility: t.visibility as "public" | "private",
      ownerName: (t.owner as unknown as { username: string } | null)?.username ?? "?",
      seats: t.seats,
      seated: seated.filter((s) => s.player_id).length,
      bots: seated.filter((s) => !s.player_id).length,
      lastActivityAt: new Date(t.last_activity_at),
      createdAt: new Date(t.created_at),
    };
  });
}

/** Closes any table between hands; poker players get their chips back. */
export async function adminCloseTable(adminId: string, tableId: string) {
  const table = await getTable(tableId);
  if (!table) throw new GameError("That table doesn't exist.");
  if (table.status !== "open") throw new GameError("That table is already closed.");
  const playing = table.game === "holdem" ? await isHandInProgress(table.id) : await isRoundInProgress(table.id);
  await shutTable(table, playing);
  await touchTable(table.id);
  const { error } = await createAdminClient().rpc("admin_log", {
    p_admin: adminId,
    p_action: "close_table",
    p_target: table.ownerId,
    p_table: table.id,
    p_details: { name: table.name, game: table.game },
  });
  if (error) throw adminError(error);
}

// ---------- Audit log ----------

export type AdminLogLine = {
  id: number;
  action: string;
  adminName: string | null;
  targetId: string | null;
  targetName: string | null;
  details: Record<string, Json | undefined>;
  at: Date;
};

export async function listAdminLog({ targetId, limit = 100 }: { targetId?: string; limit?: number } = {}) {
  let query = createAdminClient()
    .from("admin_actions")
    .select(
      "id, action, target_id, details, created_at, admin:profiles!admin_actions_admin_id_fkey(username), target:profiles!admin_actions_target_id_fkey(username)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (targetId) query = query.eq("target_id", targetId);
  const { data, error } = await query;
  if (error) throw adminError(error);
  return data.map(
    (l): AdminLogLine => ({
      id: l.id,
      action: l.action,
      adminName: (l.admin as unknown as { username: string } | null)?.username ?? null,
      targetId: l.target_id,
      targetName: (l.target as unknown as { username: string } | null)?.username ?? null,
      details: (l.details ?? {}) as Record<string, Json | undefined>,
      at: new Date(l.created_at),
    }),
  );
}
