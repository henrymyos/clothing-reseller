import { describe, it, expect } from "vitest";
import { buildDescription, cleanHashtag, profit, shippedWeightOz, formatWeight, formatInches, type ListingDraft } from "@/lib/depop";

const draft = (over: Partial<ListingDraft> = {}): ListingDraft => ({
  headline: "Vintage 90s Carhartt Detroit Jacket Brown XL",
  body: "Faded duck canvas with a blanket lining. Boxy fit.",
  brand: "Carhartt", size: "XL", condition: "Used - Good", material: "100% cotton duck",
  flaws: ["small mark on left cuff"], measurementKind: "top",
  measurements: { pit: "26", length: "28", sleeve: "" }, hashtags: ["#Carhartt", "workwear", "vintage jacket"],
  ...over,
});

describe("buildDescription", () => {
  it("lays out headline, pitch, facts and hashtags in order", () => {
    const d = buildDescription(draft());
    expect(d.split("\n\n")[0]).toBe("Vintage 90s Carhartt Detroit Jacket Brown XL");
    expect(d).toContain("Brand: Carhartt\nSize: XL");
    expect(d).toContain('Measurements (laid flat): Pit to pit 26" · Length 28"');
    expect(d).not.toContain("Sleeve"); // blank measurements are skipped
    expect(d).toContain("Condition: Used - Good — small mark on left cuff (pictured)");
    expect(d).toContain("Material: 100% cotton duck");
    expect(d.trim().endsWith("#carhartt #workwear #vintagejacket")).toBe(true);
  });

  it("omits unknown brand, invisible size, unknown material and empty flaws", () => {
    const d = buildDescription(draft({ brand: "Unbranded", size: "Not visible", material: "Unknown", flaws: ["  "], measurements: {} }));
    expect(d).not.toMatch(/Brand:|Size:|Material:|Measurements/);
    expect(d).toContain("Condition: Used - Good");
    expect(d).not.toContain("pictured");
  });

  it("caps hashtags at 5", () => {
    const d = buildDescription(draft({ hashtags: ["a", "b", "c", "d", "e", "f", "g"] }));
    expect((d.match(/#/g) || []).length).toBe(5);
  });

  it("keeps non-numeric measurements as typed", () => {
    expect(formatInches("22")).toBe('22"');
    expect(formatInches("56 cm")).toBe("56 cm");
  });
});

describe("hashtags", () => {
  it("strips # and punctuation and lowercases", () => {
    expect(cleanHashtag("#Y2K-Vibes!")).toBe("y2kvibes");
    expect(cleanHashtag("###")).toBe("");
  });
});

describe("profit", () => {
  it("applies processing fee only by default", () => {
    const r = profit({ price: 40, cost: 5, boosted: false, sellerPaysShipping: false, shippingCost: 9 });
    expect(r.processing).toBeCloseTo(40 * 0.033 + 0.45, 2);
    expect(r.boost).toBe(0);
    expect(r.shipping).toBe(0);
    expect(r.payout).toBeCloseTo(40 - 1.77, 2);
    expect(r.net).toBeCloseTo(40 - 1.77 - 5, 2);
  });
  it("adds boost and seller-paid shipping", () => {
    const r = profit({ price: 50, cost: 0, boosted: true, sellerPaysShipping: true, shippingCost: 7.5 });
    expect(r.boost).toBe(4);
    expect(r.shipping).toBe(7.5);
    expect(r.payout).toBeCloseTo(50 - (1.65 + 0.45) - 4 - 7.5, 2);
  });
  it("charges nothing on a $0 price", () => {
    expect(profit({ price: 0, cost: 0, boosted: false, sellerPaysShipping: false, shippingCost: 0 }).processing).toBe(0);
  });
});

describe("shipping weight", () => {
  it("adds packaging and formats", () => {
    expect(shippedWeightOz(20)).toBe(23);
    expect(formatWeight(12)).toBe("12 oz");
    expect(formatWeight(23)).toBe("1 lb 7 oz");
  });
});
