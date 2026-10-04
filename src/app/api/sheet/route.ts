import { NextRequest, NextResponse } from "next/server";
import { sheetExportUrl } from "@/lib/sheets";

// Reads a Google Sheet the seller has shared "Anyone with the link can view", as
// CSV, so her inventory page can refresh from the sheet she already keeps. Only
// Google Sheets links are accepted — this never fetches arbitrary URLs.
const MAX_BYTES = 2_000_000;

export async function GET(req: NextRequest) {
  const exportUrl = sheetExportUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!exportUrl) return NextResponse.json({ error: "That isn't a Google Sheets link." }, { status: 400 });
  try {
    const res = await fetch(exportUrl, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get("content-type") ?? "";
    // A private sheet redirects to Google's sign-in page (HTML) instead of CSV.
    if (!res.ok || !type.includes("text/csv")) {
      return NextResponse.json(
        { error: "Couldn't read that sheet. In Google Sheets choose Share → General access → “Anyone with the link” (Viewer), or import a downloaded CSV instead." },
        { status: 403 },
      );
    }
    const text = await res.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ error: "That sheet is too large to import." }, { status: 413 });
    return new NextResponse(text, { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Google Sheets didn't respond — try again." }, { status: 502 });
  }
}
