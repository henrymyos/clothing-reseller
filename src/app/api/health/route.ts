import { generateText } from "ai";
import Exa from "exa-js";
import { NextResponse } from "next/server";
import { withModelFallback } from "@/lib/model";
import { parseDepopResult } from "@/lib/comps";

// End-to-end check for the uptime monitor: can the app still (1) get an answer
// from an AI model, (2) search Depop through Exa, and (3) read Depop's listing
// format? Each failure here would quietly break listings or prices, so the
// monitor opens an issue on a 503. The CDN caches a healthy answer for 12 hours,
// so hourly monitoring costs about two real checks a day.
export const maxDuration = 60;

type Check = { ok: boolean; detail: string };

async function checkAi(): Promise<Check> {
  try {
    let used = "";
    const { text } = await withModelFallback(
      (model, abortSignal) => { used = model; return generateText({ model, abortSignal, maxRetries: 0, prompt: "Reply with the single word OK." }); },
      { timeoutMs: 20_000 },
    );
    return { ok: /ok/i.test(text), detail: `${used}: ${text.trim().slice(0, 20)}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : "AI call failed" };
  }
}

async function checkDepopSearch(): Promise<{ exa: Check; depop: Check }> {
  const key = process.env.EXA_API_KEY;
  if (!key) return { exa: { ok: false, detail: "EXA_API_KEY missing" }, depop: { ok: false, detail: "not checked" } };
  try {
    const res = await new Exa(key).search("gildan hoodie", {
      numResults: 10, includeDomains: ["depop.com"], contents: { text: { maxCharacters: 1200 } },
    });
    const products = (res.results ?? []).filter((r) => /depop\.com\/products\//.test(r.url));
    const parsed = products.filter((r) => parseDepopResult({ url: r.url, title: r.title ?? "", text: "text" in r && typeof r.text === "string" ? r.text : "" }));
    return {
      exa: { ok: products.length > 0, detail: `${products.length} Depop results` },
      depop: { ok: parsed.length > 0, detail: `${parsed.length}/${products.length} listings parsed` },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "Exa search failed";
    return { exa: { ok: false, detail: msg }, depop: { ok: false, detail: "not checked" } };
  }
}

export async function GET() {
  const [ai, search] = await Promise.all([checkAi(), checkDepopSearch()]);
  const checks = { ai, ...search };
  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok, checkedAt: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { "cache-control": ok ? "public, s-maxage=43200, stale-while-revalidate=3600" : "no-store" } },
  );
}
