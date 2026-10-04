// The seller's own sales history — her real SOLD prices, the best price signal
// there is. Imported from the CSV Depop lets a seller download (or any
// spreadsheet with an item + price column). Parsing happens in the browser and
// only six fields are kept; buyer names, addresses and every other column are
// dropped before anything is stored or sent. Stored on her device only.

import type { Analysis } from "@/lib/schema";
import { brandMatches, designMatch, designWords, garmentFamily, median, needsBrandMatch } from "@/lib/comps";

export type Sale = { title: string; brand: string; category: string; size: string; price: number; date: string };

export const MAX_SALES = 1000;

// RFC-4180-ish CSV: quoted fields, doubled quotes, commas/newlines inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export function parsePrice(v: string): number | null {
  const m = (v || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

type ColumnMap = { title: number; brand: number; category: number; size: number; price: number; date: number };

// Find the columns we need by header name. The price column prefers the item's
// own price over totals; fee/shipping/tax/discount columns are never used.
export function mapColumns(header: string[]): ColumnMap | null {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...tests: RegExp[]) => {
    for (const t of tests) {
      const i = h.findIndex((x) => t.test(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  const notMoney = /fee|ship|postage|tax|discount|refund|payout|net/;
  const priceIdx = (() => {
    for (const t of [/^item price$/, /(sold|sale|item|selling|listing) price/, /^price( \(.*\))?$/, /^amount$/, /^(total|gross)/]) {
      const i = h.findIndex((x) => t.test(x) && !notMoney.test(x));
      if (i >= 0) return i;
    }
    return -1;
  })();
  const title = find(/^(item )?description$/, /description/, /^(title|item|item name|product|product name|name of item)$/, /title/);
  if (title < 0 || priceIdx < 0) return null;
  return {
    title,
    brand: find(/^brand/),
    category: find(/categor/, /^type$/),
    size: find(/^size/),
    price: priceIdx,
    date: find(/date of sale/, /sold (on|date)/, /^date/, /date/),
  };
}

export function importSalesCsv(text: string): { sales: Sale[]; skipped: number } | { error: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "That file has no rows." };
  // The header is the first row we can map (some exports put a title line above it).
  let headerAt = -1, cols: ColumnMap | null = null;
  for (let i = 0; i < Math.min(rows.length, 6) && !cols; i++) {
    cols = mapColumns(rows[i]);
    if (cols) headerAt = i;
  }
  if (!cols) return { error: "Couldn't find an item description and a price column in that file." };
  const c = cols;
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const sales: Sale[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerAt + 1)) {
    const title = get(r, c.title).replace(/\s+/g, " ").slice(0, 200);
    const price = parsePrice(get(r, c.price));
    if (!title || price == null) { skipped++; continue; }
    sales.push({ title, price, brand: get(r, c.brand).slice(0, 60), category: get(r, c.category).slice(0, 60), size: get(r, c.size).slice(0, 20), date: get(r, c.date).slice(0, 30) });
  }
  if (!sales.length) return { error: "No sold items with a price were found in that file." };
  return { sales: sales.slice(-MAX_SALES), skipped };
}

export type SaleMatch = Sale & { similarity: number };
export type MySales = {
  matches: SaleMatch[];      // her sold items most like this one
  matchedMedian: number | null;
  familyCount: number;       // her sales of the same kind of garment
  familyMedian: number | null;
  total: number;
};

// Same rules as the Depop comps: same garment family, same brand for real
// brands, shared design for blanks — plus her own brand when it matches.
export function matchMySales(target: Pick<Analysis, "brand" | "brandTier" | "itemType" | "distinctiveFeatures" | "searchQuery">, sales: Sale[]): MySales {
  const fam = garmentFamily(target.itemType);
  const keyWords = designWords(target);
  const sameFamily = sales.filter((s) => {
    const f = garmentFamily(`${s.category} ${s.title}`);
    return fam === "other" || f === fam;
  });
  const scored: SaleMatch[] = sameFamily.map((s) => {
    const brandOk = brandMatches(target.brand, s.brand) || brandMatches(target.brand, s.title.split(" ")[0] ?? "");
    const design = designMatch(keyWords, `${s.title} ${s.brand}`);
    let similarity: number;
    if (needsBrandMatch(target)) similarity = brandOk ? (design === "different" ? 80 : 92) : design === "different" ? 0 : 70;
    else similarity = design === "same" ? 95 : design === "similar" ? 85 : brandOk ? 72 : 0;
    return { ...s, similarity };
  });
  const matches = scored.filter((s) => s.similarity >= 70).sort((a, b) => b.similarity - a.similarity || b.date.localeCompare(a.date)).slice(0, 12);
  const famPrices = sameFamily.map((s) => s.price).sort((a, b) => a - b);
  const matchPrices = matches.map((s) => s.price).sort((a, b) => a - b);
  return {
    matches,
    matchedMedian: matchPrices.length ? Math.round(median(matchPrices)) : null,
    familyCount: sameFamily.length,
    familyMedian: famPrices.length >= 3 ? Math.round(median(famPrices)) : null,
    total: sales.length,
  };
}

// Defensive check on anything the client sends.
export function cleanSales(x: unknown): Sale[] {
  if (!Array.isArray(x)) return [];
  const out: Sale[] = [];
  for (const s of x.slice(0, MAX_SALES)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const price = typeof o.price === "number" && Number.isFinite(o.price) && o.price > 0 && o.price < 100000 ? o.price : null;
    const title = typeof o.title === "string" ? o.title.slice(0, 200) : "";
    if (!title || price == null) continue;
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
    out.push({ title, price, brand: str(o.brand, 60), category: str(o.category, 60), size: str(o.size, 20), date: str(o.date, 30) });
  }
  return out;
}
