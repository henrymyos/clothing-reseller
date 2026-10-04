import { describe, it, expect } from "vitest";
import {
  analyzeInventory, breakEvenPrice, cleanInventory, importInventory, inventoryToSales, itemGroup,
  mapInventoryColumns, nextSku, parseDate, reportCsv, sheetRow, type InvItem,
} from "@/lib/inventory";
import { DEFAULT_FEES, profit } from "@/lib/depop";

// Shaped like a reseller's tracking sheet (made-up items) pasted from Google Sheets (tab-separated),
// with a derived PROFIT column that's ignored in favour of our own maths.
const SHEET = [
  "SOLD?\tSKU\tNAME\tCOST\tPURCHASE DATE\tLISTING DATE\tLISTING PRICE\tSELLING DATE\tSELLING PRICE\tREVENUE\tPROFIT\tTURNOVER\tOFFER DISCOUNT",
  "TRUE\t0001\tBlue waffle knit thermal\t$2.50\t9/10/2026\t9/12/2026\t$12.00\t9/13/2026\t$12.00\t$8.54\t$5.90\t1\t$0.00",
  "TRUE\t0002\tGray graphic hoodie\t$2.00\t7/26/2026\t9/5/2026\t$26.00\t9/9/2026\t$26.00\t$21.38\t$19.67\t4\t$0.00",
  "TRUE\t0003\tFaded carpenter jeans\t$5.40\t7/20/2026\t7/22/2026\t$14.00\t9/22/2026\t$8.00\t$7.15\t$1.72\t62\t$6.00",
  "TRUE\t0004\tBlack thermal\t$4.00\t9/24/2026\t9/28/2026\t$16.00\t9/29/2026\t$13.50\t\t\t1\t$2.50",
  "FALSE\t0005\tGrey cargo shorts\t$6.40\t7/20/2026\t7/21/2026\t$14.00\t\t\t\t-$6.40\t\t$14.00",
  "FALSE\t0006\tNavy thermal\t$4.00\t9/24/2026\t9/27/2026\t$16.00\t\t\t\t-$4.00\t\t$16.00",
  "FALSE\t0006\tZip up hoodie\t$3.20\t9/26/2026\t\t\t\t\t\t-$3.20\t\t$0.00",
  "FALSE\t\t\t\t\t\t\t\t\t\t\t\t",
].join("\n");

describe("importing her sheet", () => {
  it("maps her column names", () => {
    const c = mapInventoryColumns(SHEET.split("\n")[0].split("\t"))!;
    expect(c).toMatchObject({ sold: 0, sku: 1, name: 2, cost: 3, purchased: 4, listed: 5, listPrice: 6, soldDate: 7, soldPrice: 8, revenue: 9 });
  });
  it("reads pasted rows, sold and unsold", () => {
    const r = importInventory(SHEET);
    if (!("items" in r)) throw new Error(r.error);
    expect(r.items).toHaveLength(7);
    expect(r.skipped).toBe(1); // the blank checkbox row
    expect(r.items[0]).toEqual({
      sku: "0001", name: "Blue waffle knit thermal", cost: 2.5, purchased: "2026-09-10", listed: "2026-09-12",
      listPrice: 12, sold: true, soldDate: "2026-09-13", soldPrice: 12, revenue: 8.54,
    });
    expect(r.items[4]).toMatchObject({ sold: false, soldPrice: null, revenue: null, listPrice: 14 });
  });
  it("also reads a CSV download", () => {
    const csv = 'Name,Cost,Sold price,Sold date\n"Levi\'s jeans, 501",4,20,2026-09-01\nPlain tee,1,,\n';
    const r = importInventory(csv);
    if (!("items" in r)) throw new Error(r.error);
    expect(r.items.map((i) => [i.name, i.sold])).toEqual([["Levi's jeans, 501", true], ["Plain tee", false]]);
  });
  it("explains a sheet it can't use", () => {
    expect(importInventory("Buyer\tAddress\nJane\t1 Main")).toEqual({ error: expect.stringMatching(/name and a cost/) });
  });
  it("parses common date formats", () => {
    expect(parseDate("7/18/2026")).toBe("2026-07-18");
    expect(parseDate("2026-7-8")).toBe("2026-07-08");
    expect(parseDate("10/1/26")).toBe("2026-10-01");
    expect(parseDate("")).toBe("");
  });
  it("cleans what comes back from storage", () => {
    expect(cleanInventory([{ name: "x", cost: 2, sold: "yes" }, { cost: 1 }, null])).toEqual([
      { sku: "", name: "x", cost: 2, purchased: "", listed: "", listPrice: null, sold: false, soldDate: "", soldPrice: null, revenue: null },
    ]);
  });
});

describe("profit report", () => {
  const items = (importInventory(SHEET) as { items: InvItem[] }).items;
  const r = analyzeInventory(items, "2026-10-04");

  it("uses her real payout when the sheet has it", () => {
    const thermal = r.sold.find((i) => i.sku === "0001")!;
    expect(thermal).toMatchObject({ payout: 8.54, payoutEstimated: false, profit: 6.04, daysToSell: 1, offerOff: 0 });
    expect(thermal.roi).toBeCloseTo(2.42, 2);
  });
  it("estimates the payout with Depop fees when it's missing", () => {
    const est = r.sold.find((i) => i.sku === "0004")!;
    const expected = profit({ price: 13.5, cost: 0, boosted: true, sellerPaysShipping: false, shippingCost: 0 }).payout;
    expect(est.payoutEstimated).toBe(true);
    expect(est.payout).toBeCloseTo(expected, 2);
    expect(est.profit).toBeCloseTo(expected - 4, 2);
  });
  it("infers boosted sales from the fee Depop took", () => {
    expect(r.sold.find((i) => i.sku === "0001")!.boosted).toBe(true);   // $3.46 on $12
    expect(r.sold.find((i) => i.sku === "0003")!.boosted).toBe(false);  // $0.85 on $8
  });
  it("totals match the items", () => {
    const t = r.totals;
    expect(t.sold).toBe(4);
    expect(t.unsold).toBe(3);
    expect(t.grossSales).toBe(59.5);
    expect(t.profit).toBeCloseTo(t.payout - t.costOfSold, 2);
    expect(t.cashBack).toBeCloseTo(t.payout - t.totalSpent, 2);
    expect(t.medianDaysToSell).toBe(2.5);
    expect(t.offerShare).toBe(0.5);
  });
  it("groups by kind of item and by sourcing trip", () => {
    const thermals = r.groups.find((g) => g.key === "Thermals & henleys")!;
    expect(thermals).toMatchObject({ sold: 2, unsold: 1 });
    const trip = r.hauls.find((h) => h.date === "2026-07-26")!;
    expect(trip).toMatchObject({ spent: 2, returned: 21.38, paidBack: true });
  });
  it("suggests markdowns for stale stock, never below break-even", () => {
    expect(r.stale.map((s) => s.item.sku)).toEqual(["0005"]); // the only one listed 30+ days
    const s = r.stale[0];
    expect(s.price).toBeLessThan(14);
    expect(s.price).toBeGreaterThanOrEqual(s.item.breakEven!);
  });
  it("flags sheet problems", () => {
    expect(r.issues.join(" ")).toMatch(/SKU 0006 is used for more than one item/);
    expect(r.issues.join(" ")).toMatch(/no listing date or price/);
    expect(r.issues.join(" ")).toMatch(/1 sold item has no payout/);
  });
  it("exports every computed column", () => {
    const csv = reportCsv(r).split("\n");
    expect(csv[0]).toMatch(/^SKU,Name,Group,Sold,Cost/);
    expect(csv).toHaveLength(r.items.length + 2);
  });
});

describe("helpers", () => {
  it("break-even covers cost after fees", () => {
    const p = breakEvenPrice(5, true, DEFAULT_FEES);
    expect(profit({ price: p, cost: 5, boosted: true, sellerPaysShipping: false, shippingCost: 0 }).net).toBeGreaterThanOrEqual(0);
    expect(profit({ price: p - 0.05, cost: 5, boosted: true, sellerPaysShipping: false, shippingCost: 0 }).net).toBeLessThan(0);
  });
  it("groups her kinds of items", () => {
    expect(itemGroup("Shouthouse dark gray Henley waffle knit thermal")).toBe("Thermals & henleys");
    expect(itemGroup("Faded Glory Jean Shorts")).toBe("Shorts");
    expect(itemGroup("Nautica red quarter zip")).toBe("Sweaters & fleece");
    expect(itemGroup("Gap blue crewneck")).toBe("Hoodies & crewnecks");
  });
  it("continues her SKU numbering and builds a pasteable row", () => {
    expect(nextSku([{ sku: "0188" }, { sku: "0189" }, { sku: "" }] as InvItem[])).toBe("0190");
    expect(sheetRow({ sku: "0190", name: "Gap henley", cost: "3.2", listPrice: "16", date: new Date(2026, 9, 4) }))
      .toBe("FALSE\t0190\tGap henley\t3.20\t\t10/4/2026\t16.00");
  });
  it("turns sold items into sales history for pricing", () => {
    const items = (importInventory(SHEET) as { items: InvItem[] }).items;
    const s = inventoryToSales(items);
    expect(s).toHaveLength(4);
    expect(s[0]).toMatchObject({ title: "Blue waffle knit thermal", price: 12, date: "2026-09-13" });
  });
});

describe("Google Sheets links", () => {
  it("turns a share link into its CSV export", async () => {
    const { sheetExportUrl } = await import("@/lib/sheets");
    expect(sheetExportUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456AbCdEfGhI/edit?gid=0#gid=42"))
      .toBe("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456AbCdEfGhI/export?format=csv&gid=42");
    expect(sheetExportUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456AbCdEfGhI/edit"))
      .toMatch(/gid=0$/);
  });
  it("refuses anything else", async () => {
    const { sheetExportUrl } = await import("@/lib/sheets");
    expect(sheetExportUrl("https://evil.example.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/edit")).toBeNull();
    expect(sheetExportUrl("http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/edit")).toBeNull();
    expect(sheetExportUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/edit")).toBeNull();
    expect(sheetExportUrl("not a url")).toBeNull();
  });
});
