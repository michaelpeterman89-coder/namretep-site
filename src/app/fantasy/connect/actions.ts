"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin, requirePlayer } from "@/lib/auth";
import { YAHOO_STATE_COOKIE } from "@/lib/fantasy/yahoo/cookie";
import { authorizeUrl, newState, redirectUriFor, stateCookieValue } from "@/lib/fantasy/yahoo/oauth";
import { disconnectYahoo, yahooClientId } from "@/server/fantasy/yahoo-connection";

// Server actions are public endpoints: check the caller every time.

const STATE_COOKIE_SECONDS = 10 * 60;

/** Only admins can connect for now. Removing this check is how it opens up to everyone. */
export async function connectYahooAction() {
  const admin = await requireAdmin("/fantasy/connect");
  const redirectUri = redirectUriFor(process.env.VERCEL_ENV);
  if (!redirectUri) redirect("/fantasy/connect");

  // Yahoo returns to the registered address, and cookies only work on the address
  // that set them, so the login has to start there.
  const home = new URL(redirectUri);
  if ((await headers()).get("host") !== home.host) redirect(new URL("/fantasy/connect", home).toString());

  const state = newState();
  (await cookies()).set(YAHOO_STATE_COOKIE, stateCookieValue(state, admin.id), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/yahoo",
    maxAge: STATE_COOKIE_SECONDS,
  });
  redirect(authorizeUrl(yahooClientId(), redirectUri, state));
}

/** Any player can remove their own connection, even if they've since lost admin. */
export async function disconnectYahooAction() {
  const player = await requirePlayer("/fantasy/connect");
  await disconnectYahoo(player.id);
  refresh();
}
