import type { AnalyzeResponse } from "@/lib/schema";
import type { MySales } from "@/lib/sales";

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
