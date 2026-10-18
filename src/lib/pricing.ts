import type { AnalyzeResponse } from "@/lib/schema";
import type { MySales } from "@/lib/sales";

// No runtime imports from comps.ts (it loads Exa): the listing page imports this file.
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const money = (n: number) => `$${Math.round(n)}`;

// One plain sentence on what the price is based on, built from the evidence.
export function explainPrice(
  mine: MySales | null,
  comps: AnalyzeResponse["comps"],
  flaws: string[],
  condition: string,
  manual: number[] = []
): string {
  const parts: string[] = [];
  const m = mine?.matches ?? [];
  if (m.length >= 2) {
    const p = m.map((s) => s.price).sort((a, b) => a - b);
    parts.push(`Your ${m.length} similar sold items went for ${p[0] === p[p.length - 1] ? money(p[0]) : `${money(p[0])}–${money(p[p.length - 1])}`}`);
  } else if (m.length === 1) {
    parts.push(`You sold a similar one for ${money(m[0].price)}`);
  } else if (mine?.familyMedian != null) {
    parts.push(`Your typical sold price for this kind of item is ${money(mine.familyMedian)}`);
  }
  if (manual.length) {
    const p = [...manual].sort((a, b) => a - b);
    parts.push(`the ${p.length} Depop prices you found ask ${money(p[0])}–${money(p[p.length - 1])}`);
  }
  if (comps) parts.push(`${comps.sampleSize} matching Depop listings ask ${money(comps.low)}–${money(comps.high)} (median ${money(comps.median)}), and items usually sell a little under that`);
  let s = parts.join("; ");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!s) return "Estimated from the photos.";
  const note = flaws.length ? `adjusted for ${flaws[0]}` : condition === "Brand new" || condition === "Like new" ? "nudged up for the condition" : "";
  if (note) s += ` — ${note}`;
  return `${s}.`;
}

export type PriceBasis = "mine" | "manual" | "family" | "comps" | "photos";
export const MIN_COMPS_TO_LEAD = 5;

// What the price is anchored on, in order of trust: 2+ of her own matching sales;
// then 2+ Depop prices she looked up by hand (she picked them as true matches, so
// they're handled like her sales); then 5+ matching Depop listings; then her typical price for this kind of item;
// then however many listings there are. A handful of listings can span $15–$149,
// so they only lead when there's nothing of hers to go on.
export function priceAnchor(mine: MySales | null, comps: AnalyzeResponse["comps"], manual: number[] = []) {
  const manualPrices = [...manual].sort((a, b) => a - b);
  const myPrices = (mine?.matches ?? []).map((s) => s.price).sort((a, b) => a - b);
  const compPrices = (comps?.listings ?? []).map((l) => l.price).sort((a, b) => a - b);
  const close = (comps?.listings ?? []).filter((l) => l.similarity >= 85).map((l) => l.price).sort((a, b) => a - b);
  const compsAnchor = comps ? (close.length >= 3 ? quantile(close, 0.5) : comps.median) : null;
  if (myPrices.length >= 2) return { basis: "mine" as PriceBasis, anchor: quantile(myPrices, 0.5), band: myPrices, capMult: 1.2 };
  if (manualPrices.length >= MIN_MANUAL_COMPS) return { basis: "manual" as PriceBasis, anchor: quantile(manualPrices, 0.5), band: manualPrices, capMult: 1.2 };
  if (comps && comps.sampleSize >= MIN_COMPS_TO_LEAD) return { basis: "comps" as PriceBasis, anchor: compsAnchor, band: compPrices, capMult: 1.1 };
  if (mine?.familyMedian != null) return { basis: "family" as PriceBasis, anchor: mine.familyMedian, band: [] as number[], capMult: 1.2 };
  if (comps) return { basis: "comps" as PriceBasis, anchor: compsAnchor, band: compPrices, capMult: 1.1 };
  return { basis: "photos" as PriceBasis, anchor: null, band: [] as number[], capMult: 1 };
}

// Final suggestion and range: the model's number held between a floor and a cap
// around the anchor; the range is the middle half of the evidence (or ±15% of the
// anchor when the evidence is her typical price), always containing the suggestion.
export function finalPrice(modelSuggested: number, modelLow: number, modelHigh: number, a: ReturnType<typeof priceAnchor>, condition: string) {
  const cap = a.anchor != null ? Math.round(a.anchor * a.capMult) : Infinity;
  const floor = a.anchor != null && condition !== "Used - Fair" ? Math.round(a.anchor * 0.7) : 1;
  const suggested = Math.max(floor, 1, Math.min(Math.round(modelSuggested), cap));
  let low: number, high: number;
  if (a.band.length) { low = Math.round(quantile(a.band, 0.25)); high = Math.round(quantile(a.band, 0.75)); }
  else if (a.anchor != null) { low = Math.round(a.anchor * 0.85); high = Math.round(a.anchor * 1.15); }
  else { low = Math.round(modelLow); high = Math.round(modelHigh); }
  return { suggested, low: Math.min(low, suggested), high: Math.max(high, suggested) };
}

// Prices she typed in from her own Depop search ("24, 30, $28.50"): 2–5 positive
// numbers. Anything else gets a plain message and no prices.
export const MIN_MANUAL_COMPS = 2;
export const MAX_MANUAL_COMPS = 5;
export function parseManualComps(text: string): { prices: number[]; error: string | null } {
  // shortcut: commas separate prices, so "1,200" reads as 1 and 200; fine for her price range.
  const tokens = text.split(/[\s,;]+/).map((t) => t.replace(/^\$/, "")).filter(Boolean);
  if (!tokens.length) return { prices: [], error: null };
  if (tokens.length > MAX_MANUAL_COMPS) return { prices: [], error: `Up to ${MAX_MANUAL_COMPS} prices — you have ${tokens.length}.` };
  const prices = tokens.map(Number);
  if (prices.some((p) => !Number.isFinite(p) || p <= 0)) return { prices: [], error: "Prices must be positive numbers, like 24 or 18.50." };
  if (prices.length < MIN_MANUAL_COMPS) return { prices: [], error: `Add at least ${MIN_MANUAL_COMPS} prices.` };
  return { prices, error: null };
}

// Re-price a finished analysis with her hand-found Depop prices, using the same
// anchor, floor, cap and range as the server, from the AI's pre-anchor numbers.
export function repriceWithManual(r: Pick<AnalyzeResponse, "mySales" | "comps" | "visibleFlaws" | "condition" | "modelPrice">, manual: number[]) {
  const a = priceAnchor(r.mySales, r.comps, manual);
  const p = finalPrice(r.modelPrice.suggested, r.modelPrice.low, r.modelPrice.high, a, r.condition);
  return { ...p, basis: a.basis, reasoning: explainPrice(r.mySales, r.comps, r.visibleFlaws, r.condition, manual) };
}
