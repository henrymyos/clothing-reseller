import { describe, it, expect } from "vitest";
import { analyzeInventory, type InvItem } from "@/lib/inventory";
import { normSize, recommend } from "@/lib/recommend";
import type { Sale } from "@/lib/sales";

// A made-up shop: thermals sell fast and well, jeans sit for weeks.
const item = (o: Partial<InvItem>): InvItem => ({
  sku: "", name: "Item", cost: 3, purchased: "2026-09-01", listed: "2026-09-02", listPrice: 16,
  sold: false, soldDate: "", soldPrice: null, revenue: null, ...o,
});
const items: InvItem[] = [
  ...Array.from({ length: 10 }, (_, i) => item({ sku: `T${i}`, name: "Gray waffle knit thermal", cost: i < 5 ? 2 : 6, sold: true, soldDate: "2026-09-25", soldPrice: 14, revenue: 11.5, listPrice: 16 })),
  ...Array.from({ length: 2 }, (_, i) => item({ sku: `U${i}`, name: "Navy thermal" })),
  ...Array.from({ length: 4 }, (_, i) => item({ sku: `J${i}`, name: "Carpenter jeans", cost: 5, listed: "2026-07-01", sold: true, soldDate: "2026-08-20", soldPrice: 15, revenue: 13.6, listPrice: 15 })),
  ...Array.from({ length: 3 }, (_, i) => item({ sku: `K${i}`, name: "Bootcut jeans", cost: 5, listed: "2026-07-01", listPrice: 15 })),
];
const sales: Sale[] = [
  ...Array.from({ length: 8 }, () => ({ title: "Thermal", brand: "Eddie Bauer", category: "", size: "L", price: 16, date: "2026-09-20" })),
  ...Array.from({ length: 4 }, () => ({ title: "Henley", brand: "Old Navy", category: "", size: "Men's M", price: 13, date: "2026-09-21" })),
  { title: "Jeans", brand: "Lee", category: "", size: '36"', price: 8, date: "2026-09-22" },
  { title: "Tee", brand: "Gap", category: "", size: "XXS", price: 6, date: "2026-09-22" },
];

describe("recommendations", () => {
  const r = analyzeInventory(items, "2026-10-04");
  const recs = recommend(r, sales, "2026-10-04");
  const of = (k: string) => recs.filter((x) => x.kind === k);

  it("says what to buy more of, with a max price that keeps her usual profit", () => {
    expect(of("buy")[0].title).toBe("Buy more thermals & henleys");
    expect(of("buy")[0].detail).toMatch(/pay up to \$\d/);
  });
  it("warns about slow sellers", () => {
    expect(of("skip").map((x) => x.title)).toContain("Be picky with jeans & pants");
  });
  it("reads sizes and brands from her Depop orders", () => {
    expect(of("size")[0].title).toBe("Look for L and M");
    expect(of("brand")[0].detail).toMatch(/Eddie Bauer \(8 sold, ~\$16\)/);
  });
  it("covers boosting, stock pace and stale stock", () => {
    expect(of("boost")).toHaveLength(1);
    expect(of("stock")[0].detail).toMatch(/sold ~5 a week/);
    expect(of("markdown")[0].title).toBe("Mark down 5 slow items"); // 3 jeans + 2 thermals listed 30+ days
  });
  it("stays quiet with too little history", () => {
    expect(recommend(analyzeInventory(items.slice(0, 3), "2026-10-04"), [], "2026-10-04")).toEqual([]);
  });
  it("normalises sizes", () => {
    expect(normSize("Men's M")).toBe("M");
    expect(normSize("xl")).toBe("XL");
    expect(normSize("Large")).toBe("L");
    expect(normSize('36"')).toBe('36"');
    expect(normSize("Women's S")).toBe("S");
    expect(normSize("US 8")).toBe("8");
  });
});
