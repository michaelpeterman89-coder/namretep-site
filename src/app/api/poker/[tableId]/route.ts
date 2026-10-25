import { getCurrentPlayer } from "@/lib/auth";
import { getPokerView, runPokerTimeouts } from "@/server/poker";
import { canViewTable, GameError, getPokerTable, isId } from "@/server/tables";

// Background requests from the poker table screen (plain route handlers, so
// they never queue behind the player's own moves; see the blackjack route).

async function respond(tableId: string, tick: boolean) {
  const player = await getCurrentPlayer();
  if (!player) return Response.json({ ok: false, error: "You're not logged in.", view: null }, { status: 401 });
  if (!isId(tableId)) return Response.json({ ok: false, error: "Table not found.", view: null }, { status: 404 });
  const table = await getPokerTable(tableId);
  if (!table || !(await canViewTable(table, player.id))) {
    return Response.json({ ok: false, error: "Table not found.", view: null }, { status: 404 });
  }
  try {
    if (tick) await runPokerTimeouts(table);
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
  }
  const view = await getPokerView((await getPokerTable(tableId)) ?? table, player.id);
  return Response.json({ ok: true, view }, { headers: { "Cache-Control": "no-store" } });
}

/** The table as this player may see it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/poker/[tableId]">) {
  const { tableId } = await ctx.params;
  return respond(tableId, false);
}

/** "A countdown hit zero": let bots act, time out players, or deal the next hand. */
export async function POST(_request: Request, ctx: RouteContext<"/api/poker/[tableId]">) {
  const { tableId } = await ctx.params;
  return respond(tableId, true);
}
