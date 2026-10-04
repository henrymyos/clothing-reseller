import { describe, it, expect } from "vitest";
import { buildDescription, cleanHashtag, enrichHeadline, profit, shippedWeightOz, formatWeight, formatInches, type ListingDraft } from "@/lib/depop";

const draft = (over: Partial<ListingDraft> = {}): ListingDraft => ({
  headline: "Carhartt brown vintage 90s workwear Detroit jacket with blanket lining",
  size: "XL", sku: "0190",
  flaws: ["small mark on left cuff"], measurementKind: "top",
  measurements: { pit: "26", length: "28", sleeve: "" }, hashtags: ["#Carhartt", "workwear", "vintage jacket"],
  ...over,
});

describe("buildDescription", () => {
  it("lays it out like her listings: first line, size, flaws, then SKU and hashtags", () => {
    expect(buildDescription(draft())).toBe(
      "Carhartt brown vintage 90s workwear Detroit jacket with blanket lining\n" +
      "size XL\n" +
      "small mark on left cuff (pictured)\n" +
      'measurements laid flat: pit to pit 26", length 28"\n\n' +
      "0190\n" +
      "#carhartt #workwear #vintagejacket",
    );
  });

  it("has no brand, condition, material or pitch lines", () => {
    const d = buildDescription(draft());
    expect(d).not.toMatch(/Brand:|Condition:|Material:|Used - /);
  });

  it("handles a missing size tag, no flaws, no measurements and no SKU", () => {
    expect(buildDescription(draft({ size: "Not visible", flaws: ["  "], measurements: {}, sku: "" }))).toBe(
      "Carhartt brown vintage 90s workwear Detroit jacket with blanket lining\nsize not tagged — check measurements for accuracy\n\n#carhartt #workwear #vintagejacket",
    );
  });

  it("doesn't double up 'size' or '(pictured)'", () => {
    const d = buildDescription(draft({ size: "size M", flaws: ["stain on front (pictured)"] }));
    expect(d).toContain("size M\nstain on front (pictured)\n");
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
  it("charges processing on item + buyer shipping + tax", () => {
    const r = profit({ price: 40, cost: 5, boosted: false, sellerPaysShipping: false, shippingCost: 9 });
    const proc = (40 * 1.07 + 3.99) * 0.033 + 0.45;
    expect(r.processing).toBeCloseTo(proc, 2);
    expect(r.boost).toBe(0);
    expect(r.shipping).toBe(0);
    expect(r.payout).toBeCloseTo(40 - proc, 2);
    expect(r.net).toBeCloseTo(40 - proc - 5, 2);
  });
  it("matches real Depop payouts", () => {
    // Real Depop receipts: a $28 unboosted sale paid out $26.42; an $18 boosted one $14.61.
    expect(profit({ price: 28, cost: 0, boosted: false, sellerPaysShipping: false, shippingCost: 0 }).payout).toBeCloseTo(26.42, 1);
    expect(profit({ price: 18, cost: 0, boosted: true, sellerPaysShipping: false, shippingCost: 0 }).payout).toBeCloseTo(14.61, 1);
  });
  it("adds boost and seller-paid shipping", () => {
    const r = profit({ price: 50, cost: 0, boosted: true, sellerPaysShipping: true, shippingCost: 7.5 });
    expect(r.boost).toBe(6);
    expect(r.shipping).toBe(7.5);
    expect(r.payout).toBeCloseTo(50 - (50 * 1.07 * 0.033 + 0.45) - 6 - 7.5, 2);
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

describe("enrichHeadline", () => {
  it("adds style words after the colour, like her listings", () => {
    expect(enrichHeadline("Old Navy gray waffle knit thermal long sleeve casual shirt", ["Casual", "Indie", "thermal", "skate", "winter"]))
      .toBe("Old Navy gray indie skater waffle knit thermal long sleeve casual shirt");
  });
  it("leaves a line that already has a colour and enough style words alone", () => {
    const h = "Eddie Bauer gray skater surfer indie waffle knit thermal long sleeve shirt";
    expect(enrichHeadline(h, ["grunge", "y2k"], "Grey")).toBe(h);
  });
  it("adds a missing colour and style words before the garment, not inside a name", () => {
    expect(enrichHeadline("Arizona Desert Classic 1998 graphic tee", ["Casual", "Vintage", "streetwear"], "Navy"))
      .toBe("Arizona Desert Classic 1998 navy casual vintage streetwear graphic tee");
    expect(enrichHeadline("Carhartt carpenter jeans", ["workwear", "denim", "Vintage"], "")).toBe("Carhartt workwear vintage carpenter jeans");
  });
  it("ignores tags that aren't style words", () => {
    expect(enrichHeadline("Plain white tee", ["tee", "cotton"], "White")).toBe("Plain white tee");
  });
});
