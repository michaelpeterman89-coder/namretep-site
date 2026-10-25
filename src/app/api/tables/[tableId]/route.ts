import { getCurrentPlayer } from "@/lib/auth";
import { getTableView, runTimeouts } from "@/server/blackjack";
import { canViewTable, GameError, getTable, isId } from "@/server/tables";

// Background requests from the table screen. These are plain route handlers,
// not server actions, because Next.js runs a page's server actions one at a
// time: live refreshes queued as actions would delay the player's own moves.

async function respond(tableId: string, tick: boolean) {
  const player = await getCurrentPlayer();
  if (!player) return Response.json({ ok: false, error: "You're not logged in.", view: null }, { status: 401 });
  if (!isId(tableId)) return Response.json({ ok: false, error: "Table not found.", view: null }, { status: 404 });
  const table = await getTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) {
    return Response.json({ ok: false, error: "Table not found.", view: null }, { status: 404 });
  }

  try {
    if (tick) await runTimeouts(table);
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
  }
  const view = await getTableView((await getTable(tableId)) ?? table, player.id);
  return Response.json({ ok: true, view }, { headers: { "Cache-Control": "no-store" } });
}

/** The table as this player may see it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/tables/[tableId]">) {
  const { tableId } = await ctx.params;
  return respond(tableId, false);
}

/** "My countdown hit zero": finish timed-out moves (the server checks the clock), then return the table. */
export async function POST(_request: Request, ctx: RouteContext<"/api/tables/[tableId]">) {
  const { tableId } = await ctx.params;
  return respond(tableId, true);
}
