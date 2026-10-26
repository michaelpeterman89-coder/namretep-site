"use server";

import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import type { BetKind, BetRequest, Dice } from "@/lib/games/craps";
import {
  createCrapsTable,
  crapsBet,
  crapsClearBets,
  crapsRemoveBet,
  crapsRoll,
  crapsSetComeOut,
  getCrapsView,
  leaveCraps,
  sitAtCraps,
  type CrapsView,
} from "@/server/craps";
import { canViewTable, closeTable, GameError, getCrapsTable, isId, type CrapsTable } from "@/server/tables";

// Server actions are public endpoints: never trust the arguments' types.

const BET_KINDS: readonly BetKind[] = [
  "pass", "dontPass", "come", "dontCome", "odds", "layOdds", "place", "buy", "lay", "big6", "big8", "field", "hard",
  "any7", "anyCraps", "two", "three", "yo", "twelve", "horn", "ce", "world", "hop", "fire", "allSmall", "allTall", "makeEmAll",
];

export type CreateCrapsTableState = { error?: string };

export async function createCrapsTableAction(_prev: CreateCrapsTableState, formData: FormData): Promise<CreateCrapsTableState> {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login?next=/craps/new");
  const on = (name: string) => formData.get(name) === "on";

  let tableId: string;
  try {
    tableId = await createCrapsTable(player.id, {
      name: String(formData.get("name") ?? ""),
      visibility: formData.get("visibility") === "private" ? "private" : "public",
      seats: Number(formData.get("seats")),
      minBet: Number(formData.get("minBet")),
      maxBet: Number(formData.get("maxBet")),
      rules: {
        variant: formData.get("variant") === "crapless" ? "crapless" : "standard",
        odds: String(formData.get("odds")),
        field12: Number(formData.get("field12")),
        vig: formData.get("vig") === "upfront" ? "upfront" : "win",
        props: on("props"),
        hops: on("hops"),
        fireBet: on("fireBet"),
        allSmallTall: on("allSmallTall"),
      },
    });
  } catch (e) {
    if (e instanceof GameError) return { error: e.message };
    throw e;
  }
  redirect(`/craps/${tableId}`);
}

export type CrapsResult = { ok: boolean; error?: string; view: CrapsView | null };

async function run(tableId: unknown, work: (table: CrapsTable, playerId: string) => Promise<void>): Promise<CrapsResult> {
  const player = await getCurrentPlayer();
  if (!player) return { ok: false, error: "You're not logged in. Please log in again.", view: null };
  if (!isId(tableId)) return { ok: false, error: "Table not found.", view: null };
  const table = await getCrapsTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) return { ok: false, error: "Table not found.", view: null };
  const view = async () => getCrapsView((await getCrapsTable(tableId)) ?? table, player.id);
  try {
    await work(table, player.id);
    return { ok: true, view: await view() };
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return { ok: false, error: e.message, view: await view() };
  }
}

/** Checks a bet request from the browser and returns a clean copy. */
function cleanRequest(input: unknown): BetRequest {
  const r = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (!BET_KINDS.includes(r.kind as BetKind)) throw new GameError("That isn't a bet at this table.");
  const amount = Number(r.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000_000) throw new GameError("Pick a chip to bet.");
  const request: BetRequest = { kind: r.kind as BetKind, amount };
  if (r.number !== undefined && r.number !== null) {
    if (!Number.isInteger(r.number)) throw new GameError("Pick a number to bet on.");
    request.number = r.number as number;
  }
  if (r.dice !== undefined) {
    if (!Array.isArray(r.dice) || r.dice.length !== 2 || !r.dice.every((d) => Number.isInteger(d))) {
      throw new GameError("Pick the two dice to hop.");
    }
    const [a, b] = r.dice as number[];
    request.dice = (a <= b ? [a, b] : [b, a]) as unknown as Dice;
  }
  if (r.parentId !== undefined) {
    if (typeof r.parentId !== "string" || !/^b\d{1,9}$/.test(r.parentId)) throw new GameError("That bet is gone.");
    request.parentId = r.parentId;
  }
  return request;
}

const betId = (id: unknown) => {
  if (typeof id !== "string" || !/^b\d{1,9}$/.test(id)) throw new GameError("That bet is gone.");
  return id;
};

export async function crapsBetAction(tableId: unknown, request: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => crapsBet(table, playerId, cleanRequest(request)));
}

export async function crapsRemoveAction(tableId: unknown, id: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => crapsRemoveBet(table, playerId, betId(id)));
}

export async function crapsClearAction(tableId: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => crapsClearBets(table, playerId));
}

export async function crapsComeOutAction(tableId: unknown, id: unknown, on: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => crapsSetComeOut(table, playerId, betId(id), on === true));
}

export async function crapsRollAction(tableId: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => crapsRoll(table, playerId));
}

export async function crapsSitAction(tableId: unknown, seatNumber: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => sitAtCraps(table, playerId, Number(seatNumber)));
}

export async function crapsLeaveAction(tableId: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => leaveCraps(table, playerId));
}

export async function closeCrapsTableAction(tableId: unknown): Promise<CrapsResult> {
  return run(tableId, (table, playerId) => closeTable(table, playerId, false));
}
