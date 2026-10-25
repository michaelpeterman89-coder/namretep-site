import { connection } from "next/server";

/**
 * GET /api/health — reports whether the site can reach Supabase.
 * Handy for checking env vars after a deploy.
 */
export async function GET() {
  await connection();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return Response.json({ ok: false, supabase: "missing env vars" }, { status: 500 });
  }

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json({ ok: false, supabase: `responded ${res.status}` }, { status: 502 });
    }
    return Response.json({ ok: true, supabase: "connected" });
  } catch {
    return Response.json({ ok: false, supabase: "unreachable" }, { status: 502 });
  }
}
