import Exa from "exa-js";
import type { Analysis, CompListing, Comps } from "@/lib/schema";
import { COLORS } from "@/lib/depop";

// Comparable Depop listings for pricing, with no AI in the loop: up to three
// Exa searches of depop.com, then each result is read from the structured line
// Depop puts on every product page —
//   "# Carhartt Men's Tan and Brown Jacket 10% off $36.90 $41.00 Size S Good condition"
// — and scored with fixed rules:
//   - a different garment family never counts (hoodie ≈ sweatshirt, tee ≠ hoodie);
//   - real brands (designer/mainstream) must match the listing's brand;
//   - blank/unbranded items count on a shared design (2+ distinctive words in
//     common), or the same blank maker as a baseline;
//   - non-USD (UK £) listings are skipped; price outliers (1.5×IQR) trimmed.
// Search results are live asking prices — sold prices aren't exposed — so the
// price suggestion sits a little under the matched median.

export const MIN_SIMILARITY = 70;
const MIN_COMPS = 3;

export type ParsedListing = {
  url: string;
  title: string;
  price: number;
  brand: string;
  department: string;
  type: string;
  family: string;
  size: string | null;
  condition: string | null;
  text: string; // title + description words, for design matching
};

const DEPTS = /(Men's|Women's|Boys'|Girls'|Kids'|Unisex)/;
const CONDITION = /(Brand new|Like new|Excellent condition|Good condition|Fair condition)/;
const COLOR_WORDS = new Set([...COLORS.map((c) => c.toLowerCase()), "and", "multi", "beige", "charcoal", "olive", "teal", "lilac", "mustard", "maroon"]);

// Read Depop's structured product line. Returns null when there's no USD price
// on it (UK listings show £, and some pages only render "Loading…").
export function parseDepopResult(r: { url: string; title: string; text: string }): ParsedListing | null {
  const text = r.text.replace(/\s+/g, " ").replace(/[’‘]/g, "'");
  const m = text.match(/# ([^#$£€]{0,160}?)\s((?:\d{1,2}% off\s+)?\$[\d,]+(?:\.\d\d)?(?:\s+\$[\d,]+(?:\.\d\d)?)?)/);
  if (!m) return null;
  const head = m[1].trim();
  const prices = [...m[2].matchAll(/\$([\d,]+(?:\.\d\d)?)/g)].map((x) => Number(x[1].replace(/,/g, "")));
  const price = Math.min(...prices); // with a discount, the lower one is the current price
  if (!Number.isFinite(price) || price <= 0) return null;

  // Real product lines always carry a department ("Men's", "Women's"…); headings
  // like "# Similar items Levi's 25\" $19" don't, so they're skipped.
  const d = head.match(DEPTS);
  if (!d) return null;
  const brand = head.slice(0, d.index).trim();
  const desc = head.slice((d.index ?? 0) + d[0].length).trim();
  const typeWords = desc.split(" ").filter((w) => !COLOR_WORDS.has(w.toLowerCase()));
  const type = typeWords.join(" ") || desc;

  const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 160);
  const sizeM = after.match(/(?:Size\s+(.{1,14}?)\s+(?=Brand new|Like new|\w+ condition|This seller|$))|(One size)/);
  const condM = after.match(CONDITION);
  const title = r.title.replace(/\s*\|\s*Depop.*$/i, "").trim();
  return {
    url: r.url,
    title,
    price,
    brand,
    department: d[0],
    type,
    // Depop's own type decides; the title only breaks a tie ("Shorts" beats "cargo shorts" → trousers).
    family: garmentFamily(type) !== "other" ? garmentFamily(type) : garmentFamily(title),
    size: sizeM ? (sizeM[1] ?? sizeM[2] ?? "").trim() || null : null,
    condition: condM ? condM[1].replace(/ condition$/, "") : null,
    text: `${title} ${text.slice(0, m.index ?? 0)}`.toLowerCase(),
  };
}

// Garment families — the first keyword found wins, so the type from Depop's
// structured line (checked first) beats words in the title.
const FAMILIES: [string, RegExp][] = [
  ["hoodie", /\b(hoodies?|hoody|sweatshirts?|crew ?necks?|pullover hood)/],
  // Waffle-knit thermals and henleys are long-sleeve tees on Depop, not knitwear.
  ["tee", /\b(thermals?|henleys?|waffle)\b/],
  ["knit", /\b(jumpers?|sweaters?|cardigans?|knit)/],
  ["tee", /\b(t-?shirts?|tees?)\b/],
  ["shirt", /\b(shirts?|blouses?|button[- ]?(up|down))\b/],
  ["jacket", /\b(jackets?|coats?|gilets?|windbreakers?|parkas?|puffers?|blazers?|bombers?|fleeces?|anoraks?)\b/],
  ["jeans", /\b(jeans|denim pants)\b/],
  ["trousers", /\b(trousers|pants|sweatpants|joggers?|tracksuits?|chinos|cargos?|dungarees|overalls|leggings)\b/],
  ["shorts", /\bshorts\b/],
  ["dress", /\b(dress|dresses|gown)\b/],
  ["skirt", /\bskirts?\b/],
  ["top", /\b(tops?|tank|vests?|camis?|crop|bodysuits?|polos?|jerseys?|corsets?)\b/],
  ["shoes", /\b(trainers|sneakers|boots|shoes|heels|sandals|loafers)\b/],
];
export function garmentFamily(s: string): string {
  const t = s.toLowerCase();
  for (const [fam, rx] of FAMILIES) if (rx.test(t)) return fam;
  return "other";
}

export function normBrand(s: string): string {
  return (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

// Same brand if one normalised name contains the other ("carhartt" vs "carharttwip").
export function brandMatches(target: string, listing: string): boolean {
  const a = normBrand(target), b = normBrand(listing);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function needsBrandMatch(a: Pick<Analysis, "brand" | "brandTier">): boolean {
  return (a.brandTier === "designer" || a.brandTier === "mainstream") && !/^(unknown|unbranded)$/i.test(a.brand.trim());
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "with", "in", "on", "for", "to", "by", "text", "graphic", "print", "printed",
  "logo", "design", "style", "vintage", "brand", "mens", "womens", "men", "women", "size", "new", "black", "white",
]);
// Distinctive words describing the target's design (not brand, type or colour).
export function designWords(a: Pick<Analysis, "brand" | "itemType" | "distinctiveFeatures" | "searchQuery">): string[] {
  const skip = new Set([...normWords(a.brand), ...normWords(a.itemType), ...COLOR_WORDS]);
  const words = normWords(`${a.distinctiveFeatures.join(" ")} ${a.searchQuery}`).filter((w) => w.length > 2 && !STOP.has(w) && !skip.has(w));
  return [...new Set(words)];
}
function normWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

export function designMatch(keyWords: string[], listingText: string): "same" | "similar" | "different" {
  if (!keyWords.length) return "different";
  const have = new Set(normWords(listingText));
  const shared = keyWords.filter((w) => have.has(w)).length;
  if (shared >= 3 || (keyWords.length >= 2 && shared === keyWords.length)) return "same";
  if (shared >= 2) return "similar";
  return "different";
}

const KIDS = /^(Boys'|Girls'|Kids')$/;

export function similarityFor(
  target: Pick<Analysis, "brand" | "brandTier" | "itemType"> & { department?: string },
  l: Pick<ParsedListing, "brand" | "family"> & { department?: string },
  design: "same" | "similar" | "different"
): number {
  const fam = garmentFamily(target.itemType);
  if (fam !== "other" && l.family !== fam) return 30;
  // Kids' sizes price differently: only compare kids' to kids'.
  if (l.department && (target.department === "Kids") !== KIDS.test(l.department)) return 35;
  const brandOk = brandMatches(target.brand, l.brand);
  if (needsBrandMatch(target)) {
    if (!brandOk) return 45;
    return design === "same" ? 95 : design === "similar" ? 85 : 75;
  }
  if (design === "same") return 95;
  if (design === "similar") return 85;
  return brandOk ? 72 : 55; // same blank maker, different graphic = baseline; otherwise not comparable
}

export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Drop prices outside 1.5×IQR (only with enough data to tell).
export function trimOutliers<T extends { price: number }>(items: T[]): T[] {
  if (items.length < 5) return items;
  const s = items.map((i) => i.price).sort((a, b) => a - b);
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  return items.filter((i) => i.price >= lo && i.price <= hi);
}

export function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function reasonFor(target: Pick<Analysis, "brand" | "brandTier">, l: ParsedListing, design: string): string {
  const parts = [brandMatches(target.brand, l.brand) ? "same brand" : l.brand ? l.brand : "no brand", `same ${l.family}`];
  if (design !== "different") parts.push(`${design} design`);
  return parts.join(" · ");
}

// Score, filter and summarise parsed listings. Exported for tests.
export function selectComps(
  target: Pick<Analysis, "brand" | "brandTier" | "itemType" | "distinctiveFeatures" | "searchQuery"> & { department?: string },
  parsed: ParsedListing[],
  query: string
): Comps | null {
  const keyWords = designWords(target);
  const seen = new Set<string>();
  const valid = parsed.filter((l) => !seen.has(l.url) && seen.add(l.url));
  const scored = valid.map((l) => {
    const design = designMatch(keyWords, l.text);
    const listing: CompListing = {
      title: l.title, price: l.price, url: l.url, brand: l.brand || "Unbranded", size: l.size,
      similarity: similarityFor(target, l, design), reason: reasonFor(target, l, design),
    };
    return listing;
  });
  const kept = trimOutliers(scored.filter((l) => l.similarity >= MIN_SIMILARITY))
    .sort((a, b) => b.similarity - a.similarity || a.price - b.price);
  if (kept.length < MIN_COMPS) return null;
  const prices = kept.map((l) => l.price).sort((a, b) => a - b);
  return {
    query,
    sampleSize: kept.length,
    excluded: valid.length - kept.length,
    low: Math.round(prices[0]),
    median: Math.round(median(prices)),
    high: Math.round(prices[prices.length - 1]),
    listings: kept,
  };
}

export async function getDepopComps(a: Analysis): Promise<Comps | null> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;
  const exa = new Exa(apiKey);
  // Exact, broader, and brand + type as a safety net (the model's queries vary run to run).
  const brandType = /^(unknown|unbranded)$/i.test(a.brand.trim()) ? "" : `${a.brand} ${a.itemType}`;
  const queries = [...new Set([a.searchQuery, a.searchQueryBroad, brandType].map((q) => q.trim().toLowerCase()).filter(Boolean))];
  const settled = await Promise.allSettled(
    queries.map((q) => exa.search(q, { numResults: 25, includeDomains: ["depop.com"], contents: { text: { maxCharacters: 1200 } } }))
  );
  const parsed: ParsedListing[] = [];
  let results = 0;
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const r of s.value.results ?? []) {
      if (!/depop\.com\/products\//.test(r.url)) continue;
      results += 1;
      const p = parseDepopResult({ url: r.url, title: r.title ?? "", text: "text" in r && typeof r.text === "string" ? r.text : "" });
      if (p) parsed.push(p);
    }
  }
  const comps = selectComps(a, parsed, queries[0]);
  console.log(`comps: ${queries.length} queries, ${results} results, ${parsed.length} parsed (USD), ${comps ? comps.sampleSize : 0} kept`);
  return comps;
}
