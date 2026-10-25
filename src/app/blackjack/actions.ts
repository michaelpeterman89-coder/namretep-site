"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionType } from "@/lib/games/blackjack";
import { getCurrentPlayer } from "@/lib/auth";
import {
  createBlackjackTable,
  dealRound,
  GameError,
  getPlayerChips,
  getRoundForPlayer,
  getTable,
  isId,
  takeAction,
  type GameTable,
  type RoundForPlayer,
} from "@/server/blackjack";

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

export type PlayResult = {
  ok: boolean;
  error?: string;
  /** The latest round (also sent on errors, so the screen can resync). */
  round: RoundForPlayer | null;
  chips: number;
};

async function run(
  tableId: unknown,
  work: (table: GameTable, playerId: string) => Promise<RoundForPlayer>,
): Promise<PlayResult> {
  const player = await getCurrentPlayer();
  if (!player) return { ok: false, error: "You're not logged in. Please log in again.", round: null, chips: 0 };
  if (!isId(tableId)) return { ok: false, error: "Table not found.", round: null, chips: player.chips };

  const table = await getTable(tableId);
  if (!table || table.ownerId !== player.id) {
    return { ok: false, error: "Table not found.", round: null, chips: player.chips };
  }

  try {
    const round = await work(table, player.id);
    refresh(); // updates the chip count in the header
    return { ok: true, round, chips: await getPlayerChips(player.id) };
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return {
      ok: false,
      error: e.message,
      round: await getRoundForPlayer(table, player.id),
      chips: await getPlayerChips(player.id),
    };
  }
}

export async function dealAction(tableId: unknown, bet: unknown): Promise<PlayResult> {
  return run(tableId, async (table, playerId) => {
    if (typeof bet !== "number") throw new GameError("Enter a bet.");
    return dealRound(table, playerId, bet);
  });
}

export async function playAction(
  tableId: unknown,
  roundId: unknown,
  version: unknown,
  type: unknown,
  hintsEnabled: unknown = false,
): Promise<PlayResult> {
  return run(tableId, async (table, playerId) => {
    if (!isId(roundId) || !Number.isInteger(version) || !ACTION_TYPES.includes(type as ActionType)) {
      throw new GameError("That move isn't allowed right now.");
    }
    return takeAction(table, playerId, roundId, version as number, type as ActionType, hintsEnabled === true);
  });
}
