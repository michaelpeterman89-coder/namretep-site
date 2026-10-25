"use server";

import { refresh } from "next/cache";
import { getCurrentPlayer, type Player } from "@/lib/auth";
import { formatChips } from "@/lib/chips";
import { validateUsername } from "@/lib/validation";
import { adjustChips, adminCloseTable, renamePlayer, setAdmin, setSuspended } from "@/server/admin";
import { GameError, isId } from "@/server/tables";

// Server actions are public endpoints: check the caller is an admin every
// time, and never trust the form's values.

export type AdminFormState = { error?: string; message?: string };

const MAX_NOTE = 200;

async function asAdmin(run: (admin: Player) => Promise<string>): Promise<AdminFormState> {
  const admin = await getCurrentPlayer();
  if (!admin?.isAdmin) return { error: "Only admins can do that." };
  try {
    const message = await run(admin);
    refresh();
    return { message };
  } catch (e) {
    if (e instanceof GameError) return { error: e.message };
    console.error("Admin action failed", e);
    return { error: "Something went wrong. Please try again." };
  }
}

function playerIdFrom(formData: FormData): string {
  const id = formData.get("playerId");
  if (!isId(id)) throw new GameError("That player doesn't exist.");
  return id;
}

const noteFrom = (formData: FormData) => String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE);

export async function adjustChipsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return asAdmin(async (admin) => {
    const playerId = playerIdFrom(formData);
    const amount = Number(formData.get("amount"));
    if (!Number.isInteger(amount) || amount <= 0) throw new GameError("Enter a whole number of chips.");
    const take = formData.get("direction") === "take";
    const balance = await adjustChips(admin.id, playerId, take ? -amount : amount, noteFrom(formData));
    return `${take ? "Took" : "Gave"} ${formatChips(amount)} chips. New balance: ${formatChips(balance)}.`;
  });
}

export async function renameAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return asAdmin(async (admin) => {
    const playerId = playerIdFrom(formData);
    const username = String(formData.get("username") ?? "").trim();
    const invalid = validateUsername(username);
    if (invalid) throw new GameError(invalid);
    await renamePlayer(admin.id, playerId, username);
    return `Username changed to ${username}.`;
  });
}

export async function setAdminAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return asAdmin(async (admin) => {
    const makeAdmin = formData.get("makeAdmin") === "true";
    await setAdmin(admin.id, playerIdFrom(formData), makeAdmin);
    return makeAdmin ? "They're an admin now." : "They're no longer an admin.";
  });
}

export async function setSuspendedAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return asAdmin(async (admin) => {
    const suspend = formData.get("suspend") === "true";
    await setSuspended(admin.id, playerIdFrom(formData), suspend, noteFrom(formData));
    return suspend ? "Account suspended and removed from its tables." : "Account restored. They can log in again.";
  });
}

export async function closeTableAdminAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return asAdmin(async (admin) => {
    const tableId = formData.get("tableId");
    if (!isId(tableId)) throw new GameError("That table doesn't exist.");
    await adminCloseTable(admin.id, tableId);
    return "Table closed.";
  });
}
