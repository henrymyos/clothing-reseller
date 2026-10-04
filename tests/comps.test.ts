import { describe, it, expect } from "vitest";
import {
  brandMatches, designMatch, designWords, garmentFamily, needsBrandMatch, parseDepopResult, selectComps,
  similarityFor, trimOutliers, MIN_SIMILARITY, type ParsedListing,
} from "@/lib/comps";

// Real structured lines captured from Depop search results.
const R = (url: string, text: string, title = "x | Depop") => ({ url, title, text });

describe("parseDepopResult", () => {
  it("reads brand, department, type, discounted price, size and condition", () => {
    const p = parseDepopResult(R("u1", "Grey hoodie, barely worn # Gildan Men's Grey Hoodie 10% off $16.20 $18.00 Size L Good condition This seller often ships in 3 days Grey", "Gildan grey hoodie | Depop"))!;
    expect(p).toMatchObject({ brand: "Gildan", department: "Men's", type: "Hoodie", family: "hoodie", price: 16.2, size: "L", condition: "Good", title: "Gildan grey hoodie" });
  });
  it("handles no brand, multi-colour, and the discount shown after the price", () => {
    expect(parseDepopResult(R("u2", "# Men's Black Sweatshirt $9.99 Size L Brand new This seller"))).toMatchObject({ brand: "", type: "Sweatshirt", family: "hoodie", price: 9.99, condition: "Brand new" });
    expect(parseDepopResult(R("u3", "# Levi's Men's Blue and Navy Jeans 50% off $15.00 $30.00 Size 28\" Good condition"))).toMatchObject({ brand: "Levi's", type: "Jeans", family: "jeans", price: 15, size: '28"' });
    expect(parseDepopResult(R("u4", "# Brandy Melville Women's Grey Vest $10.00 $15.00 33% off Size S Good condition"))).toMatchObject({ brand: "Brandy Melville", family: "top", price: 10, size: "S" });
    expect(parseDepopResult(R("u5", "# Brandy Melville Women's Yellow and Cream Vest 20% off $8.00 $10.00 One size Excellent condition"))).toMatchObject({ price: 8, size: "One size", condition: "Excellent" });
    expect(parseDepopResult(R("u6", "# Nike Men's Navy Joggers-tracksuits $28.00 Size M Excellent condition"))).toMatchObject({ family: "trousers" });
  });
  it("skips UK (£) listings and pages with no price line", () => {
    expect(parseDepopResult(R("u7", "# Carhartt Men's Jacket 10% off £80.99 £89.99 Size S Excellent condition"))).toBeNull();
    expect(parseDepopResult(R("u8", "# More from this seller Loading… Loading… Loading…"))).toBeNull();
  });
});

describe("garment families", () => {
  it("groups near-identical garments and separates others", () => {
    expect(garmentFamily("Hoodie")).toBe(garmentFamily("Crewneck Sweatshirt"));
    expect(garmentFamily("Zip up hoodie")).toBe("hoodie");
    expect(garmentFamily("T-shirt")).toBe("tee");
    expect(garmentFamily("Denim jacket")).toBe("jacket");
    expect(garmentFamily("Puffer gilet")).toBe("jacket");
    expect(garmentFamily("Midi dress")).toBe("dress");
  });
  it("treats waffle-knit thermals and henleys as long-sleeve tees, not sweaters", () => {
    expect(garmentFamily("Eddie Bauer gray henley waffle knit thermal long sleeve")).toBe("tee");
    expect(garmentFamily("Henley long sleeve shirt")).toBe("tee");
    expect(garmentFamily("Chunky cable knit sweater")).toBe("knit");
    expect(garmentFamily("Thermal lined hoodie")).toBe("hoodie");
  });
});

describe("brand matching", () => {
  it("normalises and allows containment", () => {
    expect(brandMatches("Carhartt", "Carhartt WIP")).toBe(true);
    expect(brandMatches("Levi's", "levis")).toBe(true);
    expect(brandMatches("Abercrombie & Fitch", "abercrombie and fitch")).toBe(true);
    expect(brandMatches("Nike", "Adidas")).toBe(false);
    expect(brandMatches("Nike", "")).toBe(false);
  });
  it("only real brands require a match", () => {
    expect(needsBrandMatch({ brand: "Carhartt", brandTier: "mainstream" })).toBe(true);
    expect(needsBrandMatch({ brand: "Gildan", brandTier: "blank" })).toBe(false);
    expect(needsBrandMatch({ brand: "Unknown", brandTier: "mainstream" })).toBe(false);
  });
});

const gildan = { brand: "Gildan", brandTier: "blank" as const, itemType: "Hoodie", distinctiveFeatures: ["Japanese text graphic", '"Vaccinated" text'], searchQuery: "gildan japanese vaccinated graphic hoodie" };
const carhartt = { brand: "Carhartt", brandTier: "mainstream" as const, itemType: "Detroit jacket", distinctiveFeatures: ["blanket lined", "corduroy collar"], searchQuery: "carhartt detroit jacket brown" };

describe("design matching", () => {
  it("uses only distinctive words, and needs two in common", () => {
    expect(designWords(gildan).sort()).toEqual(["japanese", "vaccinated"]);
    expect(designMatch(designWords(gildan), "japanese brand black retro letter print hoodie")).toBe("different"); // the original bug
    expect(designMatch(designWords(gildan), "vaccinated hoodie japanese covid")).toBe("same");
    expect(designMatch(designWords(carhartt), "carhartt detroit blanket lined jacket")).toBe("similar");
  });
});

const P = (url: string, price: number, brand: string, family: string, text = ""): ParsedListing =>
  ({ url, price, brand, family, title: url, department: "Men's", type: family, size: null, condition: null, text });

describe("similarity rules", () => {
  it("kids' listings only count for kids' items", () => {
    const kidsJacket = { ...P("k", 52, "Carhartt", "jacket"), department: "Boys'" };
    expect(similarityFor(carhartt, kidsJacket, "same")).toBeLessThan(MIN_SIMILARITY);
    expect(similarityFor({ ...carhartt, department: "Kids" }, kidsJacket, "same")).toBe(95);
  });
  it("Depop's own type beats the title (shorts stay shorts)", () => {
    expect(parseDepopResult(R("s1", "# Carhartt Men's Brown Shorts $6.30 Size 32 Good condition", "Carhartt brown cargo shorts | Depop"))!.family).toBe("shorts");
  });
  it("a different garment family never qualifies", () => {
    expect(similarityFor(carhartt, P("a", 1, "Carhartt", "trousers"), "same")).toBeLessThan(MIN_SIMILARITY);
  });
  it("real brands: other brands never qualify, same brand always does", () => {
    expect(similarityFor(carhartt, P("a", 1, "Japanese Brand", "jacket"), "same")).toBeLessThan(MIN_SIMILARITY);
    expect(similarityFor(carhartt, P("a", 1, "Carhartt WIP", "jacket"), "different")).toBe(75);
  });
  it("blanks: design decides; same blank maker is the baseline", () => {
    expect(similarityFor(gildan, P("a", 1, "Hanes", "hoodie"), "similar")).toBe(85);
    expect(similarityFor(gildan, P("a", 1, "Gildan", "hoodie"), "different")).toBe(72);
    expect(similarityFor(gildan, P("a", 1, "Anti Social Social Club", "hoodie"), "different")).toBeLessThan(MIN_SIMILARITY);
  });
});

describe("outliers", () => {
  it("trims prices outside 1.5×IQR once there are 5+", () => {
    const items = [20, 22, 24, 25, 26, 28, 157].map((p) => ({ price: p }));
    expect(trimOutliers(items).map((i) => i.price)).toEqual([20, 22, 24, 25, 26, 28]);
    expect(trimOutliers(items.slice(0, 4))).toHaveLength(4);
  });
});

describe("selectComps", () => {
  it("the original Gildan case: catch-all 'Japanese Brand' and hype pieces are left out", () => {
    const ls = [
      P("a", 13, "Gildan", "hoodie", "nurse graphic hoodie"), P("b", 25, "Gildan", "hoodie", "black hoodie bold front text"),
      P("c", 18, "Hanes", "hoodie", "vaccinated japanese hoodie"),
      P("d", 121, "Japanese Brand", "hoodie", "japanese brand skull hoodie"), P("e", 157, "Anti Social Social Club", "hoodie", "assc japan hoodie"),
      P("f", 60, "Abercrombie & Fitch", "hoodie", "00s zip hoodie"), P("g", 9, "Gildan", "tee", "gildan tee"),
    ];
    const c = selectComps(gildan, ls, "q")!;
    expect(c.listings.map((l) => l.url).sort()).toEqual(["a", "b", "c"]);
    expect(c.high).toBe(25);
    expect(c.excluded).toBe(4);
  });

  it("keeps only same-brand jackets for a real brand, and dedupes", () => {
    const ls = [P("a", 40, "Carhartt", "jacket"), P("a", 40, "Carhartt", "jacket"), P("b", 45, "Carhartt WIP", "jacket"), P("c", 38, "carhartt", "jacket"), P("d", 130, "Japanese Brand", "jacket")];
    const c = selectComps(carhartt, ls, "q")!;
    expect(c.listings.map((l) => l.url).sort()).toEqual(["a", "b", "c"]);
    expect(c.median).toBe(40);
  });

  it("returns null with fewer than 3 matches", () => {
    expect(selectComps(carhartt, [P("a", 20, "Carhartt", "jacket"), P("b", 22, "Nike", "jacket")], "q")).toBeNull();
  });
});

describe("page widgets", () => {
  it("ignores headings that aren't the product line", () => {
    expect(parseDepopResult(R("w1", "# Similar items Levi's 25\" $19.00 Size 25"))).toBeNull();
    expect(parseDepopResult(R("w2", "# Layer up for less Explore cardigans under $30"))).toBeNull();
  });
});
