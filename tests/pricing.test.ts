import { describe, it, expect } from "vitest";
import { explainPrice } from "@/lib/pricing";
import type { MySales } from "@/lib/sales";
import type { Comps } from "@/lib/schema";

const comps: Comps = { query: "q", sampleSize: 16, excluded: 3, low: 3, median: 10, high: 20, listings: [] };
const mine = (prices: number[], familyMedian: number | null = null): MySales => ({
  matches: prices.map((price, i) => ({ title: `t${i}`, brand: "", category: "", size: "", date: "", price, similarity: 90 })),
  matchedMedian: null, familyCount: prices.length, familyMedian, total: 10,
});

describe("explainPrice", () => {
  it("cites her sales first, then the Depop matches", () => {
    expect(explainPrice(mine([13, 15]), comps, [], "Used - Good"))
      .toBe("Your 2 similar sold items went for $13–$15; 16 matching Depop listings ask $3–$20 (median $10), and items usually sell a little under that.");
  });
  it("never mentions sales she doesn't have", () => {
    const s = explainPrice(null, comps, ["light fading on sleeves"], "Used - Good");
    expect(s).not.toMatch(/you|your|sold for/i);
    expect(s).toMatch(/adjusted for light fading on sleeves\.$/);
  });
  it("handles one sale, a typical price only, and nothing at all", () => {
    expect(explainPrice(mine([18]), null, [], "Used - Good")).toBe("You sold a similar one for $18.");
    expect(explainPrice(mine([], 16), null, [], "Like new")).toBe("Your typical sold price for this kind of item is $16 — nudged up for the condition.");
    expect(explainPrice(null, null, [], "Used - Good")).toBe("Estimated from the photos.");
  });
});
