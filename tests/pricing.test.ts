import { describe, it, expect } from "vitest";
import { explainPrice, finalPrice, priceAnchor } from "@/lib/pricing";
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

describe("price anchor", () => {
  const listing = (price: number, similarity = 85) => ({ title: "x", brand: "", size: "L", price, url: `u${price}`, similarity, reason: "" });
  const thin: Comps = { query: "q", sampleSize: 3, excluded: 39, low: 15, median: 25, high: 149, listings: [listing(15), listing(25.18), listing(149)] };

  it("trusts 2+ of her own matching sales first", () => {
    expect(priceAnchor(mine([13, 15]), comps)).toMatchObject({ basis: "mine", anchor: 14 });
  });
  it("uses her typical price over a handful of wide-ranging listings", () => {
    // Real case: 3 listings at $15, $25 and $149 gave a $18–$87 range.
    const a = priceAnchor(mine([], 13), thin);
    expect(a).toMatchObject({ basis: "family", anchor: 13 });
    const p = finalPrice(18, 15, 30, a, "Used - Excellent");
    expect(p.suggested).toBeLessThanOrEqual(16);
    expect(p.high).toBeLessThanOrEqual(16);
    expect(p.low).toBeGreaterThanOrEqual(9);
  });
  it("lets 5+ listings lead when she has no close sales", () => {
    const many: Comps = { ...thin, sampleSize: 6, median: 20, listings: [12, 15, 18, 20, 22, 25].map((x) => listing(x)) };
    expect(priceAnchor(mine([], 13), many).basis).toBe("comps");
  });
  it("falls back to thin listings, then the photos", () => {
    expect(priceAnchor(null, thin).basis).toBe("comps");
    expect(priceAnchor(null, null)).toMatchObject({ basis: "photos", anchor: null });
  });
  it("keeps the suggestion inside its range and between floor and cap", () => {
    const a = priceAnchor(mine([10, 12, 14]), null);
    const p = finalPrice(40, 30, 50, a, "Used - Good");
    expect(p.suggested).toBe(Math.round(12 * 1.2));
    expect(p.low).toBeLessThanOrEqual(p.suggested);
    expect(p.high).toBeGreaterThanOrEqual(p.suggested);
    expect(finalPrice(2, 1, 3, a, "Used - Good").suggested).toBe(Math.round(12 * 0.7));
    expect(finalPrice(2, 1, 3, a, "Used - Fair").suggested).toBe(2);
  });
});
