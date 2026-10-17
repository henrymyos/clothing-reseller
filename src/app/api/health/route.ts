import { generateText } from "ai";
import Exa from "exa-js";
import { NextResponse } from "next/server";
import { directGeminiEnabled, isDirectModel, withModelFallback } from "@/lib/model";
import { parseDepopResult } from "@/lib/comps";
import { summarizeHealth, type Check } from "@/lib/health";

// End-to-end check for the uptime monitor: can the app still (1) get an answer
// from an AI model (direct Gemini first if the Google key is set, else the gateway),
// (2) search Depop through Exa, and (3) read Depop's listing format? Each failure
// of (1) means no listings, so it's a 503 and the monitor opens an issue. (2) and (3)
// only feed price comps — listings still get written without them — so they come back
// as HTTP 200 with ok:true and degraded:["exa"] (or ["depop"]) instead of an alert.
// The CDN caches a healthy answer for 12 hours (about two real checks a day) and a
// degraded one for an hour (lib/health.ts).
export const maxDuration = 60;

// Which route answered: direct Gemini (free Google key) when GOOGLE_GENERATIVE_AI_API_KEY
// is set, else the Vercel AI Gateway. If the key is set but a gateway model had to
// answer, direct Gemini is failing — the check still passes (listings work) but says so.
async function checkAi(): Promise<Check & { route: "google-direct" | "gateway" | "none"; googleKey: boolean }> {
  const googleKey = directGeminiEnabled();
  try {
    let used = "";
    const { text } = await withModelFallback(
      (model, abortSignal, id) => { used = id; return generateText({ model, abortSignal, maxRetries: 0, prompt: "Reply with the single word OK." }); },
      { timeoutMs: 20_000 },
    );
    const route = isDirectModel(used) ? "google-direct" : "gateway";
    const note = googleKey && route === "gateway" ? " (direct Gemini failed; the AI Gateway backup answered)" : "";
    return { ok: /ok/i.test(text), route, googleKey, detail: `${used}: ${text.trim().slice(0, 20)}${note}` };
  } catch (e) {
    return { ok: false, route: "none", googleKey, detail: e instanceof Error ? e.message.slice(0, 200) : "AI call failed" };
  }
}

async function checkDepopSearch(): Promise<{ exa: Check; depop: Check }> {
  const key = process.env.EXA_API_KEY;
  if (!key) return { exa: { ok: false, detail: "EXA_API_KEY missing" }, depop: { ok: false, skipped: true, detail: "not checked" } };
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
    return { exa: { ok: false, detail: msg }, depop: { ok: false, skipped: true, detail: "not checked" } };
  }
}

export async function GET() {
  const [ai, search] = await Promise.all([checkAi(), checkDepopSearch()]);
  const checks = { ai, ...search };
  const { ok, degraded, status, cacheControl } = summarizeHealth(checks);
  return NextResponse.json(
    { ok, degraded, checkedAt: new Date().toISOString(), checks },
    { status, headers: { "cache-control": cacheControl } },
  );
}
