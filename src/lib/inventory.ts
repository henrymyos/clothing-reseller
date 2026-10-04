// Her inventory sheet — every item she's bought, with what she paid, when it was
// listed and (once sold) what it sold for. Imported as CSV or pasted straight from
// Google Sheets; parsed and kept in the browser only. From it: profit per item,
// how fast things sell, which kinds of items and which sourcing trips pay best,
// and what to do about stock that isn't moving.

import { DEFAULT_FEES, profit, type Fees } from "@/lib/depop";
import { parseCsv, parsePrice, type Sale } from "@/lib/sales";
import { median, quantile } from "@/lib/comps";

export type InvItem = {
  sku: string;
  name: string;
  cost: number;
  purchased: string;       // ISO dates, "" when blank
  listed: string;
  listPrice: number | null;
  sold: boolean;
  soldDate: string;
  soldPrice: number | null;
  revenue: number | null;  // what Depop actually paid out, when the sheet has it
};

export const MAX_ITEMS = 5000;

// ---------- parsing ----------

// "7/18/2026", "2026-07-18", "7/18/26" → "2026-07-18".
export function parseDate(v: string): string {
  const s = (v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return "";
}

const money = (v: string): number | null => {
  const s = (v || "").trim();
  if (!s || /^-/.test(s)) return null;
  return parsePrice(s);
};

type Cols = Record<"sold" | "sku" | "name" | "cost" | "purchased" | "listed" | "listPrice" | "soldDate" | "soldPrice" | "revenue", number>;

export function mapInventoryColumns(header: string[]): Cols | null {
  const h = header.map((x) => x.trim().toLowerCase().replace(/\s+/g, " "));
  const used = new Set<number>();
  const find = (...tests: RegExp[]) => {
    for (const t of tests) {
      const i = h.findIndex((x, j) => !used.has(j) && t.test(x));
      if (i >= 0) { used.add(i); return i; }
    }
    return -1;
  };
  // Order matters: the specific "listing price"/"selling price" columns are claimed
  // before the generic ones, so "price" never steals the wrong column.
  const c = {
    soldDate: find(/^(selling|sold|sale) date$/, /^date sold$/, /^sold on$/),
    purchased: find(/^(purchase|purchased|bought|buy) date$/, /^date (purchased|bought)$/),
    listed: find(/^(listing|listed|list) date$/, /^date listed$/),
    listPrice: find(/^(listing|listed|list|asking) price$/),
    soldPrice: find(/^(selling|sold|sale) price$/, /^sold for$/),
    revenue: find(/^(revenue|payout|net|received|earnings|take home)/),
    cost: find(/^(cost|paid|purchase price|buy price|cost price|cogs)/),
    sold: find(/^sold\??$/, /^status$/),
    sku: find(/^(sku|id|item #|item number|#)$/),
    name: find(/^(name|item|item name|title|description|product)$/, /name|title|description/),
  };
  if (c.name < 0 || c.cost < 0) return null;
  return c;
}

export function importInventory(text: string): { items: InvItem[]; skipped: number } | { error: string } {
  // Pasted from Google Sheets → tab-separated; a downloaded file → CSV.
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const rows = firstLine.includes("\t")
    ? text.split(/\r?\n/).map((l) => l.split("\t")).filter((r) => r.some((f) => f.trim()))
    : parseCsv(text);
  if (rows.length < 2) return { error: "That sheet has no rows." };
  let headerAt = -1, cols: Cols | null = null;
  for (let i = 0; i < Math.min(rows.length, 6) && !cols; i++) {
    cols = mapInventoryColumns(rows[i]);
    if (cols) headerAt = i;
  }
  if (!cols) return { error: "Couldn't find an item name and a cost column in that sheet." };
  const c = cols;
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const items: InvItem[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerAt + 1)) {
    const name = get(r, c.name).replace(/\s+/g, " ").slice(0, 200);
    const cost = money(get(r, c.cost)) ?? (get(r, c.cost) ? 0 : null);
    if (!name || cost == null) { skipped++; continue; }
    const soldPrice = money(get(r, c.soldPrice));
    const soldDate = parseDate(get(r, c.soldDate));
    const flag = get(r, c.sold).toLowerCase();
    const sold = c.sold >= 0 && flag
      ? /^(true|yes|y|x|✓|✔|sold|1)$/.test(flag) && soldPrice != null
      : soldPrice != null && !!soldDate;
    items.push({
      sku: get(r, c.sku).slice(0, 20),
      name,
      cost,
      purchased: parseDate(get(r, c.purchased)),
      listed: parseDate(get(r, c.listed)),
      listPrice: money(get(r, c.listPrice)),
      sold,
      soldDate: sold ? soldDate : "",
      soldPrice: sold ? soldPrice : null,
      revenue: sold ? money(get(r, c.revenue)) : null,
    });
  }
  if (!items.length) return { error: "No items with a name and cost were found in that sheet." };
  return { items: items.slice(0, MAX_ITEMS), skipped };
}

// Defensive check on anything read back from storage.
export function cleanInventory(x: unknown): InvItem[] {
  if (!Array.isArray(x)) return [];
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return x.slice(0, MAX_ITEMS).flatMap((o): InvItem[] => {
    if (!o || typeof o !== "object") return [];
    const r = o as Record<string, unknown>;
    const name = str(r.name, 200);
    if (!name) return [];
    return [{
      sku: str(r.sku, 20), name, cost: Math.max(0, num(r.cost) ?? 0),
      purchased: str(r.purchased, 10), listed: str(r.listed, 10), listPrice: num(r.listPrice),
      sold: r.sold === true, soldDate: str(r.soldDate, 10), soldPrice: num(r.soldPrice), revenue: num(r.revenue),
    }];
  });
}

// ---------- analysis ----------

const DAY = 86_400_000;
export const daysBetween = (a: string, b: string): number | null =>
  a && b ? Math.round((Date.parse(b) - Date.parse(a)) / DAY) : null;
const r2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const med = (xs: number[]) => (xs.length ? median([...xs].sort((a, b) => a - b)) : null);

// Her shop in plain groups. Thermals/henleys are split out because they're most of it.
export function itemGroup(name: string): string {
  const t = name.toLowerCase();
  if (/thermal|henley|waffle/.test(t)) return "Thermals & henleys";
  if (/hoodie|crewneck|sweatshirt/.test(t)) return "Hoodies & crewnecks";
  if (/quarter zip|sweater|cardigan|knit|fleece|vest/.test(t)) return "Sweaters & fleece";
  if (/shorts/.test(t)) return "Shorts";
  if (/jean|pants|trousers|joggers|cargos?$/.test(t)) return "Jeans & pants";
  if (/polo|shirt|tee|tank|top|long sleeve|jersey/.test(t)) return "Shirts & tees";
  return "Other";
}

export type ItemCalc = InvItem & {
  group: string;
  payout: number | null;     // actual (sheet) or estimated Depop payout
  payoutEstimated: boolean;
  profit: number | null;     // payout − cost (sold items)
  roi: number | null;        // profit ÷ cost
  daysToSell: number | null; // listed → sold
  offerOff: number | null;   // list − sold price
  boosted: boolean | null;   // inferred from the fee Depop took
  // unsold
  ageDays: number | null;    // days since listed
  projected: number | null;  // profit if it sells at its list price
  breakEven: number | null;  // lowest price that still covers its cost
};

export type Settings = { fees: Fees; assumeBoosted: boolean; staleDays: number };
export const DEFAULT_SETTINGS: Settings = { fees: DEFAULT_FEES, assumeBoosted: true, staleDays: 30 };

const payoutAt = (price: number, boosted: boolean, fees: Fees) =>
  profit({ price, cost: 0, boosted, sellerPaysShipping: false, shippingCost: 0, fees }).payout;

// Lowest whole-dollar-ish price (to the cent) whose payout covers the cost.
export function breakEvenPrice(cost: number, boosted: boolean, fees: Fees): number {
  let lo = 0, hi = Math.max(5, cost * 3 + 10);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (payoutAt(mid, boosted, fees) >= cost) hi = mid; else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}

export function calcItem(it: InvItem, today: string, s: Settings): ItemCalc {
  const group = itemGroup(it.name);
  if (it.sold && it.soldPrice != null) {
    const est = payoutAt(it.soldPrice, s.assumeBoosted, s.fees);
    const payout = it.revenue ?? est;
    const p = payout - it.cost;
    // The fee Depop took tells us whether it was boosted: unboosted fees are ~5–8% of a small sale.
    const boosted = it.revenue != null ? (it.soldPrice - it.revenue) - (it.soldPrice - payoutAt(it.soldPrice, false, s.fees)) > it.soldPrice * 0.06 : null;
    return {
      ...it, group, payout: r2(payout), payoutEstimated: it.revenue == null, profit: r2(p),
      roi: it.cost > 0 ? r2(p / it.cost) : null, daysToSell: daysBetween(it.listed, it.soldDate),
      offerOff: it.listPrice != null ? r2(it.listPrice - it.soldPrice) : null, boosted,
      ageDays: null, projected: null, breakEven: null,
    };
  }
  const projected = it.listPrice != null ? r2(payoutAt(it.listPrice, s.assumeBoosted, s.fees) - it.cost) : null;
  return {
    ...it, group, payout: null, payoutEstimated: false, profit: null, roi: null, daysToSell: null, offerOff: null, boosted: null,
    ageDays: it.listed ? daysBetween(it.listed, today) : null, projected,
    breakEven: breakEvenPrice(it.cost, s.assumeBoosted, s.fees),
  };
}

export type GroupStat = {
  key: string; sold: number; unsold: number; sellThrough: number;
  avgSale: number | null; avgProfit: number | null; avgRoi: number | null; medianDays: number | null; totalProfit: number;
};

function groupStats(items: ItemCalc[], keyOf: (i: ItemCalc) => string): GroupStat[] {
  const by = new Map<string, ItemCalc[]>();
  for (const i of items) by.set(keyOf(i), [...(by.get(keyOf(i)) ?? []), i]);
  return [...by].map(([key, xs]) => {
    const sold = xs.filter((x) => x.sold);
    const unsold = xs.length - sold.length;
    return {
      key, sold: sold.length, unsold, sellThrough: xs.length ? sold.length / xs.length : 0,
      avgSale: avg(sold.map((x) => x.soldPrice!)), avgProfit: avg(sold.map((x) => x.profit!)),
      avgRoi: avg(sold.filter((x) => x.roi != null).map((x) => x.roi!)),
      medianDays: med(sold.filter((x) => x.daysToSell != null).map((x) => x.daysToSell!)),
      totalProfit: r2(sold.reduce((s, x) => s + x.profit!, 0)),
    };
  });
}

export type Haul = GroupStat & { date: string; spent: number; returned: number; paidBack: boolean };
export type Suggestion = { item: ItemCalc; price: number; reason: string };

export type Report = {
  items: ItemCalc[];
  sold: ItemCalc[];
  unsold: ItemCalc[];
  totals: {
    items: number; sold: number; unsold: number; sellThrough: number;
    grossSales: number; payout: number; fees: number; costOfSold: number; profit: number;
    totalSpent: number; cashBack: number;     // payouts − everything ever bought
    unsoldCost: number; unsoldPotential: number;
    avgProfit: number | null; medianProfit: number | null; avgRoi: number | null;
    medianDaysToSell: number | null; soldWithin7: number;
    offerShare: number; avgOfferOff: number | null;
    boostedShare: number | null; boostFees: number | null;
    estimatedPayouts: number;
  };
  months: { month: string; sold: number; sales: number; profit: number; spent: number }[];
  groups: GroupStat[];
  hauls: Haul[];
  best: ItemCalc[];
  worst: ItemCalc[];
  stale: Suggestion[];
  issues: string[];
};

export function analyzeInventory(raw: InvItem[], today: string, s: Settings = DEFAULT_SETTINGS): Report {
  const items = raw.map((i) => calcItem(i, today, s));
  const sold = items.filter((i) => i.sold);
  const unsold = items.filter((i) => !i.sold);
  const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
  const grossSales = sum(sold.map((i) => i.soldPrice!));
  const payout = sum(sold.map((i) => i.payout!));
  const costOfSold = sum(sold.map((i) => i.cost));
  const totalSpent = sum(items.map((i) => i.cost));
  const withRev = sold.filter((i) => i.boosted != null);
  const boostedSold = withRev.filter((i) => i.boosted);
  const offered = sold.filter((i) => (i.offerOff ?? 0) > 0);
  const days = sold.filter((i) => i.daysToSell != null).map((i) => i.daysToSell!);

  // By month sold (profit) and month bought (spend).
  const monthMap = new Map<string, { month: string; sold: number; sales: number; profit: number; spent: number }>();
  const mOf = (m: string) => monthMap.get(m) ?? monthMap.set(m, { month: m, sold: 0, sales: 0, profit: 0, spent: 0 }).get(m)!;
  for (const i of sold) if (i.soldDate) { const m = mOf(i.soldDate.slice(0, 7)); m.sold++; m.sales = r2(m.sales + i.soldPrice!); m.profit = r2(m.profit + i.profit!); }
  for (const i of items) if (i.purchased) { const m = mOf(i.purchased.slice(0, 7)); m.spent = r2(m.spent + i.cost); }
  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // Sourcing trips: everything bought on the same day.
  const hauls: Haul[] = groupStats(items.filter((i) => i.purchased), (i) => i.purchased).map((g) => {
    const xs = items.filter((i) => i.purchased === g.key);
    const spent = sum(xs.map((i) => i.cost));
    const returned = sum(xs.filter((i) => i.sold).map((i) => i.payout!));
    return { ...g, date: g.key, spent, returned, paidBack: returned >= spent };
  }).sort((a, b) => b.date.localeCompare(a.date));

  // What usually sells, per group, to suggest markdowns for stale stock.
  const groupSold = new Map<string, number[]>();
  for (const i of sold) groupSold.set(i.group, [...(groupSold.get(i.group) ?? []), i.soldPrice!]);
  const stale: Suggestion[] = unsold
    .filter((i) => (i.ageDays ?? 0) >= s.staleDays && i.listPrice != null)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
    .map((item) => {
      const prices = [...(groupSold.get(item.group) ?? [])].sort((a, b) => a - b);
      const typical = prices.length >= 3 ? Math.round(quantile(prices, 0.5)) : null;
      const floor = Math.ceil(item.breakEven! + 1);
      let price = Math.round(item.listPrice! * 0.85);
      let reason = `listed ${item.ageDays} days`;
      if (typical != null && item.listPrice! > typical) {
        price = typical;
        reason += `; your ${item.group.toLowerCase()} usually sell for ~$${typical}`;
      } else reason += "; a 15% drop to get it moving";
      if (price < floor) { price = floor; reason += ` (kept above break-even $${item.breakEven!.toFixed(2)})`; }
      if (price >= item.listPrice!) { price = item.listPrice!; reason = `listed ${item.ageDays} days and already near break-even — try a re-list or bundle instead of a price cut`; }
      return { item, price, reason };
    });

  const issues: string[] = [];
  const skus = new Map<string, number>();
  for (const i of items) if (i.sku) skus.set(i.sku, (skus.get(i.sku) ?? 0) + 1);
  const dupes = [...skus].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupes.length) issues.push(`SKU ${dupes.join(", ")} is used for more than one item.`);
  const noList = unsold.filter((i) => !i.listed || i.listPrice == null);
  if (noList.length) issues.push(`${noList.length} unsold item${noList.length === 1 ? " has" : "s have"} no listing date or price yet (${noList.slice(0, 3).map((i) => i.sku || i.name).join(", ")}${noList.length > 3 ? "…" : ""}).`);
  const est = sold.filter((i) => i.payoutEstimated).length;
  if (est) issues.push(`${est} sold item${est === 1 ? " has" : "s have"} no payout in the sheet, so ${est === 1 ? "its" : "their"} profit uses estimated Depop fees.`);
  const odd = sold.filter((i) => i.offerOff != null && i.offerOff < 0);
  if (odd.length) issues.push(`${odd.map((i) => i.sku || i.name).join(", ")} sold for more than the list price — check the listing price.`);

  const byProfit = [...sold].sort((a, b) => b.profit! - a.profit!);
  return {
    items, sold, unsold,
    totals: {
      items: items.length, sold: sold.length, unsold: unsold.length, sellThrough: items.length ? sold.length / items.length : 0,
      grossSales, payout, fees: r2(grossSales - payout), costOfSold, profit: r2(payout - costOfSold),
      totalSpent, cashBack: r2(payout - totalSpent),
      unsoldCost: sum(unsold.map((i) => i.cost)), unsoldPotential: sum(unsold.filter((i) => i.projected != null).map((i) => i.projected! + i.cost)),
      avgProfit: avg(sold.map((i) => i.profit!)), medianProfit: med(sold.map((i) => i.profit!)),
      avgRoi: avg(sold.filter((i) => i.roi != null).map((i) => i.roi!)),
      medianDaysToSell: med(days), soldWithin7: days.length ? days.filter((d) => d <= 7).length / days.length : 0,
      offerShare: sold.length ? offered.length / sold.length : 0, avgOfferOff: avg(offered.map((i) => i.offerOff!)),
      boostedShare: withRev.length ? boostedSold.length / withRev.length : null,
      boostFees: withRev.length ? sum(boostedSold.map((i) => (i.soldPrice! * s.fees.boostPct) / 100)) : null,
      estimatedPayouts: est,
    },
    months,
    groups: groupStats(items, (i) => i.group).sort((a, b) => b.sold + b.unsold - (a.sold + a.unsold)),
    hauls,
    best: byProfit.slice(0, 5),
    worst: [...sold].sort((a, b) => (a.roi ?? a.profit!) - (b.roi ?? b.profit!)).slice(0, 5),
    stale,
    issues,
  };
}

// Her sold items as sales history, for pricing new listings when no Depop export is loaded.
export function inventoryToSales(items: InvItem[]): Sale[] {
  return items
    .filter((i) => i.sold && i.soldPrice != null)
    .map((i) => ({ title: i.name, brand: "", category: itemGroup(i.name), size: "", price: i.soldPrice!, date: i.soldDate }));
}

// Next SKU in her numbering ("0189" → "0190").
export function nextSku(items: InvItem[]): string {
  const nums = items.map((i) => i.sku).filter((k) => /^\d+$/.test(k));
  if (!nums.length) return "";
  const width = Math.max(...nums.map((k) => k.length));
  return String(Math.max(...nums.map(Number)) + 1).padStart(width, "0");
}

// One row in her sheet's column order, ready to paste into Google Sheets.
export function sheetRow(v: { sku: string; name: string; cost: string; listPrice: string; date: Date }): string {
  const d = `${v.date.getMonth() + 1}/${v.date.getDate()}/${v.date.getFullYear()}`;
  const c = Number(v.cost), p = Number(v.listPrice);
  return ["FALSE", v.sku, v.name, Number.isFinite(c) && v.cost ? c.toFixed(2) : "", "", d, Number.isFinite(p) && v.listPrice ? p.toFixed(2) : ""].join("\t");
}

// Everything computed, as a CSV to keep or paste back into the sheet.
export function reportCsv(r: Report): string {
  const q = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["SKU", "Name", "Group", "Sold", "Cost", "Purchased", "Listed", "List price", "Sold date", "Sold price", "Payout", "Payout estimated", "Profit", "ROI %", "Days to sell", "Offer discount", "Boosted", "Days listed (unsold)", "Profit at list price", "Break-even price"];
  const rows = r.items.map((i) => [
    i.sku, i.name, i.group, i.sold ? "yes" : "no", i.cost.toFixed(2), i.purchased, i.listed, i.listPrice, i.soldDate, i.soldPrice, i.payout,
    i.sold ? (i.payoutEstimated ? "yes" : "no") : "", i.profit, i.roi != null ? Math.round(i.roi * 100) : null, i.daysToSell, i.offerOff,
    i.boosted == null ? "" : i.boosted ? "yes" : "no", i.ageDays, i.projected, i.breakEven,
  ]);
  return [head, ...rows].map((row) => row.map(q).join(",")).join("\n") + "\n";
}
