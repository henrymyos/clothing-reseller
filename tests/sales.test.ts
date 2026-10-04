import { describe, it, expect } from "vitest";
import { cleanSales, importSalesCsv, mapColumns, matchMySales, parseCsv, parsePrice, type Sale } from "@/lib/sales";

// Shaped like a marketplace sales export: buyer details and fee columns that must
// never be kept, quoted commas, a $ price, and a title line above the header.
const CSV = `Sales report,,,,,,,,,
Date of sale,Description,Brand,Category,Size,Item price,Shipping price,Depop fee,Buyer,Address
2026-08-02,"Sonoma light gray cardigan, cozy knit",Sonoma,Jumpers,M,$16.00,$5.50,$0.00,Jane Doe,"1 Main St, Phoenix"
2026-08-10,Croft & Barrow mocha brown sweater,Croft & Barrow,Jumpers,L,18.00,$5.50,$0.00,Sam Lee,"2 Oak Ave, Mesa"
2026-08-15,"Levi's 501 jeans ""vintage"" wash",Levi's,Jeans,30x32,$32.00,$6.00,$0.00,Ana Ruiz,"3 Pine Rd, Tempe"
2026-08-20,Old Navy hoodie black,Old Navy,Hoodies,S,$14,$5.50,$0.00,Kim Park,"4 Elm St, Chandler"
2026-08-21,,,,,,,,,
2026-09-01,Gap grey hoodie,Gap,Hoodies,M,$15.00,$5.50,$0.00,Lee Wong,"5 Ash Ct, Gilbert"
2026-09-03,Sonoma cream cardigan,Sonoma,Jumpers,S,$17.00,$5.50,$0.00,Pat Kim,"6 Fir Ln, Mesa"
`;

describe("CSV parsing", () => {
  it("handles quotes, doubled quotes, commas and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
  it("reads prices in common formats", () => {
    expect(parsePrice("$16.00")).toBe(16);
    expect(parsePrice("US$1,250.5")).toBe(1250.5);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("$0.00")).toBeNull();
  });
  it("prefers the item price over shipping/fee/total columns", () => {
    const c = mapColumns(["Date of sale", "Description", "Shipping price", "Depop fee", "Item price", "Total"])!;
    expect(c.price).toBe(4);
    expect(mapColumns(["Description", "Total"])!.price).toBe(1);
    expect(mapColumns(["Buyer", "Address"])).toBeNull();
  });
});

describe("importSalesCsv", () => {
  const r = importSalesCsv(CSV);
  it("finds the header under a title line and keeps only the six safe fields", () => {
    expect("sales" in r).toBe(true);
    if (!("sales" in r)) return;
    expect(r.sales).toHaveLength(6);
    expect(r.skipped).toBe(1);
    expect(Object.keys(r.sales[0]).sort()).toEqual(["brand", "category", "date", "price", "size", "title"]);
    expect(JSON.stringify(r.sales)).not.toMatch(/Jane|Main St|Phoenix|Sam Lee/);
    expect(r.sales[2]).toMatchObject({ title: 'Levi\'s 501 jeans "vintage" wash', price: 32, size: "30x32" });
  });
  it("explains a file it can't use", () => {
    expect(importSalesCsv("Buyer,Address\nJane,1 Main")).toEqual({ error: expect.stringMatching(/description and a price/) });
  });
});

describe("matchMySales", () => {
  const sales = (importSalesCsv(CSV) as { sales: Sale[] }).sales;
  it("finds her sold cardigans by brand for a branded knit", () => {
    const m = matchMySales({ brand: "Sonoma", brandTier: "mainstream", itemType: "Cardigan", distinctiveFeatures: ["cable knit"], searchQuery: "sonoma cardigan" }, sales);
    expect(m.matches.map((s) => s.title)).toEqual(["Sonoma cream cardigan", "Sonoma light gray cardigan, cozy knit"]);
    expect(m.matchedMedian).toBe(17);
    expect(m.familyCount).toBe(3);
    expect(m.familyMedian).toBe(17);
  });
  it("gives a typical price for the garment type even with no exact match", () => {
    const m = matchMySales({ brand: "Hollister", brandTier: "mainstream", itemType: "Hoodie", distinctiveFeatures: [], searchQuery: "hollister hoodie" }, sales);
    expect(m.matches).toHaveLength(0);
    expect(m.familyCount).toBe(2);
    expect(m.familyMedian).toBeNull(); // fewer than 3
  });
  it("cleans whatever the client sends", () => {
    expect(cleanSales([{ title: "x", price: 10, buyer: "Jane" }, { title: "", price: 5 }, { title: "y", price: -1 }, "junk"]))
      .toEqual([{ title: "x", price: 10, brand: "", category: "", size: "", date: "" }]);
  });
});
