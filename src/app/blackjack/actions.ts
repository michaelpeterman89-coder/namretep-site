"use server";

import { redirect } from "next/navigation";
import type { ActionType } from "@/lib/games/blackjack";
import { getCurrentPlayer } from "@/lib/auth";
import {
  getTableView,
  isRoundInProgress,
  placeBet,
  runTimeouts,
  takeAction,
  type RoundForPlayer,
  type TableView,
} from "@/server/blackjack";
import {
  canViewTable,
  closeTable,
  createBlackjackTable,
  GameError,
  getTable,
  isId,
  sitDown,
  standUp,
  type GameTable,
} from "@/server/tables";

// Server actions are public endpoints: never trust the arguments' types.

const ACTION_TYPES: readonly ActionType[] = ["hit", "stand", "double", "split", "surrender", "insurance", "decline"];

export type CreateTableState = { error?: string };

export async function createTableAction(_prev: CreateTableState, formData: FormData): Promise<CreateTableState> {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/blackjack/new");

  let rules: unknown;
  try {
    rules = JSON.parse(String(formData.get("rules") ?? ""));
  } catch {
    return { error: "Invalid rules." };
  }

  let tableId: string;
  try {
    tableId = await createBlackjackTable(player.id, {
      name: String(formData.get("name") ?? ""),
      visibility: formData.get("visibility") === "private" ? "private" : "public",
      seats: Number(formData.get("seats")),
      minBet: Number(formData.get("minBet")),
      maxBet: Number(formData.get("maxBet")),
      rules,
    });
  } catch (e) {
    if (e instanceof GameError) return { error: e.message };
    throw e;
  }

  redirect(`/blackjack/${tableId}`);
}

export type TableResult = {
  ok: boolean;
  error?: string;
  /** The latest table state (also sent on errors, so the screen can resync). */
  view: TableView | null;
  feedback?: RoundForPlayer["feedback"];
};

/**
 * Checks the player is logged in and may see the table, runs `work`, and
 * returns the fresh table state either way.
 */
async function run(
  tableId: unknown,
  work: (table: GameTable, playerId: string) => Promise<RoundForPlayer | void>,
): Promise<TableResult> {
  const player = await getCurrentPlayer();
  if (!player) return { ok: false, error: "You're not logged in. Please log in again.", view: null };
  if (!isId(tableId)) return { ok: false, error: "Table not found.", view: null };
  const table = await getTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) return { ok: false, error: "Table not found.", view: null };

  try {
    const result = await work(table, player.id);
    const latest = (await getTable(tableId)) ?? table;
    return { ok: true, view: await getTableView(latest, player.id), feedback: result?.feedback ?? null };
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    const latest = (await getTable(tableId)) ?? table;
    return { ok: false, error: e.message, view: await getTableView(latest, player.id) };
  }
}

export async function sitAction(tableId: unknown, seatNumber: unknown): Promise<TableResult> {
  return run(tableId, (table, playerId) => sitDown(table, playerId, Number(seatNumber)));
}

export async function standAction(tableId: unknown): Promise<TableResult> {
  return run(tableId, async (table, playerId) => {
    await standUp(table, playerId);
    // Finish any hand they left behind straight away.
    await runTimeouts(table);
  });
}

export async function betAction(tableId: unknown, bet: unknown): Promise<TableResult> {
  return run(tableId, async (table, playerId) => {
    if (typeof bet !== "number") throw new GameError("Enter a bet.");
    await placeBet(table, playerId, bet);
  });
}

export async function playAction(
  tableId: unknown,
  roundId: unknown,
  version: unknown,
  type: unknown,
  hintsEnabled: unknown = false,
): Promise<TableResult> {
  return run(tableId, async (table, playerId) => {
    if (!isId(roundId) || !Number.isInteger(version) || !ACTION_TYPES.includes(type as ActionType)) {
      throw new GameError("That move isn't allowed right now.");
    }
    return takeAction(table, playerId, roundId, version as number, type as ActionType, hintsEnabled === true);
  });
}

export async function closeTableAction(tableId: unknown): Promise<TableResult> {
  return run(tableId, async (table, playerId) => {
    await closeTable(table, playerId, await isRoundInProgress(table.id));
  });
}
