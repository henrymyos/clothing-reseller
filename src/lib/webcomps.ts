import Exa from "exa-js";
import { generateObject } from "ai";
import { z } from "zod";
import type { WebListing, WebMarketData } from "@/lib/schema";
import { withModelFallback } from "@/lib/model";

// Web search (via Exa) across the big US resale marketplaces, then an LLM pass to
// keep only genuinely comparable listings and pull out their asking prices.

const MARKETPLACE_DOMAINS = [
  "ebay.com",
  "depop.com",
  "poshmark.com",
  "mercari.com",
  "grailed.com",
  "vinted.com",
];

const extractionSchema = z.object({
  listings: z
    .array(
      z.object({
        title: z.string().describe("The listing's title, cleaned of site boilerplate."),
        price: z
          .number()
          .describe("The asking price in USD. Only include listings with a clear price."),
        url: z.string().describe("The listing URL, copied exactly from the search result."),
        source: z
          .string()
          .describe("Marketplace name, e.g. 'eBay', 'Depop', 'Poshmark', 'Mercari', 'Grailed', 'Vinted'."),
      })
    )
    .describe("Only individual for-sale listings that are genuinely comparable to the item."),
});

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Searches the web for listings similar to the item and returns price stats plus
 * every comparable listing found. Returns null when EXA_API_KEY is absent or too
 * few comparable listings are found. Errors bubble up so the caller can log them.
 */
export async function getWebComps(
  query: string,
  itemContext: string
): Promise<WebMarketData | null> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;

  const exa = new Exa(apiKey);
  const { results } = await exa.search(query, {
    numResults: 25,
    includeDomains: MARKETPLACE_DOMAINS,
    contents: { text: { maxCharacters: 400 } },
  });

  if (!results || results.length === 0) return null;

  const candidates = results.map((r) => ({
    title: r.title ?? "",
    url: r.url,
    snippet: ("text" in r && typeof r.text === "string" ? r.text : "").slice(0, 400),
  }));

  const { object } = await withModelFallback((model) =>
    generateObject({
      model,
      schema: extractionSchema,
      system: `You extract comparable listings from web search results for a secondhand clothing reseller.
Keep only results that are individual for-sale listings of an item genuinely similar to the target item, with a clear asking price in USD found in the title or snippet.
Discard category/search pages, sold-out or unrelated items, lots/bundles, and anything without a discernible price. Never invent or estimate a price. Copy URLs exactly.`,
      prompt: `Target item: ${itemContext}

Search results (JSON): ${JSON.stringify(candidates)}`,
    })
  );

  // Validate against hallucination: keep only URLs that were actually in the results.
  const realUrls = new Set(candidates.map((c) => c.url));
  const seen = new Set<string>();
  const listings: WebListing[] = object.listings
    .filter((l) => realUrls.has(l.url) && Number.isFinite(l.price) && l.price > 0)
    .filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
    .sort((a, b) => a.price - b.price);

  if (listings.length < 3) return null;

  const prices = listings.map((l) => l.price);
  return {
    query,
    sampleSize: listings.length,
    currency: "USD",
    low: Math.round(Math.min(...prices)),
    high: Math.round(Math.max(...prices)),
    average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    median: Math.round(median(prices)),
    listings,
  };
}
