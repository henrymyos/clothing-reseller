import type { AnalyzeResponse } from "@/lib/schema";
import type { MySales } from "@/lib/sales";
import { quantile } from "@/lib/comps";

const money = (n: number) => `$${Math.round(n)}`;

// One plain sentence on what the price is based on, built from the evidence.
export function explainPrice(
  mine: MySales | null,
  comps: AnalyzeResponse["comps"],
  flaws: string[],
  condition: string
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
  if (comps) parts.push(`${comps.sampleSize} matching Depop listings ask ${money(comps.low)}–${money(comps.high)} (median ${money(comps.median)}), and items usually sell a little under that`);
  let s = parts.join("; ");
  if (!s) return "Estimated from the photos.";
  const note = flaws.length ? `adjusted for ${flaws[0]}` : condition === "Brand new" || condition === "Like new" ? "nudged up for the condition" : "";
  if (note) s += ` — ${note}`;
  return `${s}.`;
}

export type PriceBasis = "mine" | "family" | "comps" | "photos";
export const MIN_COMPS_TO_LEAD = 5;

// What the price is anchored on, in order of trust: 2+ of her own matching sales;
// then 5+ matching Depop listings; then her typical price for this kind of item;
// then however many listings there are. A handful of listings can span $15–$149,
// so they only lead when there's nothing of hers to go on.
export function priceAnchor(mine: MySales | null, comps: AnalyzeResponse["comps"]) {
  const myPrices = (mine?.matches ?? []).map((s) => s.price).sort((a, b) => a - b);
  const compPrices = (comps?.listings ?? []).map((l) => l.price).sort((a, b) => a - b);
  const close = (comps?.listings ?? []).filter((l) => l.similarity >= 85).map((l) => l.price).sort((a, b) => a - b);
  const compsAnchor = comps ? (close.length >= 3 ? quantile(close, 0.5) : comps.median) : null;
  if (myPrices.length >= 2) return { basis: "mine" as PriceBasis, anchor: quantile(myPrices, 0.5), band: myPrices, capMult: 1.2 };
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
