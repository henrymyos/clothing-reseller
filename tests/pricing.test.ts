import { describe, it, expect } from "vitest";
import { explainPrice, finalPrice, parseManualComps, priceAnchor, repriceWithManual } from "@/lib/pricing";
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

describe("manual Depop comps", () => {
  it("reads 2–5 positive prices, with or without $ signs", () => {
    expect(parseManualComps("24, 30 $28.50")).toEqual({ prices: [24, 30, 28.5], error: null });
    expect(parseManualComps("  ")).toEqual({ prices: [], error: null });
  });
  it("rejects bad input with a plain message and no prices", () => {
    expect(parseManualComps("24")).toEqual({ prices: [], error: "Add at least 2 prices." });
    expect(parseManualComps("1 2 3 4 5 6").error).toMatch(/Up to 5 prices/);
    for (const bad of ["24, 0", "24, -5", "24, abc", "24, $x"]) {
      expect(parseManualComps(bad).prices).toEqual([]);
      expect(parseManualComps(bad).error).toMatch(/positive numbers/);
    }
  });
  it("leads like her own sales: after 2+ matching sales, before the automatic listings", () => {
    const many: Comps = { ...comps, sampleSize: 6, median: 10 };
    expect(priceAnchor(null, many, [30, 20, 26])).toMatchObject({ basis: "manual", anchor: 26, band: [20, 26, 30], capMult: 1.2 });
    expect(priceAnchor(mine([13, 15]), many, [30, 20])).toMatchObject({ basis: "mine" });
    expect(priceAnchor(mine([], 13), null, [30, 20]).basis).toBe("manual");
    expect(priceAnchor(null, many, [30]).basis).toBe("comps"); // one price isn't enough to lead
  });
  it("re-prices a finished analysis from the AI's own numbers", () => {
    const r = { mySales: null, comps: null, visibleFlaws: [], condition: "Used - Good" as const, modelPrice: { suggested: 40, low: 30, high: 50 } };
    const p = repriceWithManual(r, [20, 24, 28]);
    expect(p).toMatchObject({ basis: "manual", suggested: Math.round(24 * 1.2), low: 22, high: 29 });
    expect(p.reasoning).toBe("The 3 Depop prices you found ask $20–$28.");
    expect(repriceWithManual(r, []).basis).toBe("photos");
  });
  it("cites her prices after her own sales", () => {
    expect(explainPrice(mine([18]), null, [], "Used - Good", [20, 24])).toBe("You sold a similar one for $18; the 2 Depop prices you found ask $20–$24.");
  });
});

describe("rate limit", () => {
  it("allows up to the limit per window, then blocks, then recovers", async () => {
    const { rateLimited } = await import("@/lib/rateLimit");
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimited("1.2.3.4", 3, 1000, t + i)).toBe(false);
    expect(rateLimited("1.2.3.4", 3, 1000, t + 10)).toBe(true);
    expect(rateLimited("5.6.7.8", 3, 1000, t + 10)).toBe(false);
    expect(rateLimited("1.2.3.4", 3, 1000, t + 2000)).toBe(false);
  });
});
