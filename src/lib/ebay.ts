import type { MarketData, MarketSample } from "@/lib/schema";

// eBay Browse API = current ACTIVE listings (accessible with a standard dev account).
// For true SOLD prices, eBay's Marketplace Insights API exists but requires special
// approval; if you have it, swap the URL/scope below — the shape is the same.
const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SCOPE = "https://api.ebay.com/oauth/api_scope";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
  });

  if (!res.ok) {
    throw new Error(`eBay auth failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/**
 * Returns real eBay price stats for a query, or null when credentials are absent
 * or nothing comparable is found. Errors bubble up so the caller can log them.
 */
export async function getEbayComps(query: string): Promise<MarketData | null> {
  const token = await getAppToken();
  if (!token) return null;

  const params = new URLSearchParams({
    q: query,
    limit: "50",
    filter: "buyingOptions:{FIXED_PRICE}",
  });

  const res = await fetch(`${BROWSE_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`eBay search failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    itemSummaries?: Array<{
      title?: string;
      itemWebUrl?: string;
      price?: { value?: string; currency?: string };
    }>;
  };

  const items = (data.itemSummaries ?? [])
    .map((it) => ({
      title: it.title ?? "",
      url: it.itemWebUrl ?? "",
      price: Number(it.price?.value),
      currency: it.price?.currency ?? "USD",
    }))
    .filter((it) => it.currency === "USD" && Number.isFinite(it.price) && it.price > 0);

  if (items.length < 3) return null;

  const prices = items.map((it) => it.price).sort((a, b) => a - b);
  const samples: MarketSample[] = items
    .slice(0, 5)
    .map((it) => ({ title: it.title, price: it.price, url: it.url }));

  return {
    source: "ebay-active",
    sampleSize: prices.length,
    currency: "USD",
    low: Math.round(percentile(prices, 10)),
    median: Math.round(percentile(prices, 50)),
    high: Math.round(percentile(prices, 90)),
    samples,
  };
}
