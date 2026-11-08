import { cookies } from "next/headers";
import { connection, NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer } from "@/lib/auth";
import { YAHOO_STATE_COOKIE } from "@/lib/fantasy/yahoo/cookie";
import { redirectUriFor, stateIsValid } from "@/lib/fantasy/yahoo/oauth";
import { connectWithCode } from "@/server/fantasy/yahoo-connection";

/**
 * GET /api/yahoo/callback — where Yahoo sends the player after they approve or
 * decline. The proxy skips /api, so this checks the login itself.
 */
export async function GET(request: NextRequest) {
  await connection();

  const redirectUri = redirectUriFor(process.env.VERCEL_ENV);
  if (!redirectUri) return new Response("Not found", { status: 404 });

  const back = (path: string) => NextResponse.redirect(new URL(path, redirectUri));
  const result = (code: string) => back(`/fantasy/connect?yahoo=${code}`);

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(YAHOO_STATE_COOKIE)?.value;
  cookieStore.delete({ name: YAHOO_STATE_COOKIE, path: "/api/yahoo" });

  const player = await getCurrentPlayer();
  if (!player) return back(`/login?next=${encodeURIComponent("/fantasy/connect")}`);
  if (!player.isAdmin) return new Response("Not found", { status: 404 });

  const { searchParams } = request.nextUrl;
  if (!stateIsValid(stateCookie, searchParams.get("state"), player.id)) return result("expired");
  if (searchParams.get("error")) return result("declined");

  const code = searchParams.get("code");
  if (!code) return result("failed");

  try {
    await connectWithCode(player.id, code, redirectUri);
  } catch (e) {
    console.error("Yahoo connection failed", e);
    return result("failed");
  }
  return result("connected");
}
