"use server";

import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { BACCARAT_BET_KINDS, type BaccaratBetKind } from "@/lib/games/baccarat";
import {
  baccaratBet,
  baccaratClear,
  baccaratDeal,
  baccaratRebet,
  createBaccaratTable,
  getBaccaratView,
  leaveBaccarat,
  sitAtBaccarat,
  type BaccaratView,
} from "@/server/baccarat";
import { canViewTable, closeTable, GameError, getBaccaratTable, isId, type BaccaratTable } from "@/server/tables";

// Server actions are public endpoints: never trust the arguments' types.

export type CreateBaccaratTableState = { error?: string };

export async function createBaccaratTableAction(
  _prev: CreateBaccaratTableState,
  formData: FormData,
): Promise<CreateBaccaratTableState> {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/baccarat/new");
  const on = (name: string) => formData.get(name) === "on";

  let tableId: string;
  try {
    tableId = await createBaccaratTable(player.id, {
      name: String(formData.get("name") ?? ""),
      visibility: formData.get("visibility") === "private" ? "private" : "public",
      seats: Number(formData.get("seats")),
      minBet: Number(formData.get("minBet")),
      maxBet: Number(formData.get("maxBet")),
      rules: {
        variant: String(formData.get("variant")),
        decks: Number(formData.get("decks")),
        tiePays: Number(formData.get("tiePays")),
        pairs: on("pairs"),
        dragonBonus: on("dragonBonus"),
        dragon7Panda8: on("dragon7Panda8"),
        bigSmall: on("bigSmall"),
      },
    });
  } catch (e) {
    if (e instanceof GameError) return { error: e.message };
    throw e;
  }
  redirect(`/baccarat/${tableId}`);
}

export type BaccaratResult = { ok: boolean; error?: string; view: BaccaratView | null };

async function run(tableId: unknown, work: (table: BaccaratTable, playerId: string) => Promise<void>): Promise<BaccaratResult> {
  const player = await getCurrentPlayer();
  if (!player) return { ok: false, error: "You're not logged in. Please log in again.", view: null };
  if (!isId(tableId)) return { ok: false, error: "Table not found.", view: null };
  const table = await getBaccaratTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) return { ok: false, error: "Table not found.", view: null };
  const view = async () => getBaccaratView((await getBaccaratTable(tableId)) ?? table, player.id);
  try {
    await work(table, player.id);
    return { ok: true, view: await view() };
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return { ok: false, error: e.message, view: await view() };
  }
}

export async function baccaratBetAction(tableId: unknown, kind: unknown, amount: unknown): Promise<BaccaratResult> {
  return run(tableId, (table, playerId) => {
    if (!BACCARAT_BET_KINDS.includes(kind as BaccaratBetKind)) throw new GameError("That isn't a bet at this table.");
    const chips = Number(amount);
    if (!Number.isInteger(chips) || chips < 1 || chips > 100_000_000) throw new GameError("Pick a chip to bet.");
    return baccaratBet(table, playerId, kind as BaccaratBetKind, chips);
  });
}

export async function baccaratRebetAction(tableId: unknown): Promise<BaccaratResult> {
  return run(tableId, (table, playerId) => baccaratRebet(table, playerId));
}

export async function baccaratClearAction(tableId: unknown): Promise<BaccaratResult> {
  return run(tableId, (table, playerId) => baccaratClear(table, playerId));
}

export async function baccaratDealAction(tableId: unknown): Promise<BaccaratResult> {
  return run(tableId, (table, playerId) => baccaratDeal(table, playerId));
}

export async function baccaratSitAction(tableId: unknown, seatNumber: unknown): Promise<BaccaratResult> {
  return run(tableId, (table, playerId) => sitAtBaccarat(table, playerId, Number(seatNumber)));
}

export async function baccaratLeaveAction(tableId: unknown): Promise<BaccaratResult> {
  return run(tableId, (table, playerId) => leaveBaccarat(table, playerId));
}

export async function closeBaccaratTableAction(tableId: unknown): Promise<BaccaratResult> {
  return run(tableId, (table, playerId) => closeTable(table, playerId, false));
}
