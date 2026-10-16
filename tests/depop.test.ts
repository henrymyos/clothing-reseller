import { describe, it, expect } from "vitest";
import { HASHTAG_BANK, buildDescription, cleanHashtag, enrichHeadline, insertKeywords, overflowKeywords, pickHashtags, rankKeywords, profit, shippedWeightOz, formatWeight, formatInches, type ListingDraft } from "@/lib/depop";

const draft = (over: Partial<ListingDraft> = {}): ListingDraft => ({
  headline: "Carhartt brown vintage 90s workwear Detroit jacket with blanket lining",
  size: "XL",
  flaws: ["small mark on left cuff"], measurementKind: "top",
  measurements: { pit: "26", length: "28", sleeve: "" }, hashtags: ["#Carhartt", "workwear", "vintage jacket"],
  ...over,
});

describe("buildDescription", () => {
  it("lays it out like her listings: first line, size, flaws, then hashtags — no SKU", () => {
    expect(buildDescription(draft())).toBe(
      "Carhartt brown vintage 90s workwear Detroit jacket with blanket lining\n" +
      "size XL\n" +
      "small mark on left cuff (pictured)\n" +
      'measurements laid flat: pit to pit 26", length 28"\n\n' +
      "#carhartt #workwear #vintagejacket",
    );
  });

  it("has no brand, condition, material or pitch lines", () => {
    const d = buildDescription(draft());
    expect(d).not.toMatch(/Brand:|Condition:|Material:|Used - /);
  });

  it("handles a missing size tag, no flaws and no measurements", () => {
    expect(buildDescription(draft({ size: "Not visible", flaws: ["  "], measurements: {} }))).toBe(
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

describe("pickHashtags", () => {
  it("always returns exactly 5, all from her word bank", () => {
    const tags = pickHashtags(["skate", "surf", "waffle", "boxy", "Thermal", "indie", "grunge"]);
    expect(tags).toEqual(["skater", "surfer", "thermal", "indie", "grunge"]);
    expect(tags.every((t) => (HASHTAG_BANK as readonly string[]).includes(t))).toBe(true);
  });
  it("fills from the item's own styles, era and title when the model gives too few", () => {
    expect(pickHashtags(["cableknit"], { styles: ["Preppy"], age: "90s", text: "cream striped cable knit sweater" }))
      .toEqual(["cable", "knit", "preppy", "90s", "striped"]);
  });
  it("falls back to safe defaults rather than fewer than 5", () => {
    expect(pickHashtags([])).toEqual(["casual", "vintage", "indie", "streetwear", "winter"]);
    expect(new Set(pickHashtags(["casual", "casual", "casual"])).size).toBe(5);
  });
});

describe("SEO keywords (every fitting bank word lands in the description)", () => {
  const bank = HASHTAG_BANK as readonly string[];
  // A cream cable-knit sweater the model matched to 7 bank words (plus one off-bank word).
  const sweater = {
    model: ["cable", "knit", "cottagecore", "grandma", "preppy", "chunky", "cozy", "winter"],
    hints: { styles: ["Cottagecore", "Preppy"], age: "Modern", text: "Croft & Barrow cream cottagecore cable knit sweater" },
  };
  const headline = "Croft & Barrow cream cottagecore preppy cable knit sweater";
  // What the analyze route does after the model returns.
  const listing = (h = headline) => {
    const keywords = rankKeywords(sweater.model, sweater.hints);
    const hashtags: string[] = pickHashtags(keywords, sweater.hints);
    return { keywords, hashtags, headline: insertKeywords(h, overflowKeywords(keywords, hashtags, h), "Croft & Barrow") };
  };

  it("ranks all fitting bank words, model's order first, and drops off-bank words", () => {
    expect(listing().keywords).toEqual(["cable", "knit", "cottagecore", "grandma", "preppy", "chunky", "winter"]);
  });

  it("always adds words the item itself implies, even if the model misses them", () => {
    expect(rankKeywords([], { age: "90s", text: "gray striped waffle thermal long sleeve" }))
      .toEqual(["90s", "striped", "thermal", "winter"]);
    expect(rankKeywords(["preppy"], { text: "navy cardigan" })).toEqual(["preppy", "knit"]);
  });

  it("puts the 6th+ matches into the first line after its style words; no extra line", () => {
    const l = listing();
    expect(l.headline).toBe("Croft & Barrow cream cottagecore preppy chunky winter cable knit sweater");
    expect(buildDescription({ headline: l.headline, size: "L", flaws: ["light pilling on sleeve"], measurementKind: "top", measurements: {}, hashtags: l.hashtags })).toBe(
      "Croft & Barrow cream cottagecore preppy chunky winter cable knit sweater\n" +
      "size L\n" +
      "light pilling on sleeve (pictured)\n\n" +
      "#cable #knit #cottagecore #grandma #preppy",
    );
  });

  it("every fitting bank word appears, no extra duplicates a hashtag, only bank words are added", () => {
    const l = listing();
    const first = l.headline.split(" ");
    const added = first.filter((w) => !headline.split(" ").includes(w));
    for (const k of l.keywords) expect(l.hashtags.includes(k) || first.includes(k)).toBe(true);
    expect(added.filter((w) => l.hashtags.includes(w))).toEqual([]);
    expect(new Set(first).size).toBe(first.length);
    expect([...l.hashtags, ...added].every((w) => bank.includes(w))).toBe(true);
    expect(l.hashtags).toHaveLength(5);
  });

  it("works whatever first line the model wrote", () => {
    // style words further along: after the last one before the item words
    expect(insertKeywords("Volcom vintage 2007 dark gray y2k skater concert graphic polo shirt", ["grunge", "surfer"], "Volcom"))
      .toBe("Volcom vintage 2007 dark gray y2k skater grunge surfer concert graphic polo shirt");
    // no style words: after brand + colour
    expect(insertKeywords("Croft & Barrow cream cable knit sweater", ["chunky", "winter"], "Croft & Barrow"))
      .toBe("Croft & Barrow cream chunky winter cable knit sweater");
    // no style words, no brand at the start: before the item words
    expect(insertKeywords("cream cable knit sweater", ["chunky"], "Unbranded")).toBe("cream chunky cable knit sweater");
    // nothing to add, or already there
    expect(insertKeywords(headline, [], "Croft & Barrow")).toBe(headline);
    expect(insertKeywords(headline, ["preppy", "Preppy"], "Croft & Barrow")).toBe(headline);
  });

  it("caps the first line around 22 words, keeping the highest-ranked extras", () => {
    const long = "Brand cream indie skater grunge oversized boxy heavyweight crewneck sweatshirt with big front graphic and ribbed cuffs and hem";
    const out = insertKeywords(long, ["winter", "streetwear", "baggy", "retro", "casual"], "Brand").split(" ");
    expect(out).toHaveLength(22);
    expect(out).toContain("winter");
    expect(out).not.toContain("casual");
  });

  it("no change when 5 or fewer words fit", () => {
    const keywords = rankKeywords(["thermal", "indie"]);
    const h = "Old Navy gray indie waffle knit thermal";
    expect(insertKeywords(h, overflowKeywords(keywords, pickHashtags(keywords), h), "Old Navy")).toBe(h);
  });
});
