"use server";

import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import type { PokerActionType } from "@/lib/games/poker";
import { buyIn, createPokerTable, getPokerView, leaveTable, takePokerAction, type PokerView } from "@/server/poker";
import { canViewTable, closeTable, GameError, getPokerTable, isId, type PokerTable } from "@/server/tables";

// Server actions are public endpoints: never trust the arguments' types.

const POKER_ACTIONS: readonly PokerActionType[] = ["fold", "check", "call", "raise"];

export type CreatePokerTableState = { error?: string };

export async function createPokerTableAction(
  _prev: CreatePokerTableState,
  formData: FormData,
): Promise<CreatePokerTableState> {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/poker/new");

  let tableId: string;
  try {
    tableId = await createPokerTable(player.id, {
      name: String(formData.get("name") ?? ""),
      visibility: formData.get("visibility") === "private" ? "private" : "public",
      seats: Number(formData.get("seats")),
      rules: {
        variant: "holdem",
        structure: "no-limit",
        smallBlind: Number(formData.get("smallBlind")),
        bigBlind: Number(formData.get("bigBlind")),
        ante: 0,
        minBuyIn: Number(formData.get("minBuyIn")),
        maxBuyIn: Number(formData.get("maxBuyIn")),
        bots: Number(formData.get("bots")),
      },
    });
  } catch (e) {
    if (e instanceof GameError) return { error: e.message };
    throw e;
  }
  redirect(`/poker/${tableId}`);
}

export type PokerResult = { ok: boolean; error?: string; view: PokerView | null };

async function run(tableId: unknown, work: (table: PokerTable, playerId: string) => Promise<void>): Promise<PokerResult> {
  const player = await getCurrentPlayer();
  if (!player) return { ok: false, error: "You're not logged in. Please log in again.", view: null };
  if (!isId(tableId)) return { ok: false, error: "Table not found.", view: null };
  const table = await getPokerTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) return { ok: false, error: "Table not found.", view: null };

  try {
    await work(table, player.id);
    return { ok: true, view: await getPokerView((await getPokerTable(tableId)) ?? table, player.id) };
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return { ok: false, error: e.message, view: await getPokerView((await getPokerTable(tableId)) ?? table, player.id) };
  }
}

export async function buyInAction(tableId: unknown, seatNumber: unknown, amount: unknown): Promise<PokerResult> {
  return run(tableId, (table, playerId) => buyIn(table, playerId, Number(seatNumber), Number(amount)));
}

export async function leavePokerAction(tableId: unknown): Promise<PokerResult> {
  return run(tableId, (table, playerId) => leaveTable(table, playerId));
}

export async function pokerPlayAction(
  tableId: unknown,
  handId: unknown,
  version: unknown,
  type: unknown,
  amount: unknown,
): Promise<PokerResult> {
  return run(tableId, async (table, playerId) => {
    if (!isId(handId) || !Number.isInteger(version) || !POKER_ACTIONS.includes(type as PokerActionType)) {
      throw new GameError("That move isn't allowed right now.");
    }
    const raiseTo = type === "raise" ? Number(amount) : undefined;
    await takePokerAction(table, playerId, handId, version as number, type as PokerActionType, raiseTo);
  });
}

export async function closePokerTableAction(tableId: unknown): Promise<PokerResult> {
  return run(tableId, async (table, playerId) => {
    const view = await getPokerView(table, playerId);
    await closeTable(table, playerId, view.hand?.view.phase === "betting");
  });
}
