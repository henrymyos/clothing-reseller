import { NextRequest, NextResponse } from "next/server";

// Remembers *that* she loaded her sheet / Depop sales on this device (never the
// data itself). Safari wipes a site's saved data after 7 days without a visit
// but keeps cookies the server sets, so if the data vanishes the app can tell
// her instead of quietly showing an empty shop.
const COOKIE = "snaplist_saved";
const MAX_AGE = 400 * 24 * 60 * 60; // the longest browsers allow

export function GET(req: NextRequest) {
  const v = req.cookies.get(COOKIE)?.value ?? "";
  return NextResponse.json({ inventory: v.includes("inventory"), sales: v.includes("sales") }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { inventory?: unknown; sales?: unknown };
  const parts = [body.inventory === true && "inventory", body.sales === true && "sales"].filter(Boolean).join(",");
  const res = NextResponse.json({ ok: true });
  if (parts) res.cookies.set(COOKIE, parts, { maxAge: MAX_AGE, httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  else res.cookies.delete(COOKIE);
  return res;
}
