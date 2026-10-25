import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

const SIGNED_IN_ONLY = ["/profile", "/blackjack", "/poker", "/lobby"];
const SIGNED_OUT_ONLY = ["/login", "/signup"];

/**
 * Runs before each page request: refreshes the Supabase login cookie if it's
 * about to expire, and redirects between the auth pages and /profile.
 */
export async function proxy(request: NextRequest) {
  const { url, key } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Don't run code between createServerClient and getClaims: this call is what
  // refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && SIGNED_IN_ONLY.some((p) => pathname.startsWith(p))) {
    return redirectKeepingCookies(request, response, "/login", pathname);
  }
  if (signedIn && SIGNED_OUT_ONLY.some((p) => pathname.startsWith(p))) {
    return redirectKeepingCookies(request, response, "/profile");
  }

  return response;
}

function redirectKeepingCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
  next?: string,
) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = next ? `?next=${encodeURIComponent(next)}` : "";
  const redirect = NextResponse.redirect(target);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Every page except API routes, Next.js internals, and static files.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
